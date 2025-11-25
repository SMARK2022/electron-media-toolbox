import React, { useEffect, useRef, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import missing_icon from "@/assets/images/cat_missing.svg";
import { Photo } from "@/lib/db";
import { cn } from "@/lib/utils";
import {
  Eye,
  Trash2,
  Download,
  Share2,
  Info,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface PhotoGridProps {
  photos?: Photo[];
  aspectRatio?: "portrait" | "square";
  width?: number;
  height?: number;
  columns?: number;
}

// ========== 右键菜单组件 ==========
interface ContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  onAction: (action: string) => void;
  targetName: string;
  isEnabled: boolean;
}

const ContextMenu: React.FC<ContextMenuProps> = ({
  x,
  y,
  onClose,
  onAction,
  targetName,
  isEnabled,
}) => {
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
      className="animate-in fade-in zoom-in-95 fixed z-50 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white/95 text-sm shadow-xl backdrop-blur-sm duration-100"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="truncate border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500">
        {ellipsizeMiddle(targetName, 32)}
      </div>
      <div className="p-1">
        <ContextMenuItem
          icon={<Eye size={14} />}
          label="查看详情"
          onClick={() => onAction("view")}
        />
        <ContextMenuItem
          icon={<Info size={14} />}
          label="显示信息"
          onClick={() => onAction("info")}
        />
        <ContextMenuItem
          icon={<Download size={14} />}
          label="下载原图"
          onClick={() => onAction("download")}
        />
        <ContextMenuItem
          icon={<Share2 size={14} />}
          label="分享"
          onClick={() => onAction("share")}
        />
        <div className="my-1 h-px bg-gray-100" />
        <ContextMenuItem
          icon={isEnabled ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
          label={isEnabled ? "标记为弃用" : "标记为启用"}
          onClick={() => onAction("toggle-status")}
          className={
            isEnabled
              ? "text-orange-600 hover:bg-orange-50 hover:text-orange-700"
              : "text-green-600 hover:bg-green-50 hover:text-green-700"
          }
        />
        <ContextMenuItem
          icon={<Trash2 size={14} />}
          label="删除照片"
          onClick={() => onAction("delete")}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        />
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
      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-gray-100",
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

// ========== 主网格组件 ==========
export function PhotoGridEnhance({
  photos = [],
  width = 200,
  onPhotoClick,
  highlightPhotos: initialHighlightPhotos,
  onContextMenuAction,
}: PhotoGridProps & {
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
  highlightPhotos?: Photo[];
  onContextMenuAction?: (action: string, photo: Photo) => void;
}) {
  const photosArray = Array.isArray(photos) ? photos : [];

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [highlightPhotos, setHighlightPhotos] = useState<Photo[] | undefined>(
    initialHighlightPhotos,
  );

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    photo: Photo | null;
  }>({ visible: false, x: 0, y: 0, photo: null });

  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  // 保持原有的高光判定逻辑
  const isPhotoHighlighted = (fileName: string): boolean =>
    !!(
      highlightPhotos?.some((photo) => photo.fileName === fileName) ||
      initialHighlightPhotos?.some((photo) => photo.fileName === fileName)
    );

  useEffect(() => {
    setHighlightPhotos(initialHighlightPhotos);
  }, [initialHighlightPhotos]);

  const triggerOnPhotoClick = useCallback(
    (selected: Photo[], event: string) => {
      if (!onPhotoClick) return;
      setTimeout(() => {
        void onPhotoClick(selected, event);
      }, 0);
    },
    [onPhotoClick],
  );

  const findVerticalNeighbor = (
    currentIndex: number,
    direction: "up" | "down",
  ): number | null => {
    const currentEl = itemRefs.current[currentIndex];
    if (!currentEl) return null;

    const currentRect = currentEl.getBoundingClientRect();
    const currentCx = currentRect.left + currentRect.width / 2;
    const currentCy = currentRect.top + currentRect.height / 2;

    let bestIndex: number | null = null;
    let bestRowDelta = Infinity;
    let bestColDelta = Infinity;
    const rowEps = 4;

    itemRefs.current.forEach((el, index) => {
      if (!el || index === currentIndex) return;

      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const deltaY = cy - currentCy;
      const deltaX = cx - currentCx;

      if (direction === "up" && cy >= currentCy) return;
      if (direction === "down" && cy <= currentCy) return;

      const rowDelta = Math.abs(deltaY);
      const colDelta = Math.abs(deltaX);

      if (rowDelta + rowEps < bestRowDelta) {
        bestRowDelta = rowDelta;
        bestColDelta = colDelta;
        bestIndex = index;
      } else if (Math.abs(rowDelta - bestRowDelta) <= rowEps) {
        if (colDelta < bestColDelta) {
          bestColDelta = colDelta;
          bestIndex = index;
        }
      }
    });

    return bestIndex;
  };

  useEffect(() => {
    if (focusedIndex == null) return;
    const el = itemRefs.current[focusedIndex];
    if (!el) return;

    el.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [focusedIndex]);

  const selectPhotoByIndex = (index: number, event: "Select" | "Change") => {
    const photo = photosArray[index];
    if (!photo) return;
    setFocusedIndex(index);
    setHighlightPhotos([photo]);
    triggerOnPhotoClick([photo], event);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (photosArray.length === 0) return;

    let newFocusedIndex = focusedIndex;

    if (focusedIndex === null) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        selectPhotoByIndex(0, "Select");
      }
      return;
    }

    switch (e.key) {
      case "ArrowUp": {
        e.preventDefault();
        if (focusedIndex !== null) {
          const targetIndex = findVerticalNeighbor(focusedIndex, "up");
          if (targetIndex !== null) {
            newFocusedIndex = targetIndex;
            selectPhotoByIndex(newFocusedIndex, "Select");
          }
        }
        break;
      }
      case "ArrowDown": {
        e.preventDefault();
        if (focusedIndex !== null) {
          const targetIndex = findVerticalNeighbor(focusedIndex, "down");
          if (targetIndex !== null) {
            newFocusedIndex = targetIndex;
            selectPhotoByIndex(newFocusedIndex, "Select");
          }
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (focusedIndex !== null && focusedIndex - 1 >= 0) {
          newFocusedIndex = focusedIndex - 1;
          selectPhotoByIndex(newFocusedIndex, "Select");
        }
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (focusedIndex !== null && focusedIndex + 1 < photosArray.length) {
          newFocusedIndex = focusedIndex + 1;
          selectPhotoByIndex(newFocusedIndex, "Select");
        }
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (focusedIndex !== null) {
          selectPhotoByIndex(focusedIndex, "Change");
        }
        break;
      }
      default:
        return;
    }
  };

  // 右键菜单处理
  const handleContextMenu = (
    e: React.MouseEvent,
    photo: Photo,
    index: number,
  ) => {
    e.preventDefault();
    e.stopPropagation();

    selectPhotoByIndex(index, "Select");

    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      photo: photo,
    });
  };

  return (
    <>
      <div
        className="flex flex-wrap gap-3 outline-none"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {photosArray.map((photo, index) => {
          const highlighted = isPhotoHighlighted(photo.fileName);

          return (
            <div
              key={photo.fileName}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              tabIndex={0}
              style={{ width: `${width}px` }}
              className={cn(
                "group relative flex-none overflow-hidden rounded-lg border transition-all duration-200",
                "cursor-pointer hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none",
                highlighted
                  ? "border-blue-500 shadow-md ring-2 ring-blue-200"
                  : "border-gray-200 shadow-sm hover:border-gray-300",
                !photo.isEnabled && "opacity-40 grayscale",
              )}
              onClick={() => selectPhotoByIndex(index, "Select")}
              onDoubleClick={() => selectPhotoByIndex(index, "Change")}
              onContextMenu={(e) => handleContextMenu(e, photo, index)}
              onFocus={() => setFocusedIndex(index)}
            >
              <LazyImageContainer photo={photo} />

              {/* 选中高光效果 */}
              {highlighted && (
                <div className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-blue-500 ring-inset" />
              )}
            </div>
          );
        })}
      </div>

      {/* 右键菜单 */}
      {contextMenu.visible && contextMenu.photo && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          targetName={contextMenu.photo.fileName}
          isEnabled={contextMenu.photo.isEnabled ?? true}
          onClose={() => setContextMenu({ ...contextMenu, visible: false })}
          onAction={(action) => {
            if (onContextMenuAction && contextMenu.photo) {
              onContextMenuAction(action, contextMenu.photo);
            }
            setContextMenu({ ...contextMenu, visible: false });
          }}
        />
      )}
    </>
  );
}

