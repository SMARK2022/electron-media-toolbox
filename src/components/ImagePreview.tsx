import React, { useEffect, useRef, useState } from "react";

interface ImagePreviewProps {
  src: string;
  width?: string | number; // 支持 CSS 样式设置宽度（可选）
  height?: string | number; // 支持 CSS 样式设置高度（可选）
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ src, width, height }) => {
  const containerRef = useRef<HTMLDivElement>(null); // 容器的 ref，用于获取实际的宽高
  const [baseScale, setBaseScale] = useState(1);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);

  // 限制最大和最小缩放倍数
  const minScale = 1;
  const maxScale = 10;

  // 获取容器的宽高
  const containerWidth = containerRef.current?.offsetWidth || 0;
  const containerHeight = containerRef.current?.offsetHeight || 0;

  // 放大缩小函数
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    const newScale = Math.min(Math.max(scale + delta, minScale), maxScale);
    setScale(newScale);
  };

  // 鼠标拖动函数
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setOffset({
        x: offset.x + dx / scale / baseScale,
        y: offset.y + dy / scale / baseScale,
      });
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (imageRef.current) {
        // 限制图片的最大偏移量，以防图片移出边界

        const imageWidthRatio = imageRef.current.width / containerWidth;
        const imageHeightRatio = imageRef.current.height / containerHeight;
        const maxRatio = Math.max(imageWidthRatio, imageHeightRatio);
        if (1 / maxRatio !== baseScale) {
          setBaseScale(1 / maxRatio);
        }

        const imageWidth = imageRef.current.width * scale * baseScale;
        const imageHeight = imageRef.current.height * scale * baseScale;
        let newX = offset.x * scale * baseScale;
        let newY = offset.y * scale * baseScale;

        if (imageWidth < containerWidth) {
          newX = (containerWidth - imageWidth) / 2;
        } else {
          newX = Math.min(Math.max(newX, -(imageWidth - containerWidth)), 0);
        }
        if (imageHeight < containerHeight) {
          newY = (containerHeight - imageHeight) / 2;
        } else {
          newY = Math.min(Math.max(newY, -(imageHeight - containerHeight)), 0);
        }

        newX = newX / scale / baseScale;
        newY = newY / scale / baseScale;

        if (newX !== offset.x || newY !== offset.y) {
          setOffset({ x: newX, y: newY });
        }
      }
    }, 5);

    return () => clearInterval(interval);
  }, [scale, baseScale, offset, containerWidth, containerHeight]);

  return (
    <div
      ref={containerRef} // 使用ref获取容器实际尺寸
      style={{
        position: "relative",
        width: width || "100%", // 支持CSS宽度（如百分比）
        height: height || "100%", // 支持CSS高度（如百分比）
        overflow: "hidden",
        cursor: isDragging ? "grabbing" : "grab",
        background: "#efefef",
      }}
      onWheel={handleWheel} // 监听滚轮缩放
      onDoubleClick={(e) => {
        if (scale !== 1) {
          setScale(1);
          setOffset({ x: 0, y: 0 }); // 双击还原缩放并居中
        } else {
          // 获取鼠标位置
          const rect = containerRef.current?.getBoundingClientRect();
          if (!rect) return;

          const mouseX = e.clientX - rect.left; // 鼠标相对于容器的 X 坐标
          const mouseY = e.clientY - rect.top; // 鼠标相对于容器的 Y 坐标

          // 计算放大后的偏移量，使鼠标位置放大后居中
          const newScale = 2; // 目标缩放倍数
          const newOffsetX =
            (mouseX - containerWidth / 2) / newScale / baseScale;
          const newOffsetY =
            (mouseY - containerHeight / 2) / newScale / baseScale;

          setScale(newScale);
          setOffset({ x: -newOffsetX, y: -newOffsetY });
        }
      }}
      // 双击还原缩放
      onMouseDown={handleMouseDown} // 鼠标按下开始拖动
      onMouseMove={handleMouseMove} // 拖动中
      onMouseUp={handleMouseUp} // 鼠标松开结束拖动
      onMouseLeave={handleMouseLeave} // 离开区域时结束拖动
    >
      <img
        ref={imageRef}
        src={src}
        alt="Preview"
        style={{
          transform: `scale(${scale * baseScale}) translate(${offset.x}px, ${offset.y}px)`,
          transformOrigin: "top left",
          transition: "transform 0.1s ease-out",
          pointerEvents: "none", // 禁用图片的点击事件
          userSelect: "none", // 禁用图片的选择
          display: "block", // 防止图片下方空白
        }}
      />
      {/* 显示局部蒙版 */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          background: "rgba(0, 0, 0, 0.5)", // 黑色蒙版
          pointerEvents: "none", // 防止覆盖用户操作
          clipPath: `inset(${offset.y}px ${offset.x}px ${containerHeight - offset.y}px ${containerWidth - offset.x}px)`,
        }}
      ></div>
    </div>
  );
};

export default ImagePreview;
