import React, {
  useCallback,
  useEffect,
  useMemo,
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
  ScanFace,
} from "lucide-react";
import { PhotoExtend } from "@/helpers/ipc/database/db";
import { cn } from "@/lib/utils";

type FaceInfo = {
  bbox: [number, number, number, number];
  score?: number;
};

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

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

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

interface FaceThumbnailProps {
  imageSrc: string;
  face: FaceInfo;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}

const FaceThumbnail: React.FC<FaceThumbnailProps> = ({
  imageSrc,
  face,
  index,
  isActive,
  onSelect,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    setIsLoaded(false);

    // --- 让缩略图更清晰（支持高 DPI）
    const THUMB = 120;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(THUMB * dpr);
    canvas.height = Math.round(THUMB * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const img = new Image();

    // ✅ 只有 http(s) 才设置跨域；自定义协议/本地资源不要乱设 crossOrigin
    if (/^https?:\/\//i.test(imageSrc)) {
      img.crossOrigin = "anonymous";
    }

    img.decoding = "async";

    const draw = async () => {
      try {
        // decode() 能减少某些平台 onload 触发但像素未就绪的问题
        //（失败也没关系）
        // @ts-ignore
        if (img.decode) await img.decode();
      } catch {}

      if (cancelled) return;

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;

      if (!imgW || !imgH) {
        // 图片没真正解码出来
        if (!cancelled) setIsLoaded(false);
        return;
      }

      const [x1, y1, x2, y2] = face.bbox;

      // bbox 防御：确保是有效数值，且 x2>x1, y2>y1
      const bx1 = Number.isFinite(x1) ? x1 : 0;
      const by1 = Number.isFinite(y1) ? y1 : 0;
      const bx2 = Number.isFinite(x2) ? x2 : 0;
      const by2 = Number.isFinite(y2) ? y2 : 0;

      const bw = Math.max(2, bx2 - bx1);
      const bh = Math.max(2, by2 - by1);

      const padding = Math.min(bw, bh) * 0.12;

      const sx = clamp(bx1 - padding, 0, imgW - 1);
      const sy = clamp(by1 - padding, 0, imgH - 1);
      const sw = clamp(bw + padding * 2, 2, imgW - sx);
      const sh = clamp(bh + padding * 2, 2, imgH - sy);

      // cover: 保持比例填满 120x120
      const ratio = Math.max(THUMB / sw, THUMB / sh);
      const dx = (THUMB - sw * ratio) / 2;
      const dy = (THUMB - sh * ratio) / 2;

      ctx.clearRect(0, 0, THUMB, THUMB);
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw * ratio, sh * ratio);
      console.log("[FaceThumbnail] image drawn:", { imgW, imgH, x1, y1, x2, y2 ,bw, bh});
      console.log("[FaceThumbnail] drawn:", { sx, sy, sw, sh, dx, dy, dw: sw * ratio, dh: sh * ratio });

      if (!cancelled) setIsLoaded(true);
    };

    img.onload = () => {
      void draw();
    };

    img.onerror = (e) => {
      console.warn("[FaceThumbnail] image load failed:", imageSrc, e);
      if (!cancelled) setIsLoaded(false);
    };

    // ✅ 一定要在 onload/onerror 绑定之后再设置 src
    img.src = imageSrc;

    // ✅ 处理“命中缓存导致 onload 不触发”的情况
    if (img.complete && (img.naturalWidth || img.width)) {
      void draw();
    }

    return () => {
      cancelled = true;
    };
    // 用 bbox 四个数作为依赖，避免 face 对象引用变化导致重复无意义重跑
  }, [imageSrc, face.bbox[0], face.bbox[1], face.bbox[2], face.bbox[3]]);

  const score = (face.score ?? 0) * 100;
  const scoreColor =
    score >= 90
      ? "border-emerald-400/70"
      : score >= 70
        ? "border-amber-400/70"
        : "border-red-400/70";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group text-muted-foreground flex flex-col items-center gap-1 text-[10px]",
        isActive ? "text-foreground" : "",
      )}
    >
      <div
        className={cn(
          "relative size-14 overflow-hidden rounded-lg border-2 bg-slate-100 shadow-sm transition-all max-w-[100%] max-h-[100%]",
          scoreColor,
          isActive ? "ring-2 ring-blue-400" : "group-hover:border-blue-300",
        )}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            "size-full transition-opacity duration-300 w-full h-full object-cover",
            isLoaded ? "opacity-100" : "opacity-0",
          )}
        />
        {!isLoaded && (
          <div className="absolute inset-0 animate-pulse bg-slate-200" />
        )}
        <div className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 font-mono text-[8px] text-white opacity-0 transition-opacity group-hover:opacity-100">
          {`${Math.round(score)}%`}
        </div>
      </div>
      <span className="font-mono">Face {index + 1}</span>
    </button>
  );
};


interface FaceStripProps {
  faces: FaceInfo[];
  imageSrc: string;
  activeIndex: number | null;
  onFaceSelect: (face: FaceInfo, index: number) => void;
  label: string;
  helperLabel: string;
}

const FaceStrip: React.FC<FaceStripProps> = ({
  faces,
  imageSrc,
  activeIndex,
  onFaceSelect,
  label,
  helperLabel,
}) => {
  if (!faces.length || !imageSrc) return null;

  return (
    <div className="w-full border-b border-slate-200/70 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20">
      <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2 font-semibold">
          <ScanFace className="h-3.5 w-3.5 text-indigo-500" />
          <span>{label}</span>
        </div>
        <span className="text-muted-foreground text-[10px]">{helperLabel}</span>
      </div>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 px-3.5 pt-0.5 pb-3">
          {faces.map((face, idx) => (
            <FaceThumbnail
              key={`${idx}-${face.bbox.join("-")}`}
              imageSrc={imageSrc}
              face={face}
              index={idx}
              isActive={activeIndex === idx}
              onSelect={() => onFaceSelect(face, idx)}
            />
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

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

  useEffect(() => {
    setActiveFaceIndex(null);
    setFocusRegion(null);
  }, [photo?.filePath]);

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
  }, []);

  const faceLabel = t("photoDetailsTable.faceDetected", {
    count: faces.length,
    defaultValue: `检测到 ${faces.length} 个人脸`,
  });
  const faceHelper = t("photoDetailsTable.faceTapToFocus", {
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
        />
      </div>

      <div
        className="bg-muted/20 hover:bg-muted/40 flex flex-shrink-0 cursor-ns-resize items-center justify-center transition-colors select-none"
        style={{ height: 8, touchAction: "none" }}
        onMouseDown={(e) => onStartPreviewMouseDrag(e.clientY)}
        onTouchStart={(e) => {
          if (e.touches && e.touches[0]) {
            onStartPreviewTouchDrag(e.touches[0].clientY);
          }
        }}
      >
        <div className="bg-muted/60 h-1.5 w-10 rounded-full" />
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

          <FaceStrip
            faces={faces}
            imageSrc={facePreviewSrc}
            activeIndex={activeFaceIndex}
            onFaceSelect={handleFaceSelect}
            label={faceLabel}
            helperLabel={faceHelper}
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
