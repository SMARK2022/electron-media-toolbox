import React, { useEffect, useRef, useState } from "react";

import { Card } from "@/components/ui/card";

interface Photo {
  fileName: string;
  fileUrl: string;
  filePath: string;
  info: string;
  isEnabled: boolean;
}

interface PhotoGridProps {
  photos: Photo[];
  aspectRatio?: "portrait" | "square";
  width?: number;
  height?: number;
  columns?: number;
}

export function PhotoGridEnhance({
  photos,
  width = 200,
  onPhotoClick,
  highlightPhotos: initialHighlightPhotos, // 接收的 prop
}: PhotoGridProps & {
  onPhotoClick?: (photos: Photo[], event: string) => void;
  highlightPhotos?: Photo[];
}) {
  // 当前焦点索引
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [highlightPhotos, setHighlightPhotos] = useState<Photo[] | undefined>(
    initialHighlightPhotos,
  );

  const isPhotoHighlighted = (fileName: string): boolean => {
    const result =
      highlightPhotos?.some((photo) => photo.fileName === fileName) ||
      initialHighlightPhotos?.some((photo) => photo.fileName === fileName) ||
      false;
    // console.log(`isPhotoHighlighted for ${fileName}: ${result}`, highlightPhotos);
    return result;
  };

  useEffect(() => {
    setHighlightPhotos(initialHighlightPhotos);
  }, [initialHighlightPhotos]);

  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (photos.length === 0) return;

    let newFocusedIndex = focusedIndex;

    switch (e.key) {
      case "ArrowUp":
        // 上移
        if (focusedIndex !== null && focusedIndex - 3 >= 0 && onPhotoClick) {
          newFocusedIndex = focusedIndex - 3;
          setFocusedIndex(newFocusedIndex); // 更新焦点
          const selectedPhoto = photos[newFocusedIndex];
          onPhotoClick([selectedPhoto], "Select"); // 调用选中回调
          setHighlightPhotos([selectedPhoto]); // 更新 highlightPhotos
        }
        break;
      case "ArrowDown":
        // 下移
        if (
          focusedIndex !== null &&
          focusedIndex + 3 < photos.length &&
          onPhotoClick
        ) {
          newFocusedIndex = focusedIndex + 3;
          setFocusedIndex(newFocusedIndex); // 更新焦点
          const selectedPhoto = photos[newFocusedIndex];
          onPhotoClick([selectedPhoto], "Select"); // 调用选中回调
          setHighlightPhotos([selectedPhoto]); // 更新 highlightPhotos
        }
        break;
      case "ArrowLeft":
        // 左移
        if (focusedIndex !== null && focusedIndex - 1 >= 0 && onPhotoClick) {
          newFocusedIndex = focusedIndex - 1;
          setFocusedIndex(newFocusedIndex); // 更新焦点
          const selectedPhoto = photos[newFocusedIndex];
          setHighlightPhotos([selectedPhoto]); // 更新 highlightPhotos
          onPhotoClick([selectedPhoto], "Select"); // 调用选中回调
        }
        break;
      case "ArrowRight":
        // 右移
        if (
          focusedIndex !== null &&
          focusedIndex + 1 < photos.length &&
          onPhotoClick
        ) {
          newFocusedIndex = focusedIndex + 1;
          setFocusedIndex(newFocusedIndex); // 更新焦点
          const selectedPhoto = photos[newFocusedIndex];
          setHighlightPhotos([selectedPhoto]); // 更新 highlightPhotos
          onPhotoClick([selectedPhoto], "Select"); // 调用选中回调
        }
        break;
      case "Enter":
        // 空格键
        if (focusedIndex !== null && onPhotoClick) {
          const selectedPhoto = photos[focusedIndex];
          setHighlightPhotos([selectedPhoto]); // 更新 highlightPhotos
          onPhotoClick([selectedPhoto], "Change"); // 调用更改回调
        }
        break;
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
      {photos.map((photo, index) => (
        <div
          key={photo.fileName}
          className="flex-none"
          tabIndex={0} // 允许每个图片项获取焦点
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
            setHighlightPhotos([photo]); // 更新 highlightPhotos
            onPhotoClick && onPhotoClick([photo], "Select");
            // console.log("click", photo.fileName);
          }}
          onDoubleClick={() => {
            setHighlightPhotos([photo]); // 更新 highlightPhotos
            onPhotoClick && onPhotoClick([photo], "Change");
            // console.log("double click", photo.fileName)\mathrm{d};
          }}
          onFocus={() => setFocusedIndex(index)} // 聚焦时更新焦点
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
        threshold: 0.01, // 图片进入 10% 视口时触发
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
    if (isVisible && photo.fileUrl) {
      // 直接使用 photo.fileUrl 作为缩略图的 URL
      setThumbnailUrl(photo.fileUrl);
    }
  }, [isVisible, photo.fileUrl]);

  return (
    <Card>
      <div className="flex justify-center overflow-hidden rounded-md">
        <img
          ref={imgRef}
          src={thumbnailUrl || undefined}
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
        />
      </div>
      <div className="m-1 space-y-1 text-sm">
        <h3 className="text-xs leading-none">{photo.fileName}</h3>
        <p
          className="text-xs"
          style={{
            color: /^[0-9]+(\.[0-9]+)?$/.test(photo.info)
              ? parseFloat(photo.info) <= 50
                ? `rgb(${255 - parseFloat(photo.info) * 5}, ${parseFloat(photo.info) * 5}, 0)` // 黄色到绿色
                : `rgb(0, ${255 - (parseFloat(photo.info) - 50) * 5}, ${(parseFloat(photo.info) - 50) * 5})` // 绿色到蓝色
              : undefined,
          }}
        >
          {photo.info}
        </p>
      </div>
    </Card>
  );
}
