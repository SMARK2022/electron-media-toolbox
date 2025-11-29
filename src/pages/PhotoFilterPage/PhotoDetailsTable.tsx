import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import ImagePreview, { PreviewFocusRegion } from "@/components/ImagePreview";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Activity,
  Calendar,
  FileText,
  Hash,
  HardDrive,
  Image as ImageIcon,
  Info,
  MapPin,
  Percent,
} from "lucide-react";
import { PhotoExtend } from "@/helpers/ipc/database/db";
import { cn } from "@/lib/utils";
import { FaceTracker, FaceInfo as TrackerFaceInfo } from "./faceTracker";
import { FaceStripBar, FaceInfo } from "./FaceStripBar";

interface PhotoDetailsTableProps {
  photo?: PhotoExtend;
  isPreviewEnabled: boolean;
  updatePhotoEnabledStatus: (filePath: string, isEnabled: boolean) => Promise<void>;
  onPhotoStatusChanged?: () => void;
  previewHeightPercent: number;
  onStartPreviewMouseDrag: (clientY: number) => void;
  onStartPreviewTouchDrag: (clientY: number) => void;
}

// --- 工具函数：文件大小格式化 ---
const formatBytes = (bytes?: number | null, decimals = 2) => {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// --- 工具函数：相似度格式化（自动识别 0–1 或 0–100） ---
const formatSimilarity = (value?: number | null) => {
  if (value === undefined || value === null) return "-";
  const v = value <= 1.5 ? value * 100 : value;
  return `${v.toFixed(1)} %`;
};

// --- 工具函数：IQA 格式化 ---
const formatIQA = (value?: number | null) => {
  if (value === undefined || value === null) return "-";
  return value.toFixed(2);
};

type InfoRowProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value?: React.ReactNode;
  valueClassName?: string;
};

const InfoRow: React.FC<InfoRowProps> = ({
  icon: Icon,
  label,
  value,
  valueClassName,
}) => {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div className="group border-border/60 flex flex-col gap-0.5 border-b py-1.5 last:border-b-0">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "text-foreground/90 pl-4 text-[13px] leading-snug break-all",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
};

const GroupBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="bg-background inline-flex items-center rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
    {children}
  </span>
);

const PreviewPlaceholder: React.FC<{ height?: string }> = ({ height }) => {
  const { t } = useTranslation();

  const title =
    t("filterPage.previewPlaceholderTitle", {
      defaultValue: "Select a photo from the gallery to preview",
    }) || "Select a photo from the gallery to preview";
  const desc =
    t("filterPage.previewPlaceholderDesc", {
      defaultValue:
        "Click any thumbnail on the left to view details and toggle its enabled status.",
    }) ||
    "Click any thumbnail on the left to view details and toggle its enabled status.";

  return (
    <div
      style={height ? { height } : undefined}
      className="border-muted-foreground/20 bg-muted/40 m-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center"
    >
      <div className="bg-muted mb-3 rounded-full p-3 shadow-sm">
        <ImageIcon className="text-muted-foreground/40 h-8 w-8" />
      </div>
      <p className="text-foreground text-sm font-medium">{title}</p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs">{desc}</p>
    </div>
  );
};

// FaceThumbnail / FaceStrip 已抽离到 FaceStripBar.tsx

/**
 * PhotoDetailsTable: 预览详情面板组件
 * 使用 React.memo + 自定义比较函数优化渲染性能
 */
