import React, { useEffect, useRef, useState, useCallback } from "react";

export interface PreviewFocusRegion {
  bbox: [number, number, number, number];
  zoomFactor?: number;
  requestId?: number;
}

interface ImagePreviewProps {
  src: string;
  width?: string | number;
  height?: string | number;
  focusRegion?: PreviewFocusRegion;
  /**
   * 当用户手动交互（拖拽、缩放、双击）修改视图时触发的回调
   * 用于通知父组件禁用自动聚焦功能
   */
  onUserInteraction?: () => void;
  /**
   * 是否禁用聚焦动画（用于图片切换时避免不连贯感）
   * 当为 true 时，focusRegion 变化不会触发动画，而是直接跳转
   */
  disableFocusAnimation?: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const ImagePreview: React.FC<ImagePreviewProps> = ({
  src,
  width,
  height,
  focusRegion,
  onUserInteraction,
  disableFocusAnimation = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // 图片和容器的真实尺寸
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // 基础缩放（自适应容器的缩放比例，作为 1 倍基准）
  const [baseScale, setBaseScale] = useState(1);

  // 交互状态（scale 是相对于 baseScale 的倍数，1 = 自适应大小）
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });
  const [isAnimating, setIsAnimating] = useState(false);

  // --- 新增：控制缩放提示的显示状态 ---
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  const zoomBadgeTimer = useRef<NodeJS.Timeout | null>(null);
  const focusRegionRef = useRef<PreviewFocusRegion | null>(null);

  // 防抖 resize 定时器
  const resizeDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // 缩放限制（相对于自适应尺寸）
  const MIN_SCALE = 1; // 最小就是自适应大小
  const MAX_SCALE = 20; // 最大 20 倍
  const ZOOM_SPEED = 0.1;

  // --- 优化功能：显示并自动隐藏缩放提示 ---
  const triggerZoomBadge = useCallback(() => {
    setShowZoomBadge(true);
    if (zoomBadgeTimer.current) {
      clearTimeout(zoomBadgeTimer.current);
    }
    zoomBadgeTimer.current = setTimeout(() => {
      setShowZoomBadge(false);
    }, 1500); // 1.5秒后自动消失
  }, []);

  // 核心函数：计算边界限制后的位置
  const getClampedPosition = useCallback(
    (
      targetPos: { x: number; y: number },
      targetScale: number,
      currentBaseScale?: number,
    ) => {
      if (!containerSize.width || !imageSize.width) return targetPos;

      // 使用传入的 baseScale 或当前的 baseScale
      const effectiveBaseScale = currentBaseScale ?? baseScale;

      // 实际显示的图片尺寸 = 原始尺寸 * baseScale * scale
      const scaledWidth = imageSize.width * effectiveBaseScale * targetScale;
      const scaledHeight = imageSize.height * effectiveBaseScale * targetScale;

      let newX = targetPos.x;
      let newY = targetPos.y;

      // X 轴边界处理
      if (scaledWidth <= containerSize.width) {
        // 图片比容器小：居中
        newX = (containerSize.width - scaledWidth) / 2;
      } else {
        // 图片比容器大：限制边缘
        const minX = containerSize.width - scaledWidth;
        const maxX = 0;
        newX = Math.min(Math.max(newX, minX), maxX);
      }

      // Y 轴边界处理
      if (scaledHeight <= containerSize.height) {
        newY = (containerSize.height - scaledHeight) / 2;
      } else {
        const minY = containerSize.height - scaledHeight;
        const maxY = 0;
        newY = Math.min(Math.max(newY, minY), maxY);
      }

      return { x: newX, y: newY };
    },
    [containerSize, imageSize, baseScale],
  );

