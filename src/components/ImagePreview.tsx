import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  getOrCreateBitmap,
  setCurrentDisplaySrc,
  type ImageBitmapLike,
} from "./bitmapCache";
import { useTranslation } from "react-i18next";

export interface PreviewFocusRegion {
  bbox: [number, number, number, number];
  zoomFactor?: number;
  requestId?: number;
}

interface ImagePreviewProps {
  src?: string; // 可选的图片源，为空时不渲染
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
  /**
   * ImageBitmap 解码完成时回调，传递原始图像尺寸。
   * 父组件（PhotoDetailsTable）用此尺寸做人脸追踪 bbox 归一化——
   * 替代原先独立的 new Image() 解码，消除 7MB 冗余加载
   */
  onImageReady?: (width: number, height: number) => void;
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
  onImageReady,
}) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

  // 控制缩放提示的显示状态
  const [showZoomBadge, setShowZoomBadge] = useState(false);
  const zoomBadgeTimer = useRef<NodeJS.Timeout | null>(null);
  const focusRegionRef = useRef<PreviewFocusRegion | null>(null);
  // 用户交互标志：一次交互后立即生效，后续调用忽略（避免多次渲染）
  const userInteractionTriggered = useRef(false);

  // ImageBitmap 状态——替代原先的 <img>，使用 createImageBitmap 解码
  // ImageBitmap 是 GPU 后端句柄，显式 close() 前不被 Blink MemoryCache 淘汰
  const [bitmap, setBitmap] = useState<ImageBitmapLike | null>(null);
  const [decodeError, setDecodeError] = useState(false);

  // 缩放限制（相对于自适应尺寸）
  const MIN_SCALE = 1; // 最小就是自适应大小
  const MAX_SCALE = 50; // 最大 20 倍
  const ZOOM_SPEED = 0.1;

  // 一次触发 onUserInteraction 回调（第一次调用时立即执行，后续调用无效，重置引用时清空标志）
  const triggerUserInteraction = useCallback(() => {
    if (userInteractionTriggered.current) return; // 已触发过，忽略后续调用
    userInteractionTriggered.current = true; // 标记已触发
    onUserInteraction?.(); // 立即执行回调
  }, [onUserInteraction]);

  // 显示并自动隐藏缩放提示
  const triggerZoomBadge = useCallback(() => {
    setShowZoomBadge(true);
    if (zoomBadgeTimer.current) clearTimeout(zoomBadgeTimer.current);
    zoomBadgeTimer.current = setTimeout(() => setShowZoomBadge(false), 1500); // 1.5s 后自动消失
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

      // 关键优化：在布局调整（Resize）期间强制禁用动画，确保图片位置即时跟随容器变化，消除“抽搐”或滞后感
      setIsAnimating(false);

      if (isInitialLoad) {
        // 初始加载：重置为 1 倍并居中
        setScale(1);
        const initialPos = {
          x: (cWidth - imageSize.width * fitScale) / 2,
          y: (cHeight - imageSize.height * fitScale) / 2,
        };
        setPosition(initialPos);
        // 初始加载可以启用动画（如果需要平滑出现），或者保持 false
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

      const targetZoom =
        region.zoomFactor && region.zoomFactor > 1 ? region.zoomFactor : 1.2;
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
      const clampedScale = Math.min(
        Math.max(targetScale, MIN_SCALE),
        MAX_SCALE,
      );

      const centerX = px1 + regionWidth / 2;
      const centerY = py1 + regionHeight / 2;

      const desiredX =
        containerSize.width / 2 - centerX * baseScale * clampedScale;
      const desiredY =
        containerSize.height / 2 - centerY * baseScale * clampedScale;
      const clampedPos = getClampedPosition(
        { x: desiredX, y: desiredY },
        clampedScale,
      );

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

  // 图片解码：用 createImageBitmap 替代 <img>.onLoad
  // 缓存命中时零延迟（ImageBitmap 在 bitmapCache 中存活），未命中则后台解码
  useEffect(() => {
    if (!src) {
      setBitmap(null);
      setImageSize({ width: 0, height: 0 });
      setDecodeError(false);
      return;
    }

    let cancelled = false;
    setDecodeError(false);
    // 通知缓存模块当前正在显示的 URL（防止 LRU 淘汰当前页）
    setCurrentDisplaySrc(src);

    getOrCreateBitmap(src)
      .then((bm) => {
        if (cancelled) return; // 组件已卸载或 src 已变化
        setBitmap(bm);
        setImageSize({ width: bm.width, height: bm.height });
      })
      .catch(() => {
        if (cancelled) return;
        // createImageBitmap 失败（格式不支持/文件损坏）——显示错误状态
        setDecodeError(true);
        setImageSize({ width: 0, height: 0 });
      });

    return () => {
      cancelled = true;
    };
  }, [src]);

  // bitmap 就绪后通知父组件原始尺寸——替代 PhotoDetailsTable 的独立 new Image()
  // 用 useEffect 统一驱动（缓存命中和新解码都触发），避免 subagent 指出的遗漏
  useEffect(() => {
    if (bitmap && bitmap.width > 0) {
      onImageReady?.(bitmap.width, bitmap.height);
    }
  }, [bitmap, onImageReady]);

  // 在 canvas 上绘制 bitmap——替代原先可见的 <img> 元素
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      // 高质量插值：canvas 1:1 绘制 bitmap，CSS transform 负责缩放
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0);
    }
  }, [bitmap]);

  // 监听容器尺寸变化（使用 requestAnimationFrame 优化流畅度，替代防抖）
  useEffect(() => {
    if (!containerRef.current) return;

    let rafId: number;
    const resizeObserver = new ResizeObserver(() => {
      // 使用 RAF 确保在每一帧渲染前只执行一次计算，避免高频触发导致的卡顿
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        // 容器变化时保持当前缩放，只调整位置
        fitToContainer(false);
      });
    });

    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(rafId);
    };
  }, [fitToContainer]);

  // 图片加载后自适应（区分首次加载和切换图片）
  const prevSrc = useRef<string>(""); // 前一次加载的图片源
  useEffect(() => {
    if (imageSize.width > 0) {
      const isInitialLoad = prevSrc.current === "";
      fitToContainer(isInitialLoad);
      prevSrc.current = src ?? ""; // 保存当前源（为 undefined 时使用空字符串）
    }
  }, [imageSize, fitToContainer, src]);

  // 响应 focusRegion 变化：有效值则聚焦，null/undefined 则清除引用（避免重复聚焦）
  useEffect(() => {
    if (focusRegion) {
      focusRegionRef.current = focusRegion; // 保存当前聚焦区域
      focusOnRegion(focusRegion, disableFocusAnimation); // 执行聚焦
    } else {
      focusRegionRef.current = null; // 清除引用，防止后续 effect 重复聚焦
    }
  }, [focusRegion, focusOnRegion, disableFocusAnimation]);

  // 容器/图片尺寸变化时：仅在有有效聚焦区域时重新聚焦（保持视图稳定）
  useEffect(() => {
    if (!focusRegionRef.current) return; // 无聚焦区域时不处理，依赖 fitToContainer 自适应
    focusOnRegion(focusRegionRef.current, disableFocusAnimation); // 重新聚焦以适应新尺寸
  }, [
    focusOnRegion,
    imageSize,
    containerSize,
    baseScale,
    disableFocusAnimation,
  ]);

  // 重置图片源时清空交互标志（允许新图片首次交互触发回调）
  useEffect(() => {
    userInteractionTriggered.current = false;
    return () => {
      if (zoomBadgeTimer.current) clearTimeout(zoomBadgeTimer.current);
    };
  }, [src]);

  // 滚轮缩放（以鼠标为中心，使用非被动监听器支持 preventDefault）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault(); // 在非被动监听器中调用，防止页面滚动
      if (isDragging) return;

      // 计算新缩放比例（相对于自适应尺寸）
      const delta = -Math.sign(e.deltaY) * ZOOM_SPEED;
      let newScale = scale + delta * scale;
      newScale = Math.min(Math.max(newScale, MIN_SCALE), MAX_SCALE);

      // 获取鼠标相对容器的位置
      const rect = container.getBoundingClientRect();
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

      // 触发缩放提示显示 & 通知父组件用户进行了交互
      triggerZoomBadge();
      triggerUserInteraction();
    };

    // 添加非被动事件监听器（{ passive: false } 允许调用 preventDefault）
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [
    scale,
    position,
    isDragging,
    MIN_SCALE,
    MAX_SCALE,
    ZOOM_SPEED,
    getClampedPosition,
    triggerZoomBadge,
    triggerUserInteraction,
  ]);

  // 鼠标拖拽
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setIsAnimating(false);
    setLastMousePosition({ x: e.clientX, y: e.clientY });
    // 立即通知父组件用户进行了拖拽交互
    triggerUserInteraction();
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
    // 立即通知父组件用户进行了双击交互
    triggerUserInteraction();

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
      className="bg-white dark:bg-slate-900"
      style={{
        position: "relative",
        ...(width != null ? { width } : {}),
        ...(height != null ? { height } : {}),
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "grab",
        userSelect: "none",
        minWidth: 0,
        minHeight: 0,
      }}
      onDoubleClick={handleDoubleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* canvas 渲染——替代原先的隐藏 <img> + 可见 <img> 双重解码。
          ImageBitmap 由 createImageBitmap 在 Worker 线程解码，通过 ctx.drawImage 绘制。
          CSS transform 逻辑（缩放/平移/动画）与原 <img> 完全一致 */}
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
            willChange: "transform", // 提示浏览器优化合成层
            pointerEvents: "none",
          }}
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={t("imagePreview.previewAlt")}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
              pointerEvents: "none",
              userSelect: "none",
              imageRendering: "auto", // CSS 缩放时高质量重采样
            }}
          />
        </div>
      )}

      {/* 加载提示 */}
      {imageSize.width === 0 && !decodeError && (
        <div
          role="status"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            // 使用 --muted-foreground token：#999 在白底仅 2.85:1，未达 WCAG AA 4.5:1；
            // --muted-foreground 亮色 ≈ 4.73:1，过 AA，且自动适应暗色模式
            color: "hsl(var(--muted-foreground))",
            fontSize: "14px",
          }}
        >
          {t("imagePreview.loading")}
        </div>
      )}

      {/* 解码失败提示——createImageBitmap 不支持的格式或文件损坏 */}
      {decodeError && (
        <div
          role="alert"
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            // 保留 #c00 而非改用 --destructive token：
            // #c00 对白底 ≈ 5.9:1 已过 WCAG AA，而 --destructive(0 84.2% 60.2%) 仅 3.85:1 不达标
            color: "#c00",
            fontSize: "14px",
          }}
        >
          {t("imagePreview.loadFailed")}
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
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
