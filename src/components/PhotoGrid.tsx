import React, { useEffect, useRef, useState, useCallback } from "react";

import { Card } from "@/components/ui/card";
import missing_icon from "@/assets/images/cat_missing.svg";
import { Photo } from "@/lib/db";
import { cn } from "@/lib/utils";

interface PhotoGridProps {
  photos?: Photo[];
  aspectRatio?: "portrait" | "square";
  width?: number;
  height?: number;
  columns?: number;
}

// 中间省略文件名，保留开头 + 后缀（尽量显示完整）
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

export function PhotoGridEnhance({
  photos = [],
  width = 200,
  onPhotoClick,
  highlightPhotos: initialHighlightPhotos,
}: PhotoGridProps & {
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
  highlightPhotos?: Photo[];
}) {
  const photosArray = Array.isArray(photos) ? photos : [];

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [highlightPhotos, setHighlightPhotos] = useState<Photo[] | undefined>(
    initialHighlightPhotos,
  );

  // 每个 item 的 DOM 引用，用来计算几何位置 + scrollIntoView
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const isPhotoHighlighted = (fileName: string): boolean =>
    !!(
      highlightPhotos?.some((photo) => photo.fileName === fileName) ||
      initialHighlightPhotos?.some((photo) => photo.fileName === fileName)
    );

  useEffect(() => {
    setHighlightPhotos(initialHighlightPhotos);
  }, [initialHighlightPhotos]);

  /**
   * 异步触发父组件的 onPhotoClick
   */
  const triggerOnPhotoClick = useCallback(
    (selected: Photo[], event: string) => {
      if (!onPhotoClick) return;
      setTimeout(() => {
        void onPhotoClick(selected, event);
      }, 0);
    },
    [onPhotoClick],
  );

  /**
   * 根据当前 focusedIndex 和方向（up/down），找到“上一行/下一行”的最近元素。
   */
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
    const rowEps = 4; // px，认为是同一行的容差

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

  // 焦点变化时，自动滚动到对应元素附近
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

  // 键盘导航
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (photosArray.length === 0) return;

    let newFocusedIndex = focusedIndex;

    // 第一次按方向键时，选中第 0 张
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

  return (
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
              "group bg-card text-card-foreground flex-none rounded-lg border shadow-sm transition-all duration-200",
              "hover:shadow-md focus-visible:outline-none",
              highlighted
                ? "border-orange-400 ring-1 ring-orange-300 focus-visible:ring-2 focus-visible:ring-orange-300"
                : "border-border ring-0 focus-visible:ring-0 focus-visible:border-border",
              !photo.isEnabled && "opacity-40 grayscale",
            )}
            onClick={() => selectPhotoByIndex(index, "Select")}
            onDoubleClick={() => selectPhotoByIndex(index, "Change")}
            onFocus={() => setFocusedIndex(index)}
          >
            <LazyImageContainer photo={photo} />
          </div>
        );
      })}
    </div>
  );
}

// 懒加载图片的组件
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

  // 安全处理 photo.info，并格式化到 4 位小数
  const infoStr = photo.info ?? "";
  const numericInfo = /^[0-9]+(\.[0-9]+)?$/.test(infoStr)
    ? parseFloat(infoStr)
    : NaN;

  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));

  const colorStyle = !Number.isNaN(numericInfo)
    ? numericInfo <= 50
      ? `rgb(${clamp(255 - numericInfo * 5)}, ${clamp(numericInfo * 5)}, 0)` // 黄色到绿色
      : `rgb(0, ${clamp(255 - (numericInfo - 50) * 5)}, ${clamp(
          (numericInfo - 50) * 5,
        )})` // 绿色到蓝色
    : undefined;

  const formattedInfo = !Number.isNaN(numericInfo)
    ? numericInfo.toFixed(6)
    : infoStr;

  const showInfo = formattedInfo !== "";

  const displayName = ellipsizeMiddle(photo.fileName);

  return (
    <Card className="h-full border-0 bg-transparent shadow-none">
      <div className="bg-muted flex items-center justify-center overflow-hidden rounded-md">
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
      </div>
      <div className="space-y-1 px-2 pt-1 pb-2 text-[12px]">
        <p
          className="max-w-full truncate leading-tight font-medium"
          title={photo.fileName}
        >
          {displayName}
        </p>
        {showInfo && (
          <p
            className="font-mono"
            style={{
              color: colorStyle,
            }}
          >
            {formattedInfo}
          </p>
        )}
      </div>
    </Card>
  );
}