  // 自适应容器：计算初始缩放和位置
  const fitToContainer = useCallback(
    (isInitialLoad: boolean = false) => {
      if (!containerRef.current || imageSize.width === 0) return;

      const cWidth = containerRef.current.offsetWidth;
      const cHeight = containerRef.current.offsetHeight;
      setContainerSize({ width: cWidth, height: cHeight });

      // 计算适配比例（contain 模式）
      const scaleX = cWidth / imageSize.width;
      const scaleY = cHeight / imageSize.height;
      const fitScale = Math.min(scaleX, scaleY);

      // 设置 baseScale（自适应尺寸的缩放比例）
      const prevBaseScale = baseScale;
      setBaseScale(fitScale);

      if (isInitialLoad) {
        // 初始加载：重置为 1 倍并居中
        setScale(1);
        const initialPos = {
          x: (cWidth - imageSize.width * fitScale) / 2,
          y: (cHeight - imageSize.height * fitScale) / 2,
        };
        setPosition(initialPos);
        setIsAnimating(true);
      } else {
        // 切换图片或容器变化：保持当前 scale，调整位置以适应新的 baseScale
        setScale((currentScale) => {
          const validScale = Math.max(currentScale, MIN_SCALE);

          setPosition((currentPos) => {
            // 计算在新 baseScale 下的修正位置
            // 尝试保持视觉中心点不变
            if (prevBaseScale !== 0 && prevBaseScale !== fitScale) {
              const ratio = fitScale / prevBaseScale;
              const adjustedPos = {
                x: currentPos.x * ratio,
                y: currentPos.y * ratio,
              };
              return getClampedPosition(adjustedPos, validScale, fitScale);
            }

            return getClampedPosition(currentPos, validScale, fitScale);
          });

          return validScale;
        });
      }
    },
    [imageSize, MIN_SCALE, getClampedPosition, baseScale],
  );

  const focusOnRegion = useCallback(
    (region: PreviewFocusRegion | null, skipAnimation: boolean = false) => {
      if (
        !region ||
        !containerSize.width ||
        !containerSize.height ||
        !imageSize.width ||
        !imageSize.height ||
        baseScale === 0
      ) {
        return false;
      }

      const [x1, y1, x2, y2] = region.bbox;
      if (x2 <= x1 || y2 <= y1) return false;

      const targetZoom = region.zoomFactor && region.zoomFactor > 1 ? region.zoomFactor : 1.2;
      const width = x2 - x1;
      const height = y2 - y1;
      const padRatio = (targetZoom - 1) / 2;
      const padX = width * padRatio;
      const padY = height * padRatio;

      const px1 = clamp(x1 - padX, 0, imageSize.width);
      const py1 = clamp(y1 - padY, 0, imageSize.height);
      const px2 = clamp(x2 + padX, 0, imageSize.width);
      const py2 = clamp(y2 + padY, 0, imageSize.height);

      const regionWidth = Math.max(1, px2 - px1);
      const regionHeight = Math.max(1, py2 - py1);

      const absoluteScale = Math.min(
        containerSize.width / regionWidth,
        containerSize.height / regionHeight,
      );
      const targetScale = absoluteScale / baseScale;
      const clampedScale = Math.min(Math.max(targetScale, MIN_SCALE), MAX_SCALE);

      const centerX = px1 + regionWidth / 2;
      const centerY = py1 + regionHeight / 2;

      const desiredX = containerSize.width / 2 - centerX * baseScale * clampedScale;
      const desiredY = containerSize.height / 2 - centerY * baseScale * clampedScale;
      const clampedPos = getClampedPosition({ x: desiredX, y: desiredY }, clampedScale);

      setScale(clampedScale);
      setPosition(clampedPos);
      // 如果 skipAnimation 为 true，则不启用动画（直接跳转）
      setIsAnimating(!skipAnimation);
      if (!skipAnimation) {
        triggerZoomBadge();
      }
      return true;
    },
    [
      containerSize,
      imageSize,
      baseScale,
      getClampedPosition,
      triggerZoomBadge,
      MIN_SCALE,
      MAX_SCALE,
    ],
  );

