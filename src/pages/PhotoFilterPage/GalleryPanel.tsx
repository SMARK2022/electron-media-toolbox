/**
 * GalleryPanel 组件 - 虚拟化版本
 * ==============================
 * 支持分组和全部模式的虚拟化照片画廊
 * - 分组模式：每个分组有标题行 + 多行照片
 * - 全部模式：所有照片作为一个大网格虚拟化
 */

import * as React from "react";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Layers, Grid, Image as ImageIcon, Eye, EyeOff, AlertTriangle } from "lucide-react";
import { Photo } from "@/helpers/ipc/database/db";
import { useGallerySelectors, usePhotoFilterStore } from "../../helpers/store/usePhotoFilterStore";
import { cn } from "@/lib/utils";
import missing_icon from "@/assets/images/cat_missing.svg";

// ========== 虚拟化常量 ==========
const ITEM_WIDTH = 200;                           // 每个格子宽度 (px)
const ITEM_HEIGHT = 220;                          // 每个格子高度（含标题区）(px)
const GAP = 12;                                   // 格子间距 (px)
const GROUP_HEADER_HEIGHT = 28;                   // 分组标题行高度 (px)
const OVERSCAN = 2;                               // 上下额外渲染行数

// ========== 虚拟行类型定义 ==========
type VirtualRowType = "header" | "photos";
interface VirtualRow {
  type: VirtualRowType;
  groupIndex: number;                             // 所属分组索引
  rowInGroup?: number;                            // 该分组内的行号（用于生成稳定 key）
  photos?: Photo[];                               // type=photos 时为该行照片
  label?: string;                                 // type=header 时为分组标签
}

// ========== 眨眼统计指示器（Gallery 专用，磨砂玻璃风格）==========
interface EyeStateBadgeGalleryProps {
  eyeStats?: { closedEyesCount: number; suspiciousCount: number; openEyesCount: number } | null;
}

const EyeStateBadgeGallery: React.FC<EyeStateBadgeGalleryProps> = React.memo(({ eyeStats }) => {
  if (!eyeStats || (eyeStats.closedEyesCount === 0 && eyeStats.suspiciousCount === 0 && eyeStats.openEyesCount === 0)) return null;
  const hasIssues = eyeStats.closedEyesCount > 0 || eyeStats.suspiciousCount > 0;
  return (
    <div className="absolute top-2 right-2 z-10 flex items-center gap-0 overflow-hidden rounded-md border shadow-sm backdrop-blur-md select-none border-white/10 bg-zinc-950/85 shadow-black/20">
      {eyeStats.closedEyesCount > 0 && <div className="flex items-center gap-1 border-r border-white/10 px-1 py-1 text-rose-400 last:border-0"><EyeOff size={12} strokeWidth={2.5} /><span className="font-mono text-[10px] leading-none font-bold text-white/90">{eyeStats.closedEyesCount}</span></div>}
      {eyeStats.suspiciousCount > 0 && <div className="flex items-center gap-1 border-r border-white/10 px-1 py-1 text-amber-400 last:border-0"><AlertTriangle size={12} strokeWidth={2.5} /><span className="font-mono text-[10px] leading-none font-bold text-white/90">{eyeStats.suspiciousCount}</span></div>}
      {eyeStats.openEyesCount > 0 && <div className={cn("flex items-center gap-1 px-1 py-1 last:border-0 text-emerald-400")}><Eye size={12} strokeWidth={hasIssues ? 2 : 2.5} /><span className={cn("font-mono text-[10px] leading-none font-bold text-white/90")}>{eyeStats.openEyesCount}</span></div>}
    </div>
  );
});

// ========== 简化版照片卡片（Gallery 专用，含 info 和眨眼统计）==========
interface GalleryPhotoCardProps {
  photo: Photo;
  width: number;
  isHighlighted: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}

