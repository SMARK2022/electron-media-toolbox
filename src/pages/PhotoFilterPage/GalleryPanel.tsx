/**
 * GalleryPanel 组件 - 虚拟化版本
 * ==============================
 * 支持分组和全部模式的虚拟化照片画廊
 * - 分组模式：每个分组有标题行 + 多行照片
 * - 全部模式：所有照片作为一个大网格虚拟化
 */

import * as React from "react";
import ReactDOM from "react-dom";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Layers, Grid, Image as ImageIcon, Eye, EyeOff, AlertTriangle, FolderOpen, Trash2, Info, ExternalLink, CheckCircle2, XCircle } from "lucide-react";
import { Photo } from "@/helpers/ipc/database/db";
import { useGallerySelectors, usePhotoFilterStore } from "../../helpers/store/usePhotoFilterStore";
import { cn } from "@/lib/utils";
import missing_icon from "@/assets/images/cat_missing.svg";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PhotoInfoDialog } from "@/components/PhotoInfoDialog";

// ========== 虚拟化常量 ==========
const ITEM_WIDTH = 200;                           // 每个格子宽度 (px)
const ITEM_HEIGHT = 220;                          // 每个格子高度（含标题区）(px)
const GAP = 12;                                   // 格子间距 (px)
const GROUP_HEADER_HEIGHT = 28;                   // 分组标题行高度 (px)
const OVERSCAN = 2;                               // 上下额外渲染行数

// ========== 工具函数 ==========
function ellipsizeMiddle(name: string, maxLength = 36): string {
  if (!name || name.length <= maxLength) return name;
  const dotIndex = name.lastIndexOf(".");
  let base = name, ext = "";
  if (dotIndex > 0 && dotIndex < name.length - 1) { base = name.slice(0, dotIndex); ext = name.slice(dotIndex); }
  const remain = maxLength - 3 - ext.length;
  if (remain <= 0) return name.slice(0, maxLength - 3) + "...";
  const front = Math.ceil(remain / 2), back = Math.floor(remain / 2);
  return `${base.slice(0, front)}...${base.slice(Math.max(base.length - back, front))}${ext}`;
}

