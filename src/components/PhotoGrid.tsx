/**
 * PhotoGrid 组件 - 统一虚拟化版本
 * ===================================
 * 支持分组和平铺两种模式的高性能照片网格展示
 * - 虚拟化渲染：仅渲染可见区域，大幅提升性能
 * - 分组模式：支持带标题行的分组展示（GalleryPanel 使用）
 * - 平铺模式：单层网格展示（import/export/filter 使用）
 * - 眨眼指示器：仅在 filter 页面显示（page="filter"）
 * - 右键菜单：基于 store 的统一菜单配置
 * - 键盘导航：上下左右 + Enter，分组/平铺自适应
 * - 删除确认 & 元数据弹窗：Portal 挂载
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import ReactDOM from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import missing_icon from "@/assets/images/cat_missing.svg";
import { Photo } from "@/helpers/ipc/database/db";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  Trash2,
  Info,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Eye,
  EyeOff,
  AlertTriangle,
  Image as ImageIcon
} from "lucide-react";
import {
  usePhotoFilterStore,
  type PhotoPage,
} from "@/helpers/store/usePhotoFilterStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "react-i18next";
import { PhotoInfoDialog } from "@/components/PhotoInfoDialog";

interface PhotoGridProps {
  photos?: Photo[];
  page?: PhotoPage; // 当前业务页面：filter/import/export，用于控制菜单显示和眨眼指示器
  isGroupMode?: boolean; // 是否为分组模式（GalleryPanel 使用）
  groupedPhotos?: Photo[][]; // 分组模式下的分组数据（二维数组）
  containerHeight?: number | string; // 容器高度，默认 100%（虚拟化需要明确高度）
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>; // 外部点击回调
}

// ========== 右键菜单组件（统一，支持 filter/import/export 三个页面） ==========
interface ContextMenuProps {
  x: number; y: number; onClose: () => void; onAction: (actionId: string) => void;
  targetName: string; isEnabled: boolean; page: PhotoPage;
  groups: { id: string; label: string; items: { id: string; label: string; i18nKey?: string; icon?: string }[] }[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, onClose, onAction, targetName, isEnabled, page, groups }) => {
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
          // 非 filter 页面时，过滤掉启用/禁用项；gallery 特殊处理（不显示启用/禁用）
          const itemsToShow = group.items.filter((item) => !(item.id === "toggle-enabled" && page !== "filter"));
          if (itemsToShow.length === 0) return null;
          return (
            <div key={group.id} className="mb-1 last:mb-0">
              <div className="px-2 pt-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase dark:text-slate-500">{group.label}</div>
              {itemsToShow.map((item) => {
                let iconNode: React.ReactNode = null;
                if (item.icon === "open") iconNode = <ExternalLink size={14} />;
                else if (item.icon === "folder") iconNode = <FolderOpen size={14} />;
                else if (item.icon === "toggle") iconNode = isEnabled ? <XCircle size={14} /> : <CheckCircle2 size={14} />;
                else if (item.icon === "delete-db" || item.icon === "delete-file") iconNode = <Trash2 size={14} />;
                else if (item.icon === "info") iconNode = <Info size={14} />;
                const isToggleItem = item.id === "toggle-enabled";
                const baseLabel = item.i18nKey ? t(item.i18nKey, item.label) : item.label;
                const dynamicLabel = isToggleItem ? isEnabled ? t("photoContext.menu.toggleEnabled.disable", "标记为禁用") : t("photoContext.menu.toggleEnabled.enable", "标记为启用") : baseLabel;
                const dynamicClassName = item.id === "delete-db" ? "text-orange-500 hover:bg-orange-50 hover:text-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30" : item.id === "delete-file" ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30" : "dark:text-slate-200";
                return (
                  <button key={item.id} onClick={() => onAction(item.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-slate-700", dynamicClassName)}>
                    {iconNode} <span>{dynamicLabel}</span>
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

// ========== 工具函数 ==========
/**
 * 比较两个 Photo 对象是否相等
 * 检查所有关键字段：filePath、fileName、fileUrl、info、isEnabled
 */
function isPhotoEqual(photoA: Photo | undefined, photoB: Photo | undefined): boolean {
  if (photoA === photoB) return true;
  if (!photoA || !photoB) return false;
  return (
    photoA.filePath === photoB.filePath &&
    photoA.fileName === photoB.fileName &&
    photoA.fileUrl === photoB.fileUrl &&
    photoA.info === photoB.info &&
    photoA.isEnabled === photoB.isEnabled
  );
}

/**
 * 比较两个 Photo 数组是否相等
 * 进行深度比较，检查数组长度和每个元素
 */