  // 图片加载完成
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
  };

  // 监听容器尺寸变化（添加防抖以避免拖拽时高频计算）
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      // 清除之前的防抖定时器
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
      // 使用 100ms 防抖延迟
      resizeDebounceRef.current = setTimeout(() => {
        // 容器变化时保持当前缩放，只调整位置
        fitToContainer(false);
      }, 100);
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      if (resizeDebounceRef.current) {
        clearTimeout(resizeDebounceRef.current);
      }
    };
  }, [fitToContainer]);

  // 图片加载后自适应（区分首次加载和切换图片）
  const prevSrc = useRef<string>("");
  useEffect(() => {
    if (imageSize.width > 0) {
      const isInitialLoad = prevSrc.current === "";
      fitToContainer(isInitialLoad);
      prevSrc.current = src;
    }
  }, [imageSize, fitToContainer, src]);

  useEffect(() => {
    if (!focusRegion) return;
    focusRegionRef.current = focusRegion;
    // 使用 disableFocusAnimation 参数控制是否跳过动画
    focusOnRegion(focusRegion, disableFocusAnimation);
  }, [focusRegion, focusOnRegion, disableFocusAnimation]);

  useEffect(() => {
    if (!focusRegionRef.current) return;
    focusOnRegion(focusRegionRef.current, disableFocusAnimation);
  }, [focusOnRegion, imageSize, containerSize, baseScale, disableFocusAnimation]);

  // 滚轮缩放（以鼠标为中心）
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (isDragging) return;

    // 通知父组件用户进行了手动交互
    onUserInteraction?.();

    // 计算新缩放比例（相对于自适应尺寸）
    const delta = -Math.sign(e.deltaY) * ZOOM_SPEED;
    let newScale = scale + delta * scale;
    newScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);

    // 获取鼠标相对容器的位置
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 保持鼠标下的点不动
    const newX = mouseX - (mouseX - position.x) * (newScale / scale);
    const newY = mouseY - (mouseY - position.y) * (newScale / scale);

    // 应用边界限制
    const clampedPos = getClampedPosition({ x: newX, y: newY }, newScale);

    setIsAnimating(true);
    setScale(newScale);
    setPosition(clampedPos);

    // 触发缩放提示显示
    triggerZoomBadge();
  };

  // 鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setIsAnimating(false);
    setLastMousePosition({ x: e.clientX, y: e.clientY });
    // 通知父组件用户进行了手动交互
    onUserInteraction?.();
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();

    const dx = e.clientX - lastMousePosition.x;
    const dy = e.clientY - lastMousePosition.y;

    const nextPos = {
      x: position.x + dx,
      y: position.y + dy,
    };

    const clampedPos = getClampedPosition(nextPos, scale);

    setPosition(clampedPos);
    setLastMousePosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // 双击缩放
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    triggerZoomBadge(); // 双击也显示提示
    // 通知父组件用户进行了手动交互
    onUserInteraction?.();

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (scale !== 1) {
      // 双击还原到 1 倍（自适应大小）并居中
      setScale(1);

      const clampedPos = getClampedPosition({ x: 0, y: 0 }, 1);
      setPosition(clampedPos);
      setIsAnimating(true);
      return;
    }

    // 双击放大到 2 倍（相对于自适应尺寸），以鼠标位置为中心
    const targetScale = 2;

    const newX = mouseX - (mouseX - position.x) * (targetScale / scale);
    const newY = mouseY - (mouseY - position.y) * (targetScale / scale);

    const clampedPos = getClampedPosition({ x: newX, y: newY }, targetScale);

    setIsAnimating(true);
    setScale(targetScale);
    setPosition(clampedPos);
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "grab",
        background: "#efefef",
        userSelect: "none",
        minWidth: 0,
        minHeight: 0,
      }}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* 隐藏的原始图片用于获取尺寸 */}
      <img
        src={src}
        alt="Original"
        onLoad={handleImageLoad}
        style={{ display: "none" }}
      />

      {/* 实际渲染的图片 */}
      {imageSize.width > 0 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: imageSize.width,
            height: imageSize.height,
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${baseScale * scale})`,
            transformOrigin: "0 0",
            transition: isAnimating ? "transform 0.15s ease-out" : "none",
            willChange: "transform",
            pointerEvents: "none",
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt="Preview"
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
            }}
            draggable={false}
          />
        </div>
      )}

      {/* 加载提示 */}
      {imageSize.width === 0 && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            color: "#999",
            fontSize: "14px",
          }}
        >
          Loading...
        </div>
      )}

      {/* 优化后的缩放比例显示 */}
      <div
        style={{
          position: "absolute",
          bottom: "24px", // 稍微提高一点
          left: "50%",
          transform: `translateX(-50%) translateY(${showZoomBadge ? "0" : "10px"})`, // 出现时上浮
          // 玻璃拟态风格
          background: "rgba(30, 30, 30, 0.75)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)", // 兼容 Safari
          // 字体和颜色
          color: "rgba(255, 255, 255, 0.95)",
          fontSize: "13px",
          fontWeight: 500,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          fontVariantNumeric: "tabular-nums", // 关键：等宽数字，防止抖动
          // 边框和阴影
          padding: "6px 14px",
          borderRadius: "999px", // 完全胶囊形
          border: "1px solid rgba(255, 255, 255, 0.1)",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          // 动画状态
          opacity: showZoomBadge ? 1 : 0,
          transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
};

export default ImagePreview;
