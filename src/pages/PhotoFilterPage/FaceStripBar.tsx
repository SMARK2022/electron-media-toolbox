import React, { useEffect, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { ScanFace, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getEyeState, countEyeStates, type EyeState } from "@/helpers/store/usePhotoFilterStore";

export type FaceInfo = {
  bbox: [number, number, number, number];
  score?: number;
  eye_open?: number; // 眨眼程度 (0.0 - 1.0)
};

// 眼睛状态样式映射（仅样式相关，阈值逻辑由 store 统一管理）
const EYE_STATE_CONFIG: Record<
  EyeState,
  { icon: typeof Eye; color: string; text: string }
> = {
  open: {
    icon: Eye,
    color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    text: "正常",
  },
  suspicious: {
    icon: AlertTriangle,
    color: "text-amber-600 bg-amber-50 border-amber-200",
    text: "疑似闭眼",
  },
  closed: {
    icon: EyeOff,
    color: "text-red-600 bg-red-50 border-red-200",
    text: "闭眼",
  },
};

interface FaceThumbnailProps {
  imageSrc: string;
  face: FaceInfo;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const FaceThumbnail: React.FC<FaceThumbnailProps> = ({
  imageSrc,
  face,
  index,
  isActive,
  onSelect,
}) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 使用统一的眼睛状态判断
  const eyeState = getEyeState(face.eye_open);
  const { icon: EyeStatusIcon, color: eyeStatusColor, text: eyeStatusText } = EYE_STATE_CONFIG[eyeState];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let cancelled = false;
    setIsLoaded(false);

    const THUMB = 120;
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    canvas.width = Math.round(THUMB * dpr);
    canvas.height = Math.round(THUMB * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const img = new Image();
    if (/^https?:\/\//i.test(imageSrc)) {
      img.crossOrigin = "anonymous";
    }
    img.decoding = "async";

    const draw = async () => {
      try {
        // @ts-ignore
        if (img.decode) await img.decode();
      } catch {}
      if (cancelled) return;

      const imgW = img.naturalWidth || img.width;
      const imgH = img.naturalHeight || img.height;
      if (!imgW || !imgH) {
        if (!cancelled) setIsLoaded(false);
        return;
      }

      const [x1, y1, x2, y2] = face.bbox;
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

      const ratio = Math.max(THUMB / sw, THUMB / sh);
      const dx = (THUMB - sw * ratio) / 2;
      const dy = (THUMB - sh * ratio) / 2;

      ctx.clearRect(0, 0, THUMB, THUMB);
      ctx.drawImage(img, sx, sy, sw, sh, dx, dy, sw * ratio, sh * ratio);

      if (!cancelled) setIsLoaded(true);
    };

    img.onload = () => {
      void draw();
    };
    img.onerror = () => {
      if (!cancelled) setIsLoaded(false);
    };
    img.src = imageSrc;
    if (img.complete && (img.naturalWidth || img.width)) {
      void draw();
    }

    return () => {
      cancelled = true;
    };
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

        {/* 右上角眨眼状态指示器 */}
        {face.eye_open !== undefined && (
          <div
            className={cn(
              "absolute top-0.5 right-0.5 p-[2px] rounded-full border shadow-sm backdrop-blur-sm transition-transform hover:scale-110 z-10",
              eyeStatusColor
            )}
            title={`${eyeStatusText} (睁眼度: ${(face.eye_open ?? 0).toFixed(3)})`}
          >
            <EyeStatusIcon className="w-2.5 h-2.5" />
          </div>
        )}
      </div>
      <span className="font-mono">Face {index + 1}</span>
    </button>
  );
};

export interface FaceStripBarProps {
  faces: FaceInfo[];
  imageSrc: string;
  activeIndex: number | null;
  onFaceSelect: (face: FaceInfo, index: number) => void;
  label: string;
  helperLabel: string;
  /** 是否处于追踪模式，用于切换样式和文案 */
  isTrackingMode: boolean;
}

export const FaceStripBar: React.FC<FaceStripBarProps> = ({
  faces,
  imageSrc,
  activeIndex,
  onFaceSelect,
  label,
  helperLabel,
  isTrackingMode,
}) => {
  if (!faces.length || !imageSrc) return null;

  // 使用统一的统计函数
  const { closed: closedEyesCount, suspicious: suspiciousCount, open: openEyesCount } = countEyeStates(faces);

  return (
    <div
      className={cn(
        "w-full border-b border-slate-200/70 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/20",
        isTrackingMode &&
          "border-emerald-300/70 bg-emerald-50/70 dark:border-emerald-600/70 dark:bg-emerald-950/40",
      )}
    >
      <div className="flex items-center justify-between px-3.5 py-1.5 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2 font-semibold">
          <ScanFace
            className={cn(
              "h-3.5 w-3.5",
              isTrackingMode
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-indigo-500",
            )}
          />
          <span>{label}</span>

          {/* 睁眼/闭眼/疑似闭眼统计 Badge */}
          {(openEyesCount > 0 ||
            closedEyesCount > 0 ||
            suspiciousCount > 0) && (
            <div className="ml-1 flex gap-1">
              {closedEyesCount > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
                  <EyeOff className="h-2.5 w-2.5" /> {closedEyesCount}
                </span>
              )}
              {suspiciousCount > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                  <AlertTriangle className="h-2.5 w-2.5" /> {suspiciousCount}
                </span>
              )}
              {openEyesCount > 0 && (
                <span className="flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <Eye className="h-2.5 w-2.5" /> {openEyesCount}
                </span>
              )}
            </div>
          )}
          {isTrackingMode && (
            <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200">
              人像追踪模式
            </span>
          )}
        </div>
        <span
          className={cn(
            "text-[10px]",
            isTrackingMode
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-muted-foreground",
          )}
        >
          {helperLabel}
        </span>
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