// ========== 懒加载图片组件（保持原有显示逻辑）==========
interface LazyImageContainerProps {
  photo: Photo;
}

function LazyImageContainer({ photo }: LazyImageContainerProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // 进入视口后再加载
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null,
        threshold: 0.01,
      },
    );

    if (imgRef.current) observer.observe(imgRef.current);

    return () => {
      if (imgRef.current) observer.unobserve(imgRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    if (photo.fileUrl) {
      setThumbnailUrl(photo.fileUrl);
      setHasError(false);
    } else {
      setThumbnailUrl(null);
      setHasError(true);
    }
  }, [isVisible, photo.fileUrl]);

  // 保持原有的评分颜色逻辑
  const infoStr = photo.info ?? "";
  const numericInfo = /^[0-9]+(\.[0-9]+)?$/.test(infoStr)
    ? parseFloat(infoStr)
    : NaN;

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

  const colorStyle = !Number.isNaN(numericInfo)
    ? numericInfo <= 50
      ? `rgb(${clamp(255 - numericInfo * 5)}, ${clamp(numericInfo * 5)}, 0)`
      : `rgb(0, ${clamp(255 - (numericInfo - 50) * 5)}, ${clamp(
          (numericInfo - 50) * 5,
        )})`
    : undefined;

  const formattedInfo = !Number.isNaN(numericInfo)
    ? numericInfo.toFixed(6)
    : infoStr;

  const showInfo = formattedInfo !== "";

  const displayName = ellipsizeMiddle(photo.fileName);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      {/* 图片区域 */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gray-100">
        <img
          ref={imgRef}
          src={hasError ? missing_icon : thumbnailUrl || missing_icon}
          alt={photo.fileName}
          loading="lazy"
          className="h-[160px] max-w-full transform object-contain transition-transform duration-300 ease-in-out group-hover:scale-105"
          onError={() => {
            setHasError(true);
          }}
        />
        {/* 悬浮遮罩 */}
        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
      </div>

      {/* 信息区域 */}
      <div className="flex w-full items-center justify-between border-t border-gray-100 bg-white px-3 py-2 text-xs">
        <div className="flex flex-1 flex-col overflow-hidden">
          <p
            className="truncate leading-tight font-medium text-gray-700"
            title={photo.fileName}
          >
            {displayName}
          </p>
          {showInfo && (
            <p
              className="mt-0.5 font-mono text-[11px]"
              style={{
                color: colorStyle,
              }}
            >
              {formattedInfo}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
