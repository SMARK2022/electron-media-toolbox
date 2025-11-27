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
  setIsPreviewEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  updatePhotoEnabledStatus: (
    filePath: string,
    isEnabled: boolean,
  ) => Promise<void>;
  setPhotos: React.Dispatch<React.SetStateAction<any[]>>;
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

const PhotoDetailsTable: React.FC<PhotoDetailsTableProps> = ({
  photo,
  isPreviewEnabled,
  setIsPreviewEnabled,
  updatePhotoEnabledStatus,
  setPhotos,
  onPhotoStatusChanged,
  previewHeightPercent,
  onStartPreviewMouseDrag,
  onStartPreviewTouchDrag,
}) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);
  const [focusRegion, setFocusRegion] = useState<PreviewFocusRegion | null>(
    null,
  );
  const [activeFaceIndex, setActiveFaceIndex] = useState<number | null>(null);

  // 人脸追踪器实例（持久化）
  const faceTrackerRef = useRef<FaceTracker>(new FaceTracker());

  // 追踪模式是否激活（用户选择人脸后激活，手动交互后取消）
  const [isTrackingActive, setIsTrackingActive] = useState(false);

  // 是否为图片切换后的首次聚焦（用于禁用动画）
  const [isFirstFocusAfterSwitch, setIsFirstFocusAfterSwitch] = useState(false);

  // 记录上一张图片的 filePath，用于检测图片切换
  const prevFilePathRef = useRef<string>("");

  // 标记当前图片是否已经完成人脸匹配（避免重复匹配）
  const matchedForCurrentPhotoRef = useRef<string>("");

  // 图片尺寸缓存（用于人脸追踪）
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // 从 photo 中解构字段，如果 photo 为空则使用默认值
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
    fileUrl,
  } = photo ?? {};

  // 将所有 hooks 移到条件返回之前，确保 hooks 调用顺序一致
  const faces = useMemo<FaceInfo[]>(() => {
    if (!faceData) return [];
    try {
      const parsed = JSON.parse(faceData);
      if (!parsed?.faces || !Array.isArray(parsed.faces)) return [];
      return parsed.faces
        .map((item: any) => ({
          bbox: item?.bbox as [number, number, number, number],
          score: typeof item?.score === "number" ? item.score : undefined,
          eye_open: typeof item?.eye_open === "number" ? item.eye_open : undefined,
        }))
        .filter(
          (face: FaceInfo) =>
            Array.isArray(face.bbox) && face.bbox.length === 4,
        );
    } catch (error) {
      console.warn("[PhotoDetailsTable] Failed to parse faceData", error);
      return [];
    }
  }, [faceData]);

  // 图片切换时：尝试匹配人脸并自动聚焦
  // 注意：需要等待 imageSize 更新后才能进行匹配
  useEffect(() => {
    const isNewPhoto = filePath !== prevFilePathRef.current;

    if (isNewPhoto) {
      // 标记为图片切换后的首次聚焦（禁用动画）
      setIsFirstFocusAfterSwitch(true);

      // 先记录新的 filePath，并重置匹配标记
      prevFilePathRef.current = filePath;
      matchedForCurrentPhotoRef.current = ""; // 重置匹配标记

      // 如果追踪模式未激活或没有人脸数据，直接清除选中状态
      if (!isTrackingActive || !faceTrackerRef.current.hasTracking() || faces.length === 0) {
        setActiveFaceIndex(null);
        setFocusRegion(null);
      }
      // 如果追踪模式激活但 imageSize 还未更新（为0），则等待 imageSize 更新后再匹配
      // 这种情况会在下面的 imageSize 监听 effect 中处理

      // 延迟重置首次聚焦标记（给图片加载和聚焦一点时间）
      setTimeout(() => {
        setIsFirstFocusAfterSwitch(false);
      }, 150);
    }
  }, [filePath, faces, isTrackingActive]);

  // 当 imageSize 更新且处于追踪模式时，尝试匹配人脸
  useEffect(() => {
    // 检查是否已经为当前图片完成了匹配
    if (matchedForCurrentPhotoRef.current === filePath) {
      return; // 已经匹配过了，跳过
    }

    if (
      isTrackingActive &&
      faceTrackerRef.current.hasTracking() &&
      faces.length > 0 &&
      imageSize.width > 0 &&
      imageSize.height > 0
    ) {
      // 标记已为当前图片完成匹配
      matchedForCurrentPhotoRef.current = filePath;

      const matchResult = faceTrackerRef.current.findMatch(
        faces as TrackerFaceInfo[],
        imageSize,
      );

      // console.log("[FaceTracker] Match result:", matchResult);

      if (matchResult.matchedIndex !== null) {
        // 找到匹配的人脸，自动聚焦（置信度判断已在 faceTracker 内部完成）
        const matchedFace = faces[matchResult.matchedIndex];
        setActiveFaceIndex(matchResult.matchedIndex);
        setFocusRegion({
          bbox: matchedFace.bbox,
          zoomFactor: 1.25,
          requestId: Date.now(),
        });

        // 更新追踪状态
        faceTrackerRef.current.setTrackedFace(
          matchedFace as TrackerFaceInfo,
          matchResult.matchedIndex,
          imageSize,
          faces.length,
        );
      } else {
        // 没有匹配，清除选中状态但保持追踪模式（等待下一张图片继续匹配）
        setActiveFaceIndex(null);
        setFocusRegion(null);
      }
    }
  }, [filePath, imageSize, faces, isTrackingActive]);

  // 当图片加载完成时获取尺寸（通过隐藏的 img 元素）
  useEffect(() => {
    if (!filePath) {
      setImageSize({ width: 0, height: 0 });
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = `local-resource://${filePath}`;

    return () => {
      img.onload = null;
    };
  }, [filePath]);

  const formatted = useMemo(
    () => ({
      size: formatBytes(fileSize),
      similarity: formatSimilarity(similarity),
      iqa: formatIQA(IQA),
      dateDisplay: date ? date : "-",
    }),
    [fileSize, similarity, IQA, date],
  );

  const previewSrc = filePath ? `local-resource://${filePath}` : "";
  const facePreviewSrc = previewSrc;

  const handleToggle = useCallback(async (checked: boolean) => {
    if (isUpdating || !filePath) return;
    setIsUpdating(true);
    try {
      await updatePhotoEnabledStatus(filePath, checked);

      setPhotos((prevPhotos) =>
        prevPhotos.map((group) =>
          group.map((p: PhotoExtend) =>
            p.filePath === filePath
              ? {
                  ...p,
                  isEnabled: checked,
                }
              : p,
          ),
        ),
      );
      setIsPreviewEnabled(checked);
      onPhotoStatusChanged?.();
    } catch (err) {
      console.error("[PhotoDetailsTable] 更新启用状态失败:", err);
    } finally {
      setIsUpdating(false);
    }
  }, [isUpdating, filePath, updatePhotoEnabledStatus, setPhotos, setIsPreviewEnabled, onPhotoStatusChanged]);

  const handleFaceSelect = useCallback((face: FaceInfo, index: number) => {
    setActiveFaceIndex(index);
    setFocusRegion({
      bbox: face.bbox,
      zoomFactor: 1.25,
      requestId: Date.now(),
    });

    // 用户手动选择人脸时，更新追踪状态并激活追踪模式
    if (imageSize.width > 0) {
      faceTrackerRef.current.setTrackedFace(
        face as TrackerFaceInfo,
        index,
        imageSize,
        faces.length,
      );
      // 激活追踪模式
      setIsTrackingActive(true);
    }
  }, [imageSize, faces.length]);

  // 用户手动交互时取消追踪模式
  const handleUserInteraction = useCallback(() => {
    // 清除追踪状态
    faceTrackerRef.current.clearTracking();
    setIsTrackingActive(false);
    setActiveFaceIndex(null);
    setFocusRegion(null);
    console.log("[FaceTracker] Tracking cancelled due to user interaction");
  }, []);

  const faceLabel = t("photoDetailsTable.faceDetected", {
    count: faces.length,
    defaultValue: `检测到 ${faces.length} 个人脸`,
  });
  const faceHelper = isTrackingActive
    ? t("photoDetailsTable.faceTrackingMode", {
        defaultValue: "正在追踪人物，任意拖动以取消",
      })
    : t("photoDetailsTable.faceTapToFocus", {
        defaultValue: "点击头像以聚焦对应区域",
      });

  // 条件返回移到所有 hooks 之后
  if (!photo) {
    return (
      <div className="flex h-full flex-col">
        <PreviewPlaceholder height="calc((100vh - 180px))" />
      </div>
    );
  }

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
          if (e.touches && e.touches[0]) {
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
            imageSrc={facePreviewSrc}
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
};

export default PhotoDetailsTable;