// ========== 右键菜单组件 ==========
interface ContextMenuProps {
  x: number; y: number; onClose: () => void; onAction: (actionId: string) => void;
  targetName: string; isEnabled: boolean;
  groups: { id: string; label: string; items: { id: string; label: string; i18nKey?: string; icon?: string }[] }[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onAction, targetName, isEnabled, groups }) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", onClose, true);
    return () => { document.removeEventListener("mousedown", handleClickOutside); document.removeEventListener("scroll", onClose, true); };
  }, [onClose]);

  const adjustedStyle: React.CSSProperties = { top: y, left: x };
  if (typeof window !== "undefined") { if (x + 220 > window.innerWidth) adjustedStyle.left = x - 220; if (y + 280 > window.innerHeight) adjustedStyle.top = y - 280; }

  return (
    <div ref={menuRef} style={adjustedStyle} className="animate-in fade-in zoom-in-95 fixed z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white/95 text-sm shadow-xl backdrop-blur-sm duration-100 dark:border-slate-700 dark:bg-slate-800/95" onClick={(e) => e.stopPropagation()}>
      <div className="truncate border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">{ellipsizeMiddle(targetName, 32)}</div>
      <div className="p-1">
        {groups.map((group) => {
          const itemsToShow = group.items.filter((item) => item.id !== "toggle-enabled");  // Gallery 不支持启用/禁用
          if (itemsToShow.length === 0) return null;
          return (
            <div key={group.id} className="mb-1 last:mb-0">
              <div className="px-2 pt-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase dark:text-slate-500">{group.label}</div>
              {itemsToShow.map((item) => {
                let iconNode: React.ReactNode = null;
                if (item.icon === "open") iconNode = <ExternalLink size={14} />;
                else if (item.icon === "folder") iconNode = <FolderOpen size={14} />;
                else if (item.icon === "delete-db" || item.icon === "delete-file") iconNode = <Trash2 size={14} />;
                else if (item.icon === "info") iconNode = <Info size={14} />;
                const dynamicClassName = item.id === "delete-db" ? "text-orange-500 hover:bg-orange-50 hover:text-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30" : item.id === "delete-file" ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30" : "dark:text-slate-200";
                const baseLabel = item.i18nKey ? t(item.i18nKey, item.label) : item.label;
                return (
                  <button key={item.id} onClick={() => onAction(item.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-slate-700", dynamicClassName)}>
                    {iconNode} <span>{baseLabel}</span>
                  </button>
                );
              })}
              <div className="my-1 h-px bg-gray-100 dark:bg-slate-700" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ========== 删除确认对话框（Portal 版本）==========
interface DeleteConfirmPortalProps {
  open: boolean; photo: Photo | null; skipConfirm: boolean;
  onClose: () => void; onSetSkipConfirm: (skip: boolean) => void; onConfirm: () => Promise<void>;
}

const DeleteConfirmPortal: React.FC<DeleteConfirmPortalProps> = ({ open, photo, skipConfirm, onClose, onSetSkipConfirm, onConfirm }) => {
  const { t } = useTranslation();
  const dialogContent = (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("photoContext.confirmDeleteTitle", "Delete photo file")}</AlertDialogTitle>
          <AlertDialogDescription>{t("photoContext.confirmDeleteDesc", "This will permanently delete the file from disk. This action cannot be undone.")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="bg-muted my-2 rounded-md px-3 py-2 text-xs"><div className="font-mono break-all">{photo?.filePath}</div></div>
        <div className="mt-2 flex items-center space-x-2">
          <Checkbox id="skip-delete-confirm" checked={skipConfirm} onCheckedChange={(checked: boolean) => onSetSkipConfirm(checked === true)} />
          <label htmlFor="skip-delete-confirm" className="text-muted-foreground text-xs select-none">{t("photoContext.skipConfirmLabel", "Do not ask again (use with caution)")}</label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 text-white hover:bg-red-700">{t("photoContext.confirmDeleteButton", "Delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  if (typeof document === "undefined") return dialogContent;
  return ReactDOM.createPortal(dialogContent, document.body);
};

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

// ========== 简化版照片卡片（Gallery 专用，含 info、眨眼统计、焦点等）==========
interface GalleryPhotoCardProps {
  photo: Photo;
  width: number;
  isHighlighted: boolean;
  isFocused: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onFocus: () => void;
  setRef: (el: HTMLDivElement | null) => void;
}

const GalleryPhotoCard: React.FC<GalleryPhotoCardProps> = React.memo(({
  photo, width, isHighlighted, isFocused, onClick, onDoubleClick, onContextMenu, onFocus, setRef,
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
      ref={setRef}
      tabIndex={0}
      style={{ width, height: ITEM_HEIGHT - GAP }}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-lg border transition-all dark:bg-slate-800",
        "cursor-pointer hover:shadow-lg focus-visible:outline-none",
        isFocused ? "border-blue-500 shadow-md ring-2 ring-blue-200 dark:ring-blue-900" : (isHighlighted ? "border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900" : "border-gray-200 shadow-sm hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600"),
        !photo.isEnabled && "opacity-40 grayscale",
        "bg-white",
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onFocus={onFocus}
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
        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
        {/* 眨眼统计指示器 */}
        {eyeStats && <EyeStateBadgeGallery eyeStats={eyeStats} />}
      </div>
      {/* 信息区域 */}
      <div className="flex w-full flex-col gap-1 border-t border-gray-100 px-2 py-1.5 text-xs dark:border-slate-700">
        <p className="flex-1 truncate font-medium text-gray-700 dark:text-slate-200" title={photo.fileName}>{displayName}</p>
        {showInfo && <p className="font-mono text-[11px]" style={{ color: colorStyle }}>{formattedInfo}</p>}
      </div>
      {isFocused && <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500 ring-inset" />}
    </div>
  );
}, (prev, next) => (
  prev.photo.filePath === next.photo.filePath &&
  prev.photo.isEnabled === next.photo.isEnabled &&
  prev.photo.fileUrl === next.photo.fileUrl &&
  prev.photo.info === next.photo.info &&
  prev.isHighlighted === next.isHighlighted &&
  prev.isFocused === next.isFocused &&
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
  const storeFocusedPath = usePhotoFilterStore((s) => s.focusedPhotoFilePath);  // 从 store 获取焦点路径
  const storeHighlightPaths = usePhotoFilterStore((s) => s.highlightedPhotoFilePaths);  // 从 store 获取高亮路径
  const contextMenuGroups = usePhotoFilterStore((s) => s.contextMenuGroups);  // 右键菜单配置
  const fnHandleContextMenuAction = usePhotoFilterStore((s) => s.fnHandleContextMenuAction);  // 右键菜单处理函数
  const boolShowDeleteConfirm = usePhotoFilterStore((s) => s.boolShowDeleteConfirm);  // 删除确认对话框
  const boolSkipDeleteConfirm = usePhotoFilterStore((s) => s.boolSkipDeleteConfirm);
  const objPendingDeletePhoto = usePhotoFilterStore((s) => s.objPendingDeletePhoto);
  const fnCloseDeleteConfirm = usePhotoFilterStore((s) => s.fnCloseDeleteConfirm);
  const fnSetSkipDeleteConfirm = usePhotoFilterStore((s) => s.fnSetSkipDeleteConfirm);
  const fnExecuteDeleteFile = usePhotoFilterStore((s) => s.fnExecuteDeleteFile);
  const boolShowInfoDialog = usePhotoFilterStore((s) => s.boolShowInfoDialog);
  const objInfoPhoto = usePhotoFilterStore((s) => s.objInfoPhoto);
  const objInfoMetadata = usePhotoFilterStore((s) => s.objInfoMetadata);
  const fnCloseInfoDialog = usePhotoFilterStore((s) => s.fnCloseInfoDialog);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map());  // 图片引用映射
  const [containerWidth, setContainerWidth] = useState(800);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; photo: Photo | null }>({ visible: false, x: 0, y: 0, photo: null });  // 右键菜单状态

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

  // 触发外部回调（异步避免阻塞）
  const triggerClick = useCallback((photo: Photo, event: string) => {
    if (onPhotoClick) setTimeout(() => void onPhotoClick([photo], event), 0);
  }, [onPhotoClick]);

  // 选择指定 filePath 的照片
  const selectByPath = useCallback((filePath: string, event: "Select" | "Change") => {
    const photo = lstGalleryGroupedPhotos.flat().find((p) => p.filePath === filePath);
    if (!photo) return;
    triggerClick(photo, event);
  }, [lstGalleryGroupedPhotos, triggerClick]);

  // 键盘导航：按分组计算行列位置，处理不完整行的情况
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) return;
    if (!storeFocusedPath && e.key !== "Enter") {
      const firstPhoto = lstGalleryGroupedPhotos[0]?.[0];
      if (firstPhoto && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
        selectByPath(firstPhoto.filePath, "Select");
      }
      return;
    }

    // 根据 focusedPath 查找所在分组及组内位置
    let targetGroupIdx = -1, targetRowIdx = -1, targetColIdx = -1;
    for (let gi = 0; gi < lstGalleryGroupedPhotos.length; gi++) {
      const group = lstGalleryGroupedPhotos[gi];
      for (let pi = 0; pi < group.length; pi++) {
        if (group[pi].filePath === storeFocusedPath) {
          targetGroupIdx = gi;
          targetRowIdx = Math.floor(pi / columns);
          targetColIdx = pi % columns;
          break;
        }
      }
      if (targetGroupIdx >= 0) break;
    }

    if (targetGroupIdx < 0) return; // 未找到焦点

    let nextPhoto: Photo | null = null;
    const currentGroup = lstGalleryGroupedPhotos[targetGroupIdx];
    const currentRowStart = targetRowIdx * columns;
    const currentRowEnd = Math.min(currentRowStart + columns, currentGroup.length);

    switch (e.key) {
      case "ArrowLeft": // 同行左移
        if (targetColIdx > 0) nextPhoto = currentGroup[currentRowStart + targetColIdx - 1];
        else if (targetGroupIdx > 0) { // 上一组最后一行最右
          const prevGroup = lstGalleryGroupedPhotos[targetGroupIdx - 1];
          const prevLastRowStart = Math.floor((prevGroup.length - 1) / columns) * columns;
          nextPhoto = prevGroup[prevGroup.length - 1];
        }
        break;

      case "ArrowRight": // 同行右移
        if (targetColIdx < currentRowEnd - currentRowStart - 1) nextPhoto = currentGroup[currentRowStart + targetColIdx + 1];
        else if (targetGroupIdx < lstGalleryGroupedPhotos.length - 1) nextPhoto = lstGalleryGroupedPhotos[targetGroupIdx + 1][0]; // 下一组首个
        break;

      case "ArrowUp": // 上移
        if (targetRowIdx > 0) nextPhoto = currentGroup[currentRowStart - columns + targetColIdx];
        else if (targetGroupIdx > 0) { // 上一组同列
          const prevGroup = lstGalleryGroupedPhotos[targetGroupIdx - 1];
          const prevLastRowStart = Math.floor((prevGroup.length - 1) / columns) * columns;
          nextPhoto = prevGroup[Math.min(prevLastRowStart + targetColIdx, prevGroup.length - 1)];
        }
        break;

      case "ArrowDown": // 下移
        if (targetRowIdx < Math.floor((currentGroup.length - 1) / columns)) nextPhoto = currentGroup[currentRowStart + columns + targetColIdx];
        else if (targetGroupIdx < lstGalleryGroupedPhotos.length - 1) { // 下一组同列
          const nextGroup = lstGalleryGroupedPhotos[targetGroupIdx + 1];
          nextPhoto = nextGroup[Math.min(targetColIdx, nextGroup.length - 1)];
        }
        break;

      case "Enter": // 打开照片
        e.preventDefault();
        e.stopPropagation();
        triggerClick(currentGroup[currentRowStart + targetColIdx], "Change");
        return;
    }

    if (nextPhoto) {
      e.preventDefault();
      e.stopPropagation();
      selectByPath(nextPhoto.filePath, "Select");
    }
  }, [lstGalleryGroupedPhotos, storeFocusedPath, columns, selectByPath, triggerClick]);

  // 焦点滚动
  useEffect(() => {
    if (storeFocusedPath) {
      const scrollElement = scrollViewportRef.current;
      if (scrollElement) {
        const itemEl = itemRefs.current.get(storeFocusedPath);
        if (itemEl) itemEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      }
    }
  }, [storeFocusedPath]);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent, photo: Photo) => {
    e.preventDefault();
    e.stopPropagation();
    selectByPath(photo.filePath, "Select");
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, photo });
  }, [selectByPath]);

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
        <div
          ref={scrollViewportRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="h-full w-full outline-none"
        >
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
                        isHighlighted={storeHighlightPaths.has(photo.filePath)}
                        isFocused={storeFocusedPath === photo.filePath}
                        onClick={() => triggerClick(photo, "Select")}
                        onDoubleClick={() => triggerClick(photo, "Change")}
                        onContextMenu={(e) => handleContextMenu(e, photo)}
                        onFocus={() => selectByPath(photo.filePath, "Select")}
                        setRef={(el) => { if (el) itemRefs.current.set(photo.filePath, el); else itemRefs.current.delete(photo.filePath); }}
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

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.photo && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          targetName={contextMenu.photo.fileName}
          isEnabled={contextMenu.photo.isEnabled ?? true}
          groups={contextMenuGroups}
          onClose={() => setContextMenu((c) => ({ ...c, visible: false }))}
          onAction={(action) => {
            if (contextMenu.photo) fnHandleContextMenuAction(action, contextMenu.photo, "filter");
            setContextMenu((c) => ({ ...c, visible: false }));
          }}
        />
      )}

      {/* 删除确认对话框 */}
      <DeleteConfirmPortal
        open={boolShowDeleteConfirm && !!objPendingDeletePhoto}
        photo={objPendingDeletePhoto} skipConfirm={boolSkipDeleteConfirm}
        onClose={fnCloseDeleteConfirm} onSetSkipConfirm={fnSetSkipDeleteConfirm}
        onConfirm={async () => { fnCloseDeleteConfirm(); if (objPendingDeletePhoto) await fnExecuteDeleteFile(objPendingDeletePhoto); }}
      />

      <PhotoInfoDialog
        open={boolShowInfoDialog}
        onOpenChange={(open) => { if (!open) fnCloseInfoDialog(); }}
        photo={objInfoPhoto} metadata={objInfoMetadata as any}
      />
    </Tabs>
  );
});
GalleryPanel.displayName = "GalleryPanel";
