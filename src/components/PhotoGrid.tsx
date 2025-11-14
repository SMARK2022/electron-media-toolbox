import React, { useEffect, useRef, useState, useCallback } from "react";

import { Card } from "@/components/ui/card";
import missing_icon from "@/assets/images/cat_missing.svg";
import { Photo } from "@/lib/db";

interface PhotoGridProps {
  photos?: Photo[];
  aspectRatio?: "portrait" | "square";
  width?: number;
  height?: number;
  columns?: number;
}

export function PhotoGridEnhance({
  photos = [],
  width = 200,
  onPhotoClick,
  highlightPhotos: initialHighlightPhotos, // 接收的 prop
}: PhotoGridProps & {
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
  highlightPhotos?: Photo[];
}) {
  // 确保 photos 是数组
  const photosArray = Array.isArray(photos) ? photos : [];

  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [highlightPhotos, setHighlightPhotos] = useState<Photo[] | undefined>(
    initialHighlightPhotos,
  );

  // 每个 item 的 DOM 引用，用来计算几何位置 + scrollIntoView
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);

  const isPhotoHighlighted = (fileName: string): boolean => {
    const result =
      highlightPhotos?.some((photo) => photo.fileName === fileName) ||
      initialHighlightPhotos?.some((photo) => photo.fileName === fileName) ||
      false;
    return result;
  };

  useEffect(() => {
    setHighlightPhotos(initialHighlightPhotos);
  }, [initialHighlightPhotos]);

  /**
   * 异步触发父组件的 onPhotoClick：
   * - 不在当前事件回调里直接执行
   * - 不等待其完成，避免键盘事件被重 IO 阻塞
   */
  const triggerOnPhotoClick = useCallback(
    (selected: Photo[], event: string) => {
      if (!onPhotoClick) return;
      // 用 setTimeout 0ms 推迟到当前事件处理完之后再执行
      setTimeout(() => {
        void onPhotoClick(selected, event);
      }, 0);
    },
    [onPhotoClick],
  );

  /**
   * 根据当前 focusedIndex 和方向（up/down），找到“上一行/下一行”的最近元素。
   * 算法：
   *  1. 取当前元素中心点 (cx, cy)
   *  2. 对所有其他元素，计算中心点 (x, y)
   *  3. 过滤出 y 在当前元素上方/下方的候选
   *  4. 找到“行差”最小的一行（|Δy| 最小），然后在这一行里找 |Δx| 最小的那个
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

    // 一个小的容差，用来认为是“同一行”
    const rowEps = 4; // px

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
        // 明显更近的一行
        bestRowDelta = rowDelta;
        bestColDelta = colDelta;
        bestIndex = index;
      } else if (Math.abs(rowDelta - bestRowDelta) <= rowEps) {
        // 认为在同一行，挑选 X 方向更近的
        if (colDelta < bestColDelta) {
          bestColDelta = colDelta;
          bestIndex = index;
        }
      }
    });

    return bestIndex;
  };

  /**
   * 焦点变化时，自动滚动到对应元素附近：
   * - 使用 block: 'nearest' / inline: 'nearest'，尽量少移动
   * - 适配 ScrollArea / window 的滚动容器
   */
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

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (photosArray.length === 0) return;

    let newFocusedIndex = focusedIndex;

    // 如果还没任何焦点，第一次按方向键就选中第 0 张
    if (focusedIndex === null) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        newFocusedIndex = 0;
        setFocusedIndex(0);
        const selectedPhoto = photosArray[0];
        setHighlightPhotos([selectedPhoto]);
        triggerOnPhotoClick([selectedPhoto], "Select");
        return;
      }
    }

    switch (e.key) {
      case "ArrowUp": {
        e.preventDefault();
        if (focusedIndex !== null) {
          const targetIndex = findVerticalNeighbor(focusedIndex, "up");
          if (targetIndex !== null) {
            newFocusedIndex = targetIndex;
            setFocusedIndex(newFocusedIndex);
            const selectedPhoto = photosArray[newFocusedIndex];
            setHighlightPhotos([selectedPhoto]);
            triggerOnPhotoClick([selectedPhoto], "Select");
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
            setFocusedIndex(newFocusedIndex);
            const selectedPhoto = photosArray[newFocusedIndex];
            setHighlightPhotos([selectedPhoto]);
            triggerOnPhotoClick([selectedPhoto], "Select");
          }
        }
        break;
      }
      case "ArrowLeft": {
        e.preventDefault();
        if (focusedIndex !== null && focusedIndex - 1 >= 0) {
          newFocusedIndex = focusedIndex - 1;
          setFocusedIndex(newFocusedIndex);
          const selectedPhoto = photosArray[newFocusedIndex];
          setHighlightPhotos([selectedPhoto]);
          triggerOnPhotoClick([selectedPhoto], "Select");
        }
        break;
      }
      case "ArrowRight": {
        e.preventDefault();
        if (focusedIndex !== null && focusedIndex + 1 < photosArray.length) {
          newFocusedIndex = focusedIndex + 1;
          setFocusedIndex(newFocusedIndex);
          const selectedPhoto = photosArray[newFocusedIndex];
          setHighlightPhotos([selectedPhoto]);
          triggerOnPhotoClick([selectedPhoto], "Select");
        }
        break;
      }
      case "Enter": {
        e.preventDefault();
        if (focusedIndex !== null) {
          const selectedPhoto = photosArray[focusedIndex];
          setHighlightPhotos([selectedPhoto]);
          triggerOnPhotoClick([selectedPhoto], "Change");
        }
        break;
      }
      default:
        return;
    }
  };

  return (
    <div
      className="flex flex-wrap gap-1"
      tabIndex={0} // 确保可以聚焦整个网格容器
      onKeyDown={handleKeyDown} // 监听键盘事件
    >
      {photosArray.map((photo, index) => (
        <div
          key={photo.fileName}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          className="flex-none"
          tabIndex={0} // 允许每个图片项获取焦点（方便 Tab 导航）
          style={{
            width: `${width}px`,
            background: photo.isEnabled ? "var(--card)" : "gray",
            borderRadius: "3%",
            border: `2px solid ${
              isPhotoHighlighted(photo.fileName) ? "orange" : "transparent"
            }`,
            transition: "border-color 0.3s ease-in-out",
            opacity: photo.isEnabled ? 1 : 0.2,
          }}
          onClick={() => {
            setHighlightPhotos([photo]);
            triggerOnPhotoClick([photo], "Select");
          }}
          onDoubleClick={() => {
            setHighlightPhotos([photo]);
            triggerOnPhotoClick([photo], "Change");
          }}
          onFocus={() => setFocusedIndex(index)}
          onMouseEnter={(e) => {
            if (isPhotoHighlighted(photo.fileName)) {
              (e.currentTarget as HTMLElement).style.borderColor = "orange";
            }
          }}
          onMouseLeave={(e) => {
            if (!isPhotoHighlighted(photo.fileName)) {
              (e.currentTarget as HTMLElement).style.borderColor =
                "transparent";
            }
          }}
        >
          <LazyImageContainer key={photo.fileName} photo={photo} />
        </div>
      ))}
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
  const [hasError, setHasError] = useState(false); // 图片加载失败时使用兜底图

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.unobserve(entry.target); // 图片加载后停止观察
          }
        });
      },
      {
        root: null, // 视口为根
        threshold: 0.01, // 图片进入 1% 视口时触发
      },
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isVisible) {
      if (photo.fileUrl) {
        // 直接使用 photo.fileUrl 作为缩略图的 URL
        setThumbnailUrl(photo.fileUrl);
        setHasError(false); // 切换到新的图片时重置错误状态
      } else {
        // 如果本身就没有 URL，则直接使用兜底图
        setThumbnailUrl(null);
        setHasError(true);
      }
    }
  }, [isVisible, photo.fileUrl]);

  // 安全处理 photo.info（可能为 undefined），并预计算数值
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

  return (
    <Card>
      <div className="flex justify-center overflow-hidden rounded-md">
        <img
          ref={imgRef}
          src={hasError ? missing_icon : thumbnailUrl || missing_icon}
          alt={photo.fileName}
          loading="lazy"
          className="transform transition-transform duration-300 ease-in-out hover:scale-110"
          style={{
            display: "block",
            objectFit: "contain",
            maxWidth: "200px",
            maxHeight: "180px",
            borderRadius: "3%",
          }}
          onError={() => {
            // 图片加载失败时使用兜底图
            setHasError(true);
          }}
        />
      </div>
      <div className="m-1 space-y-1 text-sm">
        <h3 className="text-xs leading-none">{photo.fileName}</h3>
        <p
          className="text-xs"
          style={{
            color: colorStyle,
          }}
        >
          {photo.info}
        </p>
      </div>
    </Card>
  );
}