const PhotoDetailsTable: React.FC<PhotoDetailsTableProps> = React.memo(({
  photo,
  isPreviewEnabled,
  updatePhotoEnabledStatus,
  onPhotoStatusChanged,
  previewHeightPercent,
  onStartPreviewMouseDrag,
  onStartPreviewTouchDrag,
}) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [focusRegion, setFocusRegion] = useState<PreviewFocusRegion | null>(null);
  const [activeFaceIndex, setActiveFaceIndex] = useState<number | null>(null);

  // 人脸追踪器实例 & 状态
  const faceTrackerRef = useRef<FaceTracker>(new FaceTracker());
  const [isTrackingActive, setIsTrackingActive] = useState(false);
  const [isFirstFocusAfterSwitch, setIsFirstFocusAfterSwitch] = useState(false);

  // 图片切换检测 & 匹配标记
  const prevFilePathRef = useRef<string>("");
  const matchedForCurrentPhotoRef = useRef<string>("");
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  // 解构 photo 字段（提前解构避免条件判断后使用）
  const {
    fileName = "",
    filePath = "",
    fileSize,
    info,
    date,
    groupId,
    similarity,
    IQA,
    isEnabled,
    faceData,
  } = photo ?? {};

  // 解析人脸数据（仅依赖 faceData）
  const faces = useMemo<FaceInfo[]>(() => {
    if (!faceData) return [];
    try {
      const parsed = JSON.parse(faceData);
      if (!Array.isArray(parsed?.faces)) return [];
      return parsed.faces
        .map((item: any) => ({
          bbox: item?.bbox as [number, number, number, number],
          score: typeof item?.score === "number" ? item.score : undefined,
          eye_open: typeof item?.eye_open === "number" ? item.eye_open : undefined,
        }))
        .filter((f: FaceInfo) => Array.isArray(f.bbox) && f.bbox.length === 4);
    } catch {
      return [];
    }
  }, [faceData]);

  // 图片切换时重置追踪状态（非追踪模式下清除聚焦，追踪模式下等待匹配）
  useEffect(() => {
    if (filePath === prevFilePathRef.current) return; // 同一张图片无需处理
    prevFilePathRef.current = filePath; // 更新记录的图片路径
    matchedForCurrentPhotoRef.current = ""; // 重置匹配标记

    // 非追踪模式 或 追踪器无状态 或 无人脸数据：清除聚焦状态，恢复自适应视图
    if (!isTrackingActive || !faceTrackerRef.current.hasTracking()) {
      setActiveFaceIndex(null); // 清除选中人脸
      setFocusRegion(null); // 清除聚焦区域（通知 ImagePreview 重置）
      setIsFirstFocusAfterSwitch(false); // 无需动画标记
      return;
    }

    // 追踪模式：标记首次聚焦（禁用动画），等待自动匹配 effect 处理
    setIsFirstFocusAfterSwitch(true);
    const timer = setTimeout(() => setIsFirstFocusAfterSwitch(false), 150); // 150ms 后恢复动画
    return () => clearTimeout(timer);
  }, [filePath, isTrackingActive]);

  // 追踪模式下自动匹配人脸
  useEffect(() => {
    if (matchedForCurrentPhotoRef.current === filePath) return;
    if (!isTrackingActive || !faceTrackerRef.current.hasTracking()) return;
    if (!faces.length || imageSize.width <= 0 || imageSize.height <= 0) return;

    matchedForCurrentPhotoRef.current = filePath;
    const { matchedIndex } = faceTrackerRef.current.findMatch(faces as TrackerFaceInfo[], imageSize);

    if (matchedIndex !== null) {
      const matchedFace = faces[matchedIndex];
      setActiveFaceIndex(matchedIndex);
      setFocusRegion({ bbox: matchedFace.bbox, zoomFactor: 1.25, requestId: Date.now() });
      faceTrackerRef.current.setTrackedFace(matchedFace as TrackerFaceInfo, matchedIndex, imageSize, faces.length);
    } else {
      setActiveFaceIndex(null);
      setFocusRegion(null);
    }
  }, [filePath, imageSize, faces, isTrackingActive]);

  // 加载图片获取尺寸
  useEffect(() => {
    if (!filePath) {
      setImageSize({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    img.src = `local-resource://${filePath}`;
    return () => { img.onload = null; };
  }, [filePath]);

  // 格式化显示数据
  const formatted = useMemo(() => ({
    size: formatBytes(fileSize),
    similarity: formatSimilarity(similarity),
    iqa: formatIQA(IQA),
    dateDisplay: date ?? "-",
  }), [fileSize, similarity, IQA, date]);

  // 稳定的预览源（避免字符串拼接导致引用变化）
  const previewSrc = useMemo(() => filePath ? `local-resource://${filePath}` : "", [filePath]);

  // 切换启用状态（简化：直接调用 store action，由 store 统一处理状态同步）
  const handleToggle = useCallback(async (checked: boolean) => {
    if (isUpdating || !filePath) return;
    setIsUpdating(true);
    try {
      await updatePhotoEnabledStatus(filePath, checked);
      onPhotoStatusChanged?.();
    } catch (err) {
      console.error("[PhotoDetailsTable] 更新启用状态失败:", err);
    } finally {
      setIsUpdating(false);
    }
  }, [isUpdating, filePath, updatePhotoEnabledStatus, onPhotoStatusChanged]);

  // 人脸选择（激活追踪模式）
  const handleFaceSelect = useCallback((face: FaceInfo, index: number) => {
    setActiveFaceIndex(index);
    setFocusRegion({ bbox: face.bbox, zoomFactor: 1.25, requestId: Date.now() });
    // 仅在有效图片尺寸时才激活追踪
    if (imageSize.width > 0) {
      faceTrackerRef.current.setTrackedFace(face as TrackerFaceInfo, index, imageSize, faces.length);
      setIsTrackingActive(true);
    }
  }, [imageSize, faces.length]);

  // 用户交互取消追踪（一次性触发，无防抖，避免持续交互时无法取消）
  const handleUserInteraction = useCallback(() => {
    if (!isTrackingActive) return; // 非追踪模式下直接返回，避免无意义更新
    faceTrackerRef.current.clearTracking(); // 清除追踪器内部状态
    setIsTrackingActive(false); // 关闭追踪模式
    setActiveFaceIndex(null); // 清除选中人脸
    setFocusRegion(null); // 清除聚焦区域（传递 null 通知 ImagePreview 重置）
  }, [isTrackingActive]);

  const faceLabel = t("photoDetailsTable.faceDetected", { count: faces.length, defaultValue: `检测到 ${faces.length} 个人脸` });
  const faceHelper = isTrackingActive
    ? t("photoDetailsTable.faceTrackingMode", { defaultValue: "正在追踪人物，任意拖动以取消" })
    : t("photoDetailsTable.faceTapToFocus", { defaultValue: "点击头像以聚焦对应区域" });



  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div
        className="flex-shrink-0"
        style={{
          height: `${previewHeightPercent}%`,
          minHeight: "20%",
          maxHeight: "70%",
        }}
      >
        <ImagePreview
          src={previewSrc}
          height="100%"
          width="100%"
          focusRegion={focusRegion ?? undefined}
          onUserInteraction={handleUserInteraction}
          disableFocusAnimation={isFirstFocusAfterSwitch}
        />
      </div>

      <div
        className="bg-muted/20 hover:bg-muted/40 relative z-10 flex flex-shrink-0 cursor-ns-resize items-center justify-center transition-colors select-none"
        style={{ height: 12, touchAction: "none" }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onStartPreviewMouseDrag(e.clientY);
        }}
        onTouchStart={(e) => {
          if (e.touches?.[0]) {
            e.stopPropagation();
            onStartPreviewTouchDrag(e.touches[0].clientY);
          }
        }}
      >
        <div className="bg-muted-foreground/30 hover:bg-muted-foreground/50 h-1.5 w-12 rounded-full transition-colors" />
      </div>

      <div
        className="flex-1 overflow-hidden"
        style={{ maxHeight: `${100 - previewHeightPercent}%` }}
      >
        <div className="bg-card flex h-full flex-col overflow-hidden rounded-xl border shadow-sm">
          <div
            className={cn(
              "flex flex-col gap-1 border-b px-3.5 py-2 transition-colors duration-300",
              isPreviewEnabled
                ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                : "bg-muted/40",
            )}
          >
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                    {t("photoDetailsTable.currentPreviewPhoto")}
                  </p>
                  {groupId !== undefined && groupId !== null && (
                    <GroupBadge>
                      <Hash className="mr-1 h-3 w-3 text-slate-400" />
                      {t("photoDetailsTable.groupNumber")} {groupId}
                    </GroupBadge>
                  )}
                </div>
                <div className="flex items-start gap-1.5">
                  <FileText className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                  <p className="text-foreground line-clamp-2 text-[13px] leading-snug font-semibold">
                    {fileName || t("photoDetailsTable.noPhotoSelected")}
                  </p>
                </div>
                {/* {isEnabled !== undefined && (
                  <p className="ml-5 text-[11px] leading-tight text-slate-600 dark:text-slate-400">
                    {isPreviewEnabled
                      ? t("photoDetailsTable.statusEnabledDesc")
                      : t("photoDetailsTable.statusDisabledDesc")}
                  </p>
                )} */}
              </div>
              {isEnabled !== undefined && (
                <div className="flex shrink-0 flex-col items-end gap-0.5 self-center">
                  <Label
                    htmlFor="photo-enabled-switch"
                    className={cn(
                      "cursor-pointer font-medium py-1",
                      isPreviewEnabled
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-slate-500 dark:text-slate-300",
                    )}
                  >
                    {isPreviewEnabled
                      ? t("photoDetailsTable.enabled")
                      : t("photoDetailsTable.disabled")}
                  </Label>
                  <div className="flex items-center gap-1.5 text-[12px]">
                    <Switch
                      id="photo-enabled-switch"
                      checked={isPreviewEnabled}
                      disabled={isUpdating}
                      onCheckedChange={handleToggle}
                      className={cn(
                        "data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300",
                        "dark:data-[state=checked]:bg-emerald-500/90 dark:data-[state=unchecked]:bg-slate-700",
                      )}
                    />
                  </div>
                  {isUpdating && (
                    <p className="text-muted-foreground text-[11px]">
                      {t("photoDetailsTable.updatingStatus")}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <FaceStripBar
            faces={faces}
            imageSrc={previewSrc}
            activeIndex={activeFaceIndex}
            onFaceSelect={handleFaceSelect}
            label={faceLabel}
            helperLabel={faceHelper}
            isTrackingMode={isTrackingActive}
          />

          <ScrollArea className="flex-1">
            <div className="space-y-1.5 px-3.5 py-2">
              <InfoRow
                icon={MapPin}
                label={t("photoDetailsTable.filePath")}
                value={filePath}
                valueClassName="font-mono text-[11px] text-muted-foreground"
              />
              <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
                <InfoRow
                  icon={HardDrive}
                  label={t("photoDetailsTable.fileSize")}
                  value={formatted.size}
                  valueClassName="font-mono"
                />
                <InfoRow
                  icon={Calendar}
                  label={t("photoDetailsTable.fileDate")}
                  value={formatted.dateDisplay}
                  valueClassName="font-mono"
                />
              </div>
              <InfoRow
                icon={Info}
                label={t("photoDetailsTable.fileInfo")}
                value={info}
              />
              <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
                <InfoRow
                  icon={Percent}
                  label={t("photoDetailsTable.similarity")}
                  value={
                    similarity !== undefined ? formatted.similarity : undefined
                  }
                  valueClassName={cn(
                    "font-mono",
                    typeof similarity === "number" && similarity < 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "",
                  )}
                />
                <InfoRow
                  icon={Activity}
                  label={t("photoDetailsTable.iqaScore")}
                  value={IQA !== undefined ? formatted.iqa : undefined}
                  valueClassName={cn(
                    "font-mono",
                    typeof IQA === "number" && IQA < 60
                      ? "text-red-600 dark:text-red-400"
                      : "text-emerald-600 dark:text-emerald-400",
                  )}
                />
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // 自定义比较函数：仅在关键 props 变化时重渲染（返回 true=相同无需渲染，false=不同需重渲染）
  if (prev.previewHeightPercent !== next.previewHeightPercent) return false; // 预览高度变化需重渲染
  if (prev.isPreviewEnabled !== next.isPreviewEnabled) return false; // 启用状态变化需重渲染

  // photo 深度比较（避免引用变化导致无意义重渲染）
  const pPhoto = prev.photo, nPhoto = next.photo;
  if (!pPhoto && !nPhoto) return true; // 都为 null/undefined 时相同，无需重渲染
  if (!pPhoto || !nPhoto) return false; // 一个为 null/undefined 时不同，需重渲染
  // 逐字段比较关键字段，全部相同时无需重渲染
  return (
    pPhoto.filePath === nPhoto.filePath && // 文件路径相同
    pPhoto.isEnabled === nPhoto.isEnabled && // 启用状态相同
    pPhoto.faceData === nPhoto.faceData && // 人脸数据相同
    pPhoto.info === nPhoto.info && // 文件信息相同
    pPhoto.similarity === nPhoto.similarity && // 相似度相同
    pPhoto.IQA === nPhoto.IQA // IQA 评分相同
  );
});

PhotoDetailsTable.displayName = "PhotoDetailsTable";

export default PhotoDetailsTable;
