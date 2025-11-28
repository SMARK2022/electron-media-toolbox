/**
 * PhotoGrid 组件
 * ============
 * 照片网格展示组件，支持以下功能：
 * - 懒加载图片，进入视口后才加载
 * - 眨眼状态指示条（磨砂玻璃风格），显示闭眼/疑似/正常人脸数量
 * - 右键菜单：打开文件、打开文件夹、启用/禁用、删除等操作
 * - 删除确认对话框（Portal 挂载，避免界面阻塞）
 * - 照片详情弹窗（元数据展示）
 * - 键盘导航（方向键 + Enter）
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import ReactDOM from "react-dom";
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
  aspectRatio?: "portrait" | "square";
  width?: number;
  height?: number;
  columns?: number;
  /**
   * 当前所在业务页面，用于在统一 store 中区分来源（导入 / 筛选 / 导出）。
   * 如果不传则默认视为 "filter" 页面，保证兼容性。
   */
  page?: PhotoPage;
}

// ========== 右键菜单组件 ==========
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /**
   * 点击菜单项时触发的回调，传递菜单项 id，由上层统一处理具体动作。
   */
  onAction: (actionId: string) => void;
  targetName: string;
  isEnabled: boolean;
  /** 当前所在业务页面，用于控制哪些菜单可用（导入 / 筛选 / 导出） */
  page: PhotoPage;
  /**
   * 从全局 store 注入的菜单分组配置，支持不同分组及菜单项。
   */
  groups: {
    id: string;
    label: string;
    items: {
      id: string;
      label: string;
      i18nKey?: string;
      icon?: string;
    }[];
  }[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onAction,
  targetName,
  isEnabled,
  page,
  groups,
}) => {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  // 防止菜单溢出屏幕
  const adjustedStyle = { top: y, left: x };
  if (typeof window !== "undefined") {
    if (x + 220 > window.innerWidth) adjustedStyle.left = x - 220;
    if (y + 280 > window.innerHeight) adjustedStyle.top = y - 280;
  }

  return (
    <div
      ref={menuRef}
      style={adjustedStyle}
      className="animate-in fade-in zoom-in-95 fixed z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white/95 text-sm shadow-xl backdrop-blur-sm duration-100 dark:border-slate-700 dark:bg-slate-800/95"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="truncate border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        {ellipsizeMiddle(targetName, 32)}
      </div>
      <div className="p-1">
        {groups.map((group) => {
          // 如果当前不是 filter 页面，则完全移除启用/禁用项，而不是显示为不可点
          const itemsToShow = group.items.filter(
            (item) => !(item.id === "toggle-enabled" && page !== "filter"),
          );

          // 如果分组在当前上下文没有任何要展示的项，则跳过渲染该分组
          if (itemsToShow.length === 0) return null;

          return (
            <div key={group.id} className="mb-1 last:mb-0">
              {/* 分组标题行 */}
              <div className="px-2 pt-1 text-[11px] font-semibold tracking-wide text-gray-400 uppercase dark:text-slate-500">
                {group.label}
              </div>
              {itemsToShow.map((item) => {
                // 根据 item.icon 提示选择一个合适的 lucide 图标，保持视觉统一
                let iconNode: React.ReactNode = null;
                if (item.icon === "open") {
                  iconNode = <ExternalLink size={14} />;
                } else if (item.icon === "folder") {
                  iconNode = <FolderOpen size={14} />;
                } else if (item.icon === "toggle") {
                  iconNode = isEnabled ? (
                    <XCircle size={14} />
                  ) : (
                    <CheckCircle2 size={14} />
                  );
                } else if (
                  item.icon === "delete-db" ||
                  item.icon === "delete-file"
                ) {
                  iconNode = <Trash2 size={14} />;
                } else if (item.icon === "info") {
                  iconNode = <Info size={14} />;
                }

                // 启用 / 禁用 菜单项需要根据当前 isEnabled 状态调整文案和颜色
                const isToggleItem = item.id === "toggle-enabled";
                // 非筛选页（如 import / export）现在已被过滤掉，不会到达这里
                const canToggleEnabled = page === "filter";

                // 文案统一从 store 中的默认定义读取，如果提供了 i18nKey 则优先走 i18n
                const baseLabel = item.i18nKey
                  ? t(item.i18nKey, item.label)
                  : item.label;

                const dynamicLabel = isToggleItem
                  ? isEnabled
                    ? t("photoContext.menu.toggleEnabled.disable", "标记为禁用")
                    : t("photoContext.menu.toggleEnabled.enable", "标记为启用")
                  : baseLabel;

                const dynamicClassName = item.id === "delete-db"
                    ? "text-orange-500 hover:bg-orange-50 hover:text-orange-600 dark:text-orange-400 dark:hover:bg-orange-950/30"
                    : item.id === "delete-file"
                      ? "text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                      : "dark:text-slate-200";

                const isDisabled = isToggleItem && !canToggleEnabled;

                return (
                  <ContextMenuItem
                    key={item.id}
                    icon={iconNode}
                    label={dynamicLabel}
                    onClick={() => {
                      if (isDisabled) return;
                      onAction(item.id);
                    }}
                    className={dynamicClassName}
                  />
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

const ContextMenuItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}> = ({ icon, label, onClick, className }) => (
  <button
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-slate-700",
      className,
    )}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ========== 工具函数（保持原有逻辑）==========
function ellipsizeMiddle(name: string, maxLength = 36): string {
  if (!name || name.length <= maxLength) return name;

  const dotIndex = name.lastIndexOf(".");
  let base = name;
  let ext = "";

  if (dotIndex > 0 && dotIndex < name.length - 1) {
    base = name.slice(0, dotIndex);
    ext = name.slice(dotIndex);
  }

  const remain = maxLength - 3 - ext.length;
  if (remain <= 0) return name.slice(0, maxLength - 3) + "...";

  const front = Math.ceil(remain / 2);
  const back = Math.floor(remain / 2);

  return `${base.slice(0, front)}...${base.slice(
    Math.max(base.length - back, front),
  )}${ext}`;
}

// ========== 懒加载图片组件 ==========
interface LazyImageContainerProps {
  photo: Photo;
  page?: PhotoPage;
}

/**
 * 眨眼状态指示条（磨砂玻璃风格）
 * 根据 store 中的眨眼统计数据渲染三种状态：闭眼/疑似/正常
 */
interface EyeStateBadgeProps {
  eyeStats?: {
    closedEyesCount: number;
    suspiciousCount: number;
    openEyesCount: number;
  } | null;
}

const EyeStateBadge: React.FC<EyeStateBadgeProps> = React.memo(({ eyeStats }) => {
  if (!eyeStats) return null;

  const { closedEyesCount, suspiciousCount, openEyesCount } = eyeStats;
  // 若三种状态都为0，不显示指示条
  if (closedEyesCount === 0 && suspiciousCount === 0 && openEyesCount === 0)
    return null;

  const hasIssues = closedEyesCount > 0 || suspiciousCount > 0;

  return (
    <div
      className={cn(
        "absolute top-2 right-2 z-10 flex items-center gap-0 overflow-hidden rounded-md border shadow-sm backdrop-blur-md transition-all duration-300 select-none",
        "border-white/10 bg-zinc-950/85 shadow-black/20",
      )}
    >
      {/* 闭眼（最严重警告） */}
      {closedEyesCount > 0 && (
        <div className="flex items-center gap-1 border-r border-white/10 px-1 py-1 text-rose-400 last:border-0">
          <EyeOff size={12} strokeWidth={2.5} />
          <span className="font-mono text-[10px] leading-none font-bold text-white/90">
            {closedEyesCount}
          </span>
        </div>
      )}
      {/* 疑似闭眼（次级警告） */}
      {suspiciousCount > 0 && (
        <div className="flex items-center gap-1 border-r border-white/10 px-1 py-1 text-amber-400 last:border-0">
          <AlertTriangle size={12} strokeWidth={2.5} />
          <span className="font-mono text-[10px] leading-none font-bold text-white/90">
            {suspiciousCount}
          </span>
        </div>
      )}
      {/* 正常睁眼 */}
      {openEyesCount > 0 && (
        <div
          className={cn(
            "flex items-center gap-1 px-1 py-1 last:border-0 text-emerald-400",
          )}
        >
          <Eye size={12} strokeWidth={hasIssues ? 2 : 2.5} />
          <span
            className={cn(
              "font-mono text-[10px] leading-none font-bold text-white/90",
            )}
          >
            {openEyesCount}
          </span>
        </div>
      )}
    </div>
  );
});

/**
 * 懒加载图片容器组件
 * 使用 React.memo 和精细化的 store selector 优化渲染性能
 * 通过外部注入的全局 observer 进行懒加载（避免每个 cell 创建独立 observer）
 */
interface LazyImageContainerPropsWithObserver extends LazyImageContainerProps {
  observer?: IntersectionObserver | null;
}

const LazyImageContainer = React.memo(function LazyImageContainer({
  photo,
  page = "filter",
  observer: globalObserver,
}: LazyImageContainerPropsWithObserver) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // 使用精细化 selector，只订阅当前照片的眨眼统计数据
  const eyeStats = usePhotoFilterStore((s) =>
    s.lstPhotosEyeStats.get(photo.filePath) ?? null,
  );

  // 使用全局 observer 或浏览器原生 lazy loading，避免每个 cell 创建独立 observer
  useEffect(() => {
    if (!globalObserver || !imgRef.current) return;

    const handleIntersection = (entries: IntersectionObserverEntry[]) => {
      entries.forEach((entry) => {
        if (entry.target === imgRef.current && entry.isIntersecting) {
          setIsVisible(true);
        }
      });
    };

    const observer = new IntersectionObserver(handleIntersection, {
      root: null,
      threshold: 0.01,
    });
    observer.observe(imgRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (photo.fileUrl) {
      setThumbnailUrl(photo.fileUrl);
      setHasError(false);
    } else if (isVisible) {
      setThumbnailUrl(null);
      setHasError(true);
    }
  }, [isVisible, photo.fileUrl]);

  // 评分颜色逻辑（使用 useMemo 避免重复计算）
  const { colorStyle, formattedInfo, showInfo } = useMemo(() => {
    const infoStr = photo.info ?? "";
    const numericInfo = /^[0-9]+(\.[0-9]+)?$/.test(infoStr)
      ? parseFloat(infoStr)
      : NaN;

    const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

    const colorStyle = !Number.isNaN(numericInfo)
      ? numericInfo <= 50
        ? `rgb(${clamp(255 - numericInfo * 5)}, ${clamp(numericInfo * 5)}, 0)`
        : `rgb(0, ${clamp(255 - (numericInfo - 50) * 5)}, ${clamp((numericInfo - 50) * 5)})`
      : undefined;

    const formattedInfo = !Number.isNaN(numericInfo)
      ? numericInfo.toFixed(6)
      : infoStr;

    return {
      colorStyle,
      formattedInfo,
      showInfo: formattedInfo !== "",
    };
  }, [photo.info]);

  const displayName = useMemo(() => ellipsizeMiddle(photo.fileName), [photo.fileName]);

  // 只在筛选页面显示眨眼统计指示器
  const showEyeStats =
    page === "filter" &&
    eyeStats &&
    (eyeStats.closedEyesCount > 0 ||
      eyeStats.suspiciousCount > 0 ||
      eyeStats.openEyesCount > 0);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-slate-800">
      {/* 图片区域 */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gray-100 dark:bg-slate-900">
        <img
          ref={imgRef}
          src={hasError ? missing_icon : thumbnailUrl || missing_icon}
          alt={photo.fileName}
          loading="lazy"
          className="h-[160px] max-w-full transform object-contain transition-transform duration-300 ease-in-out group-hover:scale-105"
          onError={() => setHasError(true)}
        />
        {/* 悬浮遮罩 */}
        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />

        {/* 眨眼统计指示器（磨砂玻璃风格） */}
        {showEyeStats && <EyeStateBadge eyeStats={eyeStats} />}
      </div>

      {/* 信息区域 */}
      <div className="flex w-full items-center justify-between border-t border-gray-100 bg-white px-3 py-2 text-xs dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-1 flex-col overflow-hidden">
          <p
            className="truncate leading-tight font-medium text-gray-700 dark:text-slate-200"
            title={photo.fileName}
          >
            {displayName}
          </p>
          {showInfo && (
            <p
              className="mt-0.5 font-mono text-[11px]"
              style={{ color: colorStyle }}
            >
              {formattedInfo}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}, (prev, next) => {
  // 自定义比较函数，避免因 photo 对象引用变化导致的无意义重渲染
  return (
    prev.page === next.page &&
    prev.photo.filePath === next.photo.filePath &&
    prev.photo.isEnabled === next.photo.isEnabled &&
    prev.photo.info === next.photo.info &&
    prev.photo.fileUrl === next.photo.fileUrl
  );
});

// ========== 单个照片项组件（优化渲染）==========
interface PhotoGridItemProps {
  photo: Photo;
  index: number;
  width: number;
  page: PhotoPage;
  isHighlighted: boolean;
  isFocused: boolean;
  observer?: IntersectionObserver | null;
  onSelect: (index: number, event: "Select" | "Change") => void;
  onContextMenu: (e: React.MouseEvent, photo: Photo, index: number) => void;
  onFocus: (index: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

const PhotoGridItem = React.memo(
  ({
    photo,
    index,
    width,
    page,
    isHighlighted,
    isFocused,
    observer,
    onSelect,
    onContextMenu,
    onFocus,
    setRef,
  }: PhotoGridItemProps) => {
    return (
      <div
        ref={setRef}
        tabIndex={0}
        style={{ width: `${width}px` }}
        className={cn(
          "group relative flex-none overflow-hidden rounded-lg border transition-all duration-200",
          "cursor-pointer hover:shadow-lg focus-visible:outline-none",
          isHighlighted
            ? "border-blue-500 shadow-md ring-2 ring-blue-200 dark:ring-blue-900"
            : "border-gray-200 shadow-sm hover:border-gray-300 dark:border-slate-700 dark:hover:border-slate-600",
          !photo.isEnabled && "opacity-40 grayscale",
        )}
        onClick={() => onSelect(index, "Select")}
        onDoubleClick={() => onSelect(index, "Change")}
        onContextMenu={(e) => onContextMenu(e, photo, index)}
        onFocus={() => onFocus(index)}
      >
        <LazyImageContainer photo={photo} page={page} observer={observer} />

        {/* 选中高光效果 */}
        {isHighlighted && (
          <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500 ring-inset" />
        )}
      </div>
    );
  },
  (prev, next) => {
    // 深度比较 photo 属性，忽略函数引用变化
    const photoChanged =
      prev.photo.filePath !== next.photo.filePath ||
      prev.photo.isEnabled !== next.photo.isEnabled ||
      prev.photo.info !== next.photo.info ||
      prev.photo.fileUrl !== next.photo.fileUrl;

    return (
      !photoChanged &&
      prev.isHighlighted === next.isHighlighted &&
      prev.isFocused === next.isFocused &&
      prev.width === next.width &&
      prev.page === next.page &&
      prev.index === next.index &&
      prev.observer === next.observer
    );
  },
);

// ========== 辅助函数：浅比较 Photo 数组 ==========
const shallowEqualPhotoArray = (prev: Photo[], next: Photo[]): boolean => {
  if (prev.length !== next.length) return false;
  return prev.every((p, i) => p.filePath === next[i].filePath && p.isEnabled === next[i].isEnabled && p.info === next[i].info && p.fileUrl === next[i].fileUrl);
};

// ========== 主网格组件 ==========
export const PhotoGridEnhance = React.memo(function PhotoGridEnhance({
  photos = [],
  width = 200,
  onPhotoClick,
  onContextMenuAction,
  page = "filter",
}: PhotoGridProps & {
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
  onContextMenuAction?: (action: string, photo: Photo) => void;
}) {
  const { t } = useTranslation();

  // 创建全局 IntersectionObserver 单例
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    if (!observerRef.current) {
      observerRef.current = new IntersectionObserver(
        (entries) => entries.forEach((e) => {
          if (e.isIntersecting) {
            const img = e.target as HTMLImageElement;
            if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
          }
        }),
        { root: null, threshold: 0.01 },
      );
    }
    return () => observerRef.current?.disconnect();
  }, []);

  // 从 store 订阅状态（精细化选择器）
  const boolShowDeleteConfirm = usePhotoFilterStore((s) => s.boolShowDeleteConfirm);
  const boolSkipDeleteConfirm = usePhotoFilterStore((s) => s.boolSkipDeleteConfirm);
  const objPendingDeletePhoto = usePhotoFilterStore((s) => s.objPendingDeletePhoto);
  const fnCloseDeleteConfirm = usePhotoFilterStore((s) => s.fnCloseDeleteConfirm);
  const fnSetSkipDeleteConfirm = usePhotoFilterStore((s) => s.fnSetSkipDeleteConfirm);
  const fnExecuteDeleteFile = usePhotoFilterStore((s) => s.fnExecuteDeleteFile);
  const boolShowInfoDialog = usePhotoFilterStore((s) => s.boolShowInfoDialog);
  const objInfoPhoto = usePhotoFilterStore((s) => s.objInfoPhoto);
  const objInfoMetadata = usePhotoFilterStore((s) => s.objInfoMetadata);
  const fnCloseInfoDialog = usePhotoFilterStore((s) => s.fnCloseInfoDialog);
  const contextMenuGroups = usePhotoFilterStore((s) => s.contextMenuGroups);
  const fnHandleContextMenuAction = usePhotoFilterStore((s) => s.fnHandleContextMenuAction);

  // filter 页面使用 store 管理 focus/highlight，其他页面使用本地 state
  const storeFocusedPath = usePhotoFilterStore((s) => s.focusedPhotoFilePath);
  const storeHighlightPaths = usePhotoFilterStore((s) => s.highlightedPhotoFilePaths);

  const photosArray = useMemo(() => (Array.isArray(photos) ? photos : []), [photos]);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; photo: Photo | null }>({ visible: false, x: 0, y: 0, photo: null });

  // 本地 focus 状态（用于 import/export 页面）
  const [localFocusedIndex, setLocalFocusedIndex] = useState<number | null>(null);
  const [localHighlightPaths, setLocalHighlightPaths] = useState<Set<string>>(new Set());

  // 根据页面类型决定使用 store 还是本地状态
  const isFilterPage = page === "filter";
  const focusedIndex = useMemo(() => {
    if (isFilterPage) {
      return storeFocusedPath ? photosArray.findIndex((p) => p.filePath === storeFocusedPath) : -1;
    }
    return localFocusedIndex ?? -1;
  }, [isFilterPage, storeFocusedPath, localFocusedIndex, photosArray]);

  const highlightedPaths = isFilterPage ? storeHighlightPaths : localHighlightPaths;

  // 重置 refs 数组
  useEffect(() => { itemRefs.current = new Array(photosArray.length).fill(null); }, [photosArray.length]);

  // 触发外部回调（异步包装避免阻塞）
  const triggerClick = useCallback((photo: Photo, event: string) => {
    if (onPhotoClick) setTimeout(() => void onPhotoClick([photo], event), 0);
  }, [onPhotoClick]);

  // 选择指定索引的照片（统一入口，区分页面类型）
  const selectByIndex = useCallback((idx: number, event: "Select" | "Change") => {
    const photo = photosArray[idx];
    if (!photo) return;

    if (isFilterPage) {
      triggerClick(photo, event); // filter 页面通过回调触发 store 更新
    } else {
      // import/export 页面使用本地状态
      setLocalFocusedIndex(idx);
      setLocalHighlightPaths(new Set([photo.filePath]));
      if (event === "Change" && onPhotoClick) {
        setTimeout(() => void onPhotoClick([photo], event), 0);
      }
    }
  }, [photosArray, isFilterPage, triggerClick, onPhotoClick]);

  // 查找垂直邻居（稳定版本算法，修复偏移问题）
  const findVerticalNeighbor = useCallback((currentIdx: number, dir: "up" | "down"): number | null => {
    const currentEl = itemRefs.current[currentIdx];
    if (!currentEl) return null;

    const currentRect = currentEl.getBoundingClientRect();
    const currentCx = currentRect.left + currentRect.width / 2;  // 当前元素中心 X
    const currentCy = currentRect.top + currentRect.height / 2;  // 当前元素中心 Y

    let bestIndex: number | null = null;
    let bestRowDelta = Infinity;
    let bestColDelta = Infinity;
    const rowEps = 4; // 行容差（px），同一行内的微小 Y 偏差视为同行

    itemRefs.current.forEach((el, i) => {
      if (!el || i === currentIdx) return;

      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const deltaY = cy - currentCy;
      const deltaX = cx - currentCx;

      // 方向过滤：上键只找上方元素，下键只找下方元素
      if (dir === "up" && cy >= currentCy) return;
      if (dir === "down" && cy <= currentCy) return;

      const rowDelta = Math.abs(deltaY);
      const colDelta = Math.abs(deltaX);

      // 优先选择行距最小的元素
      if (rowDelta + rowEps < bestRowDelta) {
        bestRowDelta = rowDelta;
        bestColDelta = colDelta;
        bestIndex = i;
      } else if (Math.abs(rowDelta - bestRowDelta) <= rowEps) {
        // 行距相近时，选择列距最小的（最接近当前列的）
        if (colDelta < bestColDelta) {
          bestColDelta = colDelta;
          bestIndex = i;
        }
      }
    });
    return bestIndex;
  }, []);

  // 自动滚动到焦点元素
  useEffect(() => {
    if (focusedIndex >= 0) {
      itemRefs.current[focusedIndex]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [focusedIndex]);

  // 右键菜单处理
  const handleContextMenu = useCallback((e: React.MouseEvent, photo: Photo, idx: number) => {
    e.preventDefault(); e.stopPropagation();
    selectByIndex(idx, "Select");
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY, photo });
  }, [selectByIndex]);

  // 键盘导航（简化逻辑，支持所有页面）
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!photosArray.length) return;

    // 无焦点时按方向键选中第一个
    if (focusedIndex < 0) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        selectByIndex(0, "Select");
      }
      return;
    }

    switch (e.key) {
      case "ArrowUp": case "ArrowDown": {
        e.preventDefault();
        const targetIdx = findVerticalNeighbor(focusedIndex, e.key === "ArrowUp" ? "up" : "down");
        if (targetIdx !== null) selectByIndex(targetIdx, "Select");
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (focusedIndex > 0) selectByIndex(focusedIndex - 1, "Select");
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (focusedIndex < photosArray.length - 1) selectByIndex(focusedIndex + 1, "Select");
        break;
      }
      case "Enter": {
        e.preventDefault();
        selectByIndex(focusedIndex, "Change");
        break;
      }
    }
  }, [photosArray.length, focusedIndex, selectByIndex, findVerticalNeighbor]);

  return (
    <>
      <div className="flex flex-wrap gap-3 outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
        {photosArray.map((photo, index) => (
          <PhotoGridItem
            key={`${index}-${photo.filePath}`}
            photo={photo}
            index={index}
            width={width}
            page={page}
            isHighlighted={highlightedPaths.has(photo.filePath)}
            isFocused={focusedIndex === index}
            observer={observerRef.current}
            onSelect={selectByIndex}
            onContextMenu={handleContextMenu}
            onFocus={(i) => selectByIndex(i, "Select")}
            setRef={(el) => { itemRefs.current[index] = el; }}
          />
        ))}
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.photo && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          targetName={contextMenu.photo.fileName}
          isEnabled={contextMenu.photo.isEnabled ?? true}
          page={page} groups={contextMenuGroups}
          onClose={() => setContextMenu((c) => ({ ...c, visible: false }))}
          onAction={(action) => {
            if (contextMenu.photo) {
              onContextMenuAction ? onContextMenuAction(action, contextMenu.photo) : void fnHandleContextMenuAction(action, contextMenu.photo, page);
            }
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
  prev.width === next.width && prev.page === next.page &&
  prev.onPhotoClick === next.onPhotoClick && prev.onContextMenuAction === next.onContextMenuAction &&
  shallowEqualPhotoArray(prev.photos || [], next.photos || [])
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