const GalleryPhotoCard: React.FC<GalleryPhotoCardProps> = React.memo(({
  photo, width, isHighlighted, onClick, onDoubleClick,
}) => {
  const [hasError, setHasError] = useState(false);
  const eyeStats = usePhotoFilterStore((s) => s.lstPhotosEyeStats.get(photo.filePath) ?? null);  // 获取眨眼统计

  const displayName = useMemo(() => {
    const name = photo.fileName;
    if (!name || name.length <= 24) return name;
    const dot = name.lastIndexOf(".");
    const base = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    return `${base.slice(0, 10)}...${base.slice(-8)}${ext}`;
  }, [photo.fileName]);

  // 计算 info 显示颜色（与 LazyImageContainer 保持一致）
  const { colorStyle, formattedInfo, showInfo } = useMemo(() => {
    const infoStr = photo.info ?? "";
    const numericInfo = /^[0-9]+(\.[0-9]+)?$/.test(infoStr) ? parseFloat(infoStr) : NaN;
    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
    const colorStyle = !Number.isNaN(numericInfo)
      ? numericInfo <= 50
        ? `rgb(${clamp(255 - numericInfo * 5)}, ${clamp(numericInfo * 5)}, 0)`
        : `rgb(0, ${clamp(255 - (numericInfo - 50) * 5)}, ${clamp((numericInfo - 50) * 5)})`
      : undefined;
    return { colorStyle, formattedInfo: !Number.isNaN(numericInfo) ? numericInfo.toFixed(6) : infoStr, showInfo: !Number.isNaN(numericInfo) || infoStr !== "" };
  }, [photo.info]);

  return (
    <div
      style={{ width, height: ITEM_HEIGHT - GAP }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border bg-white transition-all dark:bg-slate-800",
        "cursor-pointer hover:shadow-lg",
        isHighlighted ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900" : "border-gray-200 dark:border-slate-700",
        !photo.isEnabled && "opacity-40 grayscale",
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {/* 图片区域 */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gray-100 dark:bg-slate-900">
        <img
          src={hasError ? missing_icon : photo.fileUrl || missing_icon}
          alt={photo.fileName}
          loading="lazy"
          className="h-[160px] max-w-full object-contain transition-transform group-hover:scale-105"
          onError={() => setHasError(true)}
        />
        {/* 眨眼统计指示器 */}
        {eyeStats && <EyeStateBadgeGallery eyeStats={eyeStats} />}
      </div>
      {/* 信息区域 */}
      <div className="flex w-full flex-col gap-1 border-t border-gray-100 px-2 py-1.5 text-xs dark:border-slate-700">
        <p className="flex-1 truncate font-medium text-gray-700 dark:text-slate-200" title={photo.fileName}>{displayName}</p>
        {showInfo && <p className="font-mono text-[11px]" style={{ color: colorStyle }}>{formattedInfo}</p>}
      </div>
      {isHighlighted && <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500 ring-inset" />}
    </div>
  );
}, (prev, next) => (
  prev.photo.filePath === next.photo.filePath &&
  prev.photo.isEnabled === next.photo.isEnabled &&
  prev.photo.fileUrl === next.photo.fileUrl &&
  prev.photo.info === next.photo.info &&
  prev.isHighlighted === next.isHighlighted &&
  prev.width === next.width
));

// ========== 主面板 ==========
interface GalleryPanelProps {
  totalPhotoCount: number;
  onPhotoClick: (photos: Photo[], event: string) => void | Promise<void>;
}

export const GalleryPanel: React.FC<GalleryPanelProps> = React.memo(({ totalPhotoCount, onPhotoClick }) => {
  const { t } = useTranslation();
  const { lstGalleryGroupedPhotos, modeGalleryView, fnSetGalleryMode } = useGallerySelectors();
  const highlightedPaths = usePhotoFilterStore((s) => s.highlightedPhotoFilePaths);
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // 动态计算列数
  const columns = useMemo(() => Math.max(1, Math.floor((containerWidth + GAP) / (ITEM_WIDTH + GAP))), [containerWidth]);

  // 监听容器宽度变化
  useEffect(() => {
    if (!scrollViewportRef.current?.parentElement?.parentElement) return;
    const container = scrollViewportRef.current.parentElement.parentElement;                // ScrollArea 的容器
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(container);
    setContainerWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  const isGroupMode = modeGalleryView === "group";

  // 将分组数据打平为虚拟化行列表
  const virtualRows: VirtualRow[] = useMemo(() => {
    const rows: VirtualRow[] = [];
    lstGalleryGroupedPhotos.forEach((group, gi) => {
      if (group.length === 0) return;
      if (isGroupMode) rows.push({ type: "header", groupIndex: gi, label: `${t("filterPage.groupLabel") || "Group"} ${gi + 1}` });
      for (let i = 0, rowIdx = 0; i < group.length; i += columns, rowIdx++) {
        rows.push({ type: "photos", groupIndex: gi, rowInGroup: rowIdx, photos: group.slice(i, i + columns) });
      }
    });
    return rows;
  }, [lstGalleryGroupedPhotos, columns, isGroupMode, t]);

  // 动态估算行高度
  const estimateSize = useCallback((idx: number) => (virtualRows[idx]?.type === "header" ? GROUP_HEADER_HEIGHT : ITEM_HEIGHT), [virtualRows]);

  // 虚拟化 hook
  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollViewportRef.current,
    estimateSize,
    overscan: OVERSCAN,
    measureElement: typeof window !== 'undefined' ? (element) => element?.getBoundingClientRect().height : undefined,
  });

  // 点击处理
  const handleClick = useCallback((photo: Photo, event: string) => { onPhotoClick([photo], event); }, [onPhotoClick]);

  return (
    <Tabs id="gallery-pannel" value={modeGalleryView} onValueChange={(v) => fnSetGalleryMode(v as "group" | "total")} className="space-y-3">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <TabsList className="bg-muted/70 grid w-[280px] grid-cols-2">
          <TabsTrigger value="group" className="flex items-center gap-1.5 text-sm"><Layers className="h-3.5 w-3.5" />{t("filterPage.galleryMode")}</TabsTrigger>
          <TabsTrigger value="total" className="flex items-center gap-1.5 text-sm"><Grid className="h-3.5 w-3.5" />{t("filterPage.totalMode")}</TabsTrigger>
        </TabsList>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <div className="bg-muted flex items-center gap-1 rounded-full px-2 py-1">
            <ImageIcon className="text-muted-foreground/80 h-3.5 w-3.5" />
            <span className="font-sm">{t("labels.totalPhotosLabel")}:</span>
            <span className="rounded-full bg-blue-50 px-1.5 font-mono text-[14px] text-blue-700">{totalPhotoCount}</span>
          </div>
        </div>
      </div>

      {/* 虚拟化滚动画廊 */}
      <ScrollArea className="h-[calc(100vh-220px)] w-full rounded-xl border p-3 dark:bg-slate-900">
        <div ref={scrollViewportRef} className="h-full w-full outline-none">
          {virtualRows.length > 0 ? (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const row = virtualRows[virtualItem.index];
                if (!row) return null;

                if (row.type === "header") {
                  return (
                    <div
                      key={`h-${row.groupIndex}`}
                      style={{ position: "absolute", top: virtualItem.start, left: 0, width: "100%", height: GROUP_HEADER_HEIGHT, padding: `0 ${GAP}px` }}
                      className="flex items-center gap-2 text-[11px] font-semibold tracking-wide text-slate-500 uppercase"
                    >
                      <span>{row.label}</span>
                      <div className="h-px flex-1 bg-slate-200 dark:bg-slate-400" />
                    </div>
                  );
                }

                return (
                  <div
                    key={`r-${row.groupIndex}-${row.rowInGroup}`}
                    style={{
                      position: "absolute",
                      top: virtualItem.start,
                      left: 0,
                      width: "100%",
                      display: "flex",
                      gap: GAP,
                      padding: `0 ${GAP}px`,                                                // 左右内边距
                    }}
                  >
                    {row.photos?.map((photo) => (
                      <GalleryPhotoCard
                        key={photo.filePath}
                        photo={photo}
                        width={ITEM_WIDTH}
                        isHighlighted={highlightedPaths.has(photo.filePath)}
                        onClick={() => handleClick(photo, "Select")}
                        onDoubleClick={() => handleClick(photo, "Change")}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground flex h-[calc(70vh-100px)] flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full bg-white p-4 shadow-sm"><ImageIcon className="h-8 w-8 opacity-30" /></div>
              <p className="text-sm font-medium">{t("filterPage.noPhotosFoundTitle") || "No photos found"}</p>
              <p className="text-muted-foreground mt-1 max-w-xs text-xs">{t("filterPage.noPhotosFoundDesc") || "Try adjusting filters or importing more photos."}</p>
            </div>
          )}
        </div>
        <ScrollBar orientation="vertical" />
      </ScrollArea>
    </Tabs>
  );
});
GalleryPanel.displayName = "GalleryPanel";