function arePhotoArraysEqual(arrA: Photo[] | undefined, arrB: Photo[] | undefined): boolean {
  if (arrA === arrB) return true;
  if (!arrA || !arrB) return arrA === arrB;
  if (arrA.length !== arrB.length) return false;
  return arrA.every((photoA, idx) => isPhotoEqual(photoA, arrB[idx]));
}

/**
 * 比较两个分组照片数组（二维数组）是否相等
 */
function areGroupedPhotosEqual(groupsA: Photo[][] | undefined, groupsB: Photo[][] | undefined): boolean {
  if (groupsA === groupsB) return true;
  if (!groupsA || !groupsB) return groupsA === groupsB;
  if (groupsA.length !== groupsB.length) return false;
  return groupsA.every((groupA, idx) => arePhotoArraysEqual(groupA, groupsB[idx]));
}

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

// ========== 眨眼统计指示器（仅在 filter 页面显示，磨砂玻璃风格） ==========
interface EyeStateBadgeProps {
  eyeStats?: { closedEyesCount: number; suspiciousCount: number; openEyesCount: number } | null;
}

const EyeStateBadge: React.FC<EyeStateBadgeProps> = React.memo(({ eyeStats }) => {
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

// ========== 统一照片卡片组件（支持 filter/import/export + 分组/平铺） ==========
interface PhotoCardProps {
  photo: Photo;
  width: number; height: number; page: PhotoPage;
  isHighlighted: boolean; isFocused: boolean;
  onClick: () => void; onDoubleClick: () => void; onContextMenu: (e: React.MouseEvent) => void; onFocus: () => void;
  setRef: (el: HTMLDivElement | null) => void;
}

const PhotoCard: React.FC<PhotoCardProps> = React.memo(({
  photo, width, height, page, isHighlighted, isFocused, onClick, onDoubleClick, onContextMenu, onFocus, setRef,
}) => {
  const [hasError, setHasError] = useState(false);
  const eyeStats = usePhotoFilterStore((s) => s.lstPhotosEyeStats.get(photo.filePath) ?? null); // 获取眨眼统计

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

  // 仅在 filter 页面显示眨眼统计指示器
  const showEyeStats = page === "filter" && eyeStats && (eyeStats.closedEyesCount > 0 || eyeStats.suspiciousCount > 0 || eyeStats.openEyesCount > 0);

  return (
    <div
      ref={setRef}
      tabIndex={0}
      style={{ width, height }}
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
        {/* 眨眼统计指示器（仅 filter 页面显示） */}
        {showEyeStats && <EyeStateBadge eyeStats={eyeStats} />}
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
  prev.width === next.width &&
  prev.height === next.height &&
  prev.page === next.page
));

// ========== 虚拟化常量与类型定义 ==========
const ITEM_WIDTH = 200; // 每个格子宽度 (px)
const ITEM_HEIGHT = 220; // 每个格子高度（含标题区）(px)
const GAP = 12; // 格子间距 (px)
const GROUP_HEADER_HEIGHT = 28; // 分组标题行高度 (px)
const OVERSCAN = 2; // 上下额外渲染行数

type VirtualRowType = "header" | "photos"; // 虚拟行类型：标题行或照片行
interface VirtualRow {
  type: VirtualRowType; // 行类型
  groupIndex: number; // 所属分组索引
  rowInGroup?: number; // 该分组内的行号
  photos?: Photo[]; // type=photos 时为该行照片
  label?: string; // type=header 时为分组标签
}

export interface PhotoGridEnhanceProps extends PhotoGridProps {
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
}

// ========== 主网格组件（统一虚拟化：支持分组+平铺模式） ==========
export const PhotoGridEnhance = React.memo(function PhotoGridEnhance({
  photos = [],
  groupedPhotos = [], // 分组模式下的分组数据
  page = "filter",
  isGroupMode = false, // 是否为分组模式（GalleryPanel 使用）
  containerHeight = "100%",
  onPhotoClick,
}: PhotoGridEnhanceProps) {
  const { t } = useTranslation();
  const scrollViewportRef = useRef<HTMLDivElement>(null); // ScrollArea 内部 viewport
  const [containerWidth, setContainerWidth] = useState(800);
  const itemRefs = useRef<Map<string, HTMLDivElement | null>>(new Map()); // filePath -> 元素引用

  const columns = useMemo(() => Math.max(1, Math.floor((containerWidth + GAP) / (ITEM_WIDTH + GAP))), [containerWidth]); // 动态计算列数

  // 监听容器宽度变化
  useEffect(() => {
    if (!scrollViewportRef.current?.parentElement) return;
    const container = scrollViewportRef.current.parentElement;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setContainerWidth(entries[0].contentRect.width);
    });
    observer.observe(container);
    setContainerWidth(container.clientWidth);
    return () => observer.disconnect();
  }, []);

  // 从 store 订阅状态（精细化选择器）
  const boolShowDeleteConfirm = usePhotoFilterStore((s) => s.boolShowDeleteConfirm); // 删除确认对话框开关
  const boolSkipDeleteConfirm = usePhotoFilterStore((s) => s.boolSkipDeleteConfirm); // 跳过删除确认
  const objPendingDeletePhoto = usePhotoFilterStore((s) => s.objPendingDeletePhoto); // 待删除照片
  const fnCloseDeleteConfirm = usePhotoFilterStore((s) => s.fnCloseDeleteConfirm); // 关闭删除确认
  const fnSetSkipDeleteConfirm = usePhotoFilterStore((s) => s.fnSetSkipDeleteConfirm); // 设置跳过删除确认
  const fnExecuteDeleteFile = usePhotoFilterStore((s) => s.fnExecuteDeleteFile); // 执行删除文件
  const boolShowInfoDialog = usePhotoFilterStore((s) => s.boolShowInfoDialog); // 元数据弹窗开关
  const objInfoPhoto = usePhotoFilterStore((s) => s.objInfoPhoto); // 元数据照片
  const objInfoMetadata = usePhotoFilterStore((s) => s.objInfoMetadata); // 元数据
  const fnCloseInfoDialog = usePhotoFilterStore((s) => s.fnCloseInfoDialog); // 关闭元数据弹窗
  const contextMenuGroups = usePhotoFilterStore((s) => s.contextMenuGroups); // 右键菜单配置
  const fnHandleContextMenuAction = usePhotoFilterStore((s) => s.fnHandleContextMenuAction); // 右键菜单动作
  const storeFocusedPath = usePhotoFilterStore((s) => s.focusedPhotoFilePath); // 焦点照片路径（store）
  const storeHighlightPaths = usePhotoFilterStore((s) => s.highlightedPhotoFilePaths); // 高亮路径集合（store）

  // 本地 focus 状态（用于 import/export 页面，filter 页面使用 store）
  const [localFocusedPath, setLocalFocusedPath] = useState<string | null>(null);
  const [localHighlightPaths, setLocalHighlightPaths] = useState<Set<string>>(new Set());

  const isFilterPage = page === "filter"; // 判断是否为 filter 页面
  const focusedPath = isFilterPage ? storeFocusedPath : localFocusedPath; // 焦点路径（综合 store + local）
  const highlightedPaths = isFilterPage ? storeHighlightPaths : localHighlightPaths; // 高亮路径（综合 store + local）

  // 构建虚拟行列表（分组或平铺）
  const virtualRows: VirtualRow[] = useMemo(() => {
    const rows: VirtualRow[] = [];
    if (isGroupMode && groupedPhotos.length > 0) {
      // 分组模式：header + photos 行
      groupedPhotos.forEach((group, gi) => {
        if (group.length === 0) return;
        rows.push({ type: "header", groupIndex: gi, label: `${t("filterPage.groupLabel") || "Group"} ${gi + 1}` }); // 分组标题行
        for (let i = 0, rowIdx = 0; i < group.length; i += columns, rowIdx++) {
          rows.push({ type: "photos", groupIndex: gi, rowInGroup: rowIdx, photos: group.slice(i, i + columns) }); // 照片行
        }
      });
    } else {
      // 平铺模式：直接按列数分行
      for (let i = 0; i < photos.length; i += columns) {
        rows.push({ type: "photos", groupIndex: 0, rowInGroup: Math.floor(i / columns), photos: photos.slice(i, i + columns) });
      }
    }
    return rows;
  }, [isGroupMode, groupedPhotos, photos, columns, t]);

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
    // 在分组或平铺模式中查找照片
    let targetPhoto: Photo | null = null;
    if (isGroupMode) {
      for (const group of groupedPhotos) {
        targetPhoto = group.find((p) => p.filePath === filePath) || null;
        if (targetPhoto) break;
      }
    } else {
      targetPhoto = photos.find((p) => p.filePath === filePath) || null;
    }
    if (!targetPhoto) return;

    if (isFilterPage) {
      triggerClick(targetPhoto, event); // filter 页面触发外部回调
    } else {
      setLocalFocusedPath(filePath); // import/export 页面更新本地状态
      setLocalHighlightPaths(new Set([filePath]));
      if (event === "Change" && onPhotoClick) setTimeout(() => void onPhotoClick([targetPhoto], event), 0);
    }

    // 确保键盘焦点在 scrollViewport
    setTimeout(() => { try { scrollViewportRef.current?.focus(); } catch (e) { /* ignore */ } }, 0);
  }, [isFilterPage, isGroupMode, groupedPhotos, photos, triggerClick, onPhotoClick]);

  // 键盘导航：支持分组和平铺模式（方向键 + Enter）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(e.key)) return;

    // 无焦点时，任意方向键选中首张照片
    if (!focusedPath && e.key !== "Enter") {
      const firstPhotos = isGroupMode ? groupedPhotos[0] : photos;
      const firstPhoto = firstPhotos?.[0];
      if (firstPhoto) { e.preventDefault(); e.stopPropagation(); selectByPath(firstPhoto.filePath, "Select"); }
      return;
    }

    if (!focusedPath) return; // 无焦点且非选择操作，返回

    // 查找焦点照片所在的位置（分组索引 + 组内索引）
    let gIdx = -1, pIdx = -1; // gIdx: 分组索引, pIdx: 组内照片索引
    if (isGroupMode) {
      outer: for (let gi = 0; gi < groupedPhotos.length; gi++) {
        const group = groupedPhotos[gi];
        for (let pi = 0; pi < group.length; pi++) {
          if (group[pi].filePath === focusedPath) { gIdx = gi; pIdx = pi; break outer; }
        }
      }
    } else {
      pIdx = photos.findIndex((p) => p.filePath === focusedPath);
      gIdx = pIdx < 0 ? -1 : 0; // 平铺模式只有一个"分组"
    }
    if (gIdx < 0 || pIdx < 0) return; // 未找到焦点

    const group = isGroupMode ? groupedPhotos[gIdx] : photos; // 当前分组或全部照片
    const rowIdx = Math.floor(pIdx / columns), colIdx = pIdx % columns; // 当前行列位置
    const totalRows = Math.ceil(group.length / columns); // 当前分组总行数
    let nextPhoto: Photo | null = null;

    e.preventDefault();
    e.stopPropagation();

    switch (e.key) {
      case "ArrowLeft": // 左移：同组内前一个 → 上一组末尾
        if (pIdx > 0) nextPhoto = group[pIdx - 1]; // 组内前一个
        else if (isGroupMode && gIdx > 0) nextPhoto = groupedPhotos[gIdx - 1].at(-1)!; // 上一组最后一个
        break;

      case "ArrowRight": // 右移：同组内后一个 → 下一组首个
        if (pIdx < group.length - 1) nextPhoto = group[pIdx + 1]; // 组内后一个
        else if (isGroupMode && gIdx < groupedPhotos.length - 1) nextPhoto = groupedPhotos[gIdx + 1][0]; // 下一组第一个
        break;

      case "ArrowUp": // 上移：同列上一行 → 上一组同列（不足则取末尾）
        if (rowIdx > 0) nextPhoto = group[(rowIdx - 1) * columns + colIdx]; // 同组上一行
        else if (isGroupMode && gIdx > 0) { // 跨组到上一组最后行同列
          const prev = groupedPhotos[gIdx - 1];
          const prevLastRowStart = Math.floor((prev.length - 1) / columns) * columns;
          nextPhoto = prev[Math.min(prevLastRowStart + colIdx, prev.length - 1)];
        }
        break;

      case "ArrowDown": // 下移：同列下一行 → 下一组首行同列（不足则取末尾）
        if (rowIdx < totalRows - 1) { // 同组下一行
          const nextIdx = (rowIdx + 1) * columns + colIdx;
          nextPhoto = group[Math.min(nextIdx, group.length - 1)]; // 不足取末尾
        } else if (isGroupMode && gIdx < groupedPhotos.length - 1) { // 跨组到下一组首行同列
          const next = groupedPhotos[gIdx + 1];
          nextPhoto = next[Math.min(colIdx, next.length - 1)];
        }
        break;

      case "Enter": // 回车：激活当前照片
        triggerClick(group[pIdx], "Change");
        break;
    }

    if (nextPhoto) selectByPath(nextPhoto.filePath, "Select");
  }, [focusedPath, isGroupMode, groupedPhotos, photos, columns, selectByPath, triggerClick]);

  // 焦点滚动与键盘焦点管理
  useEffect(() => {
    if (focusedPath) {
      const scrollElement = scrollViewportRef.current;
      if (scrollElement) {
        const itemEl = itemRefs.current.get(focusedPath);
        if (itemEl) itemEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" }); // 滚动到焦点
        setTimeout(() => { try { scrollElement.focus(); } catch (e) { /* ignore */ } }, 120); // 确保键盘焦点在 scroll 容器
      }
    }
  }, [focusedPath]);

  // 右键菜单处理
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; photo: Photo | null }>({ visible: false, x: 0, y: 0, photo: null });
  const handleContextMenu = useCallback((e: React.MouseEvent, photo: Photo) => {
    e.preventDefault();
    e.stopPropagation();
    selectByPath(photo.filePath, "Select"); // 先选中
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, photo }); // 显示菜单
  }, [selectByPath]);

  // 获取所有照片列表（平铺或分组合并）
  const allPhotos = useMemo(() => isGroupMode ? groupedPhotos.flat() : photos, [isGroupMode, groupedPhotos, photos]);

  return (
    <>
      <ScrollArea className="relative h-full w-full" style={{ height: containerHeight }}>
        <div
          ref={scrollViewportRef}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="h-full w-full outline-none"
        >
          {/* 虚拟化内容区域 */}
          {virtualRows.length > 0 ? (
            <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const row = virtualRows[virtualItem.index];
                if (!row) return null;

                if (row.type === "header") {
                  // 分组标题行
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

                // 照片行
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
                      padding: `0 ${GAP}px`,
                    }}
                  >
                    {row.photos?.map((photo) => (
                      <PhotoCard
                        key={photo.filePath}
                        photo={photo}
                        width={ITEM_WIDTH}
                        height={ITEM_HEIGHT - GAP}
                        page={page}
                        isHighlighted={highlightedPaths.has(photo.filePath)}
                        isFocused={focusedPath === photo.filePath}
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
                      <div className="mb-3 rounded-full bg-white dark:bg-slate-800 p-4 shadow-sm">
                        <ImageIcon className="h-8 w-8 opacity-30" />
                      </div>
                      <p className="text-sm font-medium">
                        {t("importPage.noPhotosFoundTitle") || "No photos found"}
                      </p>
                      <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                        {t("importPage.noPhotosFoundDesc") ||
                          "Try adjusting filters, importing more photos, or running a new detection task."}
                      </p>
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
          page={page} groups={contextMenuGroups}
          onClose={() => setContextMenu((c) => ({ ...c, visible: false }))}
          onAction={(action) => {
            if (contextMenu.photo) fnHandleContextMenuAction(action, contextMenu.photo, page);
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
    </>
  );
}, (prev, next) => (
  prev.page === next.page &&
  prev.isGroupMode === next.isGroupMode &&
  prev.containerHeight === next.containerHeight &&
  prev.onPhotoClick === next.onPhotoClick &&
  (prev.isGroupMode ? areGroupedPhotosEqual(prev.groupedPhotos, next.groupedPhotos) : arePhotoArraysEqual(prev.photos, next.photos))
));

// ========== 删除确认对话框（Portal 版本）==========
interface DeleteConfirmPortalProps {
  open: boolean;
  photo: Photo | null;
  skipConfirm: boolean;
  onClose: () => void;
  onSetSkipConfirm: (skip: boolean) => void;
  onConfirm: () => Promise<void>;
}

/**
 * 删除确认对话框：使用 Portal 挂载到 body，
 * 避免父组件状态变化导致的界面闪烁和阻塞重绘问题。
 */
const DeleteConfirmPortal: React.FC<DeleteConfirmPortalProps> = ({
  open,
  photo,
  skipConfirm,
  onClose,
  onSetSkipConfirm,
  onConfirm,
}) => {
  const { t } = useTranslation();

  const dialogContent = (
    <AlertDialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("photoContext.confirmDeleteTitle", "Delete photo file")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "photoContext.confirmDeleteDesc",
              "This will permanently delete the file from disk. This action cannot be undone.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="bg-muted my-2 rounded-md px-3 py-2 text-xs">
          <div className="font-mono break-all">{photo?.filePath}</div>
        </div>
        <div className="mt-2 flex items-center space-x-2">
          <Checkbox
            id="skip-delete-confirm"
            checked={skipConfirm}
            onCheckedChange={(checked: boolean) =>
              onSetSkipConfirm(checked === true)
            }
          />
          <label
            htmlFor="skip-delete-confirm"
            className="text-muted-foreground text-xs select-none"
          >
            {t(
              "photoContext.skipConfirmLabel",
              "Do not ask again (use with caution)",
            )}
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {t("photoContext.confirmDeleteButton", "Delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  // SSR 环境下直接返回内容
  if (typeof document === "undefined") {
    return dialogContent;
  }

  return ReactDOM.createPortal(dialogContent, document.body);
};


