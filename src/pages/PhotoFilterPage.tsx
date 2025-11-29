// "use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Play, Eye, EyeOff, Server, Loader2 } from "lucide-react";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Photo } from "@/helpers/ipc/database/db";
import {
  usePhotoFilterStore,
  type ServerData,
} from "../helpers/store/usePhotoFilterStore";
import { PhotoService } from "@/helpers/services/PhotoService";
import { GalleryPanel } from "./PhotoFilterPage/GalleryPanel";
import { SidePanel } from "./PhotoFilterPage/SidePanel";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

/**
 * 工作线程状态行组件 - 单个 Worker 渲染单元
 * 使用 memo 避免不必要的重绘
 */
interface WorkerRowProps {
  index: number; // 工作线程索引
  workerStatus: string; // 工作线程状态百分比
  t: ReturnType<typeof useTranslation>["t"]; // i18n 翻译函数
}

const WorkerRow = React.memo<WorkerRowProps>(({ index, workerStatus, t }) => (
  <div className="space-y-1">
    <div className="text-muted-foreground flex items-center justify-between text-[11px]">
      <span className="truncate">{t("filterPage.workerLabel")} {index + 1}</span>
      <span className="text-foreground ml-2 flex-shrink-0 font-mono text-xs">{workerStatus}</span>
    </div>
    <Progress value={parseFloat(workerStatus)} className="w-full" /> {/* 进度条：根据百分比显示 */}
  </div>
), (prev, next) => (
  prev.index === next.index &&
  prev.workerStatus === next.workerStatus
)); // 仅比较 index 和 workerStatus，避免 t 函数变化导致重渲染

WorkerRow.displayName = "WorkerRow";

/**
 * 服务器状态监控抽屉组件 - 优化渲染版本
 * 使用 React.memo + 自定义比较函数缓存，避免数据未变时重渲染
 */
const ServerStatusMonitorDrawer = React.memo<{
  serverStatus: string; // 服务器状态文本
  serverData: ServerData | null; // 服务器数据对象
}>(({ serverStatus, serverData }) => {
  const { t } = useTranslation();

  // 缓存关键数据以支持深度比较
  const queueLength = serverData?.task_queue_length ?? 0; // 任务队列长度
  const workerCount = serverData?.workers?.length ?? 0; // Worker 数量
  const statusText = serverData?.status ?? t("filterPage.unknownStatus"); // 服务器状态文本
  const workers = serverData?.workers ?? []; // Worker 列表

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-muted/60 text-muted-foreground hover:bg-muted flex items-center gap-2 rounded-xl border px-2 py-1 text-xs font-medium"
        >
          <Server className="h-3 w-3" /> {/* 服务器图标 */}
          <span className="max-w-[19vw] truncate">{serverStatus}</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="bg-background grid max-h-[80vh] max-w-xl translate-y-0 grid-rows-[auto_1fr_auto] overflow-hidden border-t sm:rounded-t-xl sm:border">
        {/* ===== 抽屉头：标题 + 状态指示器 ===== */}
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-base font-semibold">{t("filterPage.serverTitle")}</DrawerTitle>
              <DrawerDescription className="text-muted-foreground text-xs">
                {t("filterPage.serverQueueLength", { len: queueLength })}
              </DrawerDescription>
            </div>
            <div className={cn("rounded-full px-2 py-1 text-[12px] font-semibold", statusText === "空闲中" ? "bg-gray-100 text-gray-600" : "bg-emerald-100 text-emerald-700")}>
              {statusText} {/* 状态指示：空闲/工作中 */}
            </div>
          </div>
        </DrawerHeader>

        {/* ===== 抽屉内容：统计 + Worker 进度条 ===== */}
        <div className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="space-y-4 p-4 pr-3">
              {/* 统计卡片：队列长度 + Worker 数量 */}
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium">{t("filterPage.serverQueueTitle")}</p>
                  <p className="font-mono text-2xl font-bold text-blue-600">{queueLength}</p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium">{t("filterPage.serverWorkerCount") || "Workers"}</p>
                  <p className="text-foreground font-mono text-2xl font-bold">{workerCount}</p>
                </div>
              </div>

              {/* Worker 进度条列表 */}
              <div className="space-y-2">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">{t("filterPage.workerLabelPlural") || "Workers Progress"}</p>
                <div className="space-y-2">
                  {workers.length > 0 ? (
                    workers.map((workerStatus, index) => <WorkerRow key={index} index={index} workerStatus={workerStatus} t={t} />) // 逐行渲染 Worker 状态
                  ) : (
                    <p className="text-muted-foreground py-4 text-center text-xs">{t("filterPage.noWorkerInfo") || "No worker info available."}</p>
                  )}
                </div>
              </div>
            </div>
            <ScrollBar />
          </ScrollArea>
        </div>

        {/* ===== 抽屉尾部：关闭按钮 ===== */}
        <DrawerFooter className="bg-muted/40 border-t px-4 py-3">
          <DrawerClose asChild>
            <Button variant="outline" size="sm" className="ml-auto">
              {t("buttons.close")}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}, (prev, next) => (
  prev.serverStatus === next.serverStatus &&
  prev.serverData?.task_queue_length === next.serverData?.task_queue_length &&
  prev.serverData?.status === next.serverData?.status &&
  prev.serverData?.workers?.length === next.serverData?.workers?.length &&
  JSON.stringify(prev.serverData?.workers) === JSON.stringify(next.serverData?.workers)
)); // 自定义比较函数：仅在关键字段变化时重渲染

ServerStatusMonitorDrawer.displayName = "ServerStatusMonitorDrawer";

export default function PhotoFilterSubpage() {
  const { t } = useTranslation();
  // 精细化订阅：拆分相关的状态，避免无关state导致的整体重渲染
  const lstGalleryGroupedPhotos = usePhotoFilterStore(
    (s) => s.lstGalleryGroupedPhotos,
  );
  // const lstPreviewPhotoDetails = usePhotoFilterStore(
  //   (s) => s.lstPreviewPhotoDetails,
  // );
  const numSimilarityThreshold = usePhotoFilterStore(
    (s) => s.numSimilarityThreshold,
  );
  const boolShowDisabledPhotos = usePhotoFilterStore(
    (s) => s.boolShowDisabledPhotos,
  );
  const strServerStatusText = usePhotoFilterStore((s) => s.strServerStatusText);
  const objServerStatusData = usePhotoFilterStore((s) => s.objServerStatusData);
  const numLeftPaneWidthVw = usePhotoFilterStore((s) => s.numLeftPaneWidthVw);
  const numPreviewHeightPercent = usePhotoFilterStore(
    (s) => s.numPreviewHeightPercent,
  );
  const fnSetShowDisabledPhotos = usePhotoFilterStore(
    (s) => s.fnSetShowDisabledPhotos,
  );
  const fnSetLeftPaneWidthVw = usePhotoFilterStore(
    (s) => s.fnSetLeftPaneWidthVw,
  );
  const fnSetPreviewHeightPercent = usePhotoFilterStore(
    (s) => s.fnSetPreviewHeightPercent,
  );
  const fnSelectPreviewPhotos = usePhotoFilterStore(
    (s) => s.fnSelectPreviewPhotos,
  );
  const fnTogglePhotoEnabledFromGrid = usePhotoFilterStore(
    (s) => s.fnTogglePhotoEnabledFromGrid,
  );

  // ========== PhotoFilterEffects 逻辑直接嵌入 ==========
  const fnSetCurrentPage = usePhotoFilterStore((s: any) => s.fnSetCurrentPage);
  const modeGalleryView = usePhotoFilterStore((s: any) => s.modeGalleryView);

  // 进入页面时设置标识并刷新完整照片列表（恢复导出页面可能改变的状态）
  React.useEffect(() => {
    fnSetCurrentPage("filter"); // 标记当前页面为过滤
    PhotoService.refreshPhotos(); // 重新加载完整照片列表（避免导出页面污染）
  }, [fnSetCurrentPage]);

  // 配置变化时刷新（使用 ref 防止首次触发）
  const isFirstMountRef = React.useRef(true);
  React.useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    PhotoService.refreshPhotos(); // 配置变化时（如显示禁用照片、切换视图）重新加载
  }, [boolShowDisabledPhotos, modeGalleryView]);

  // ========== 左右分栏拖动逻辑 ==========
  const initialLeftVwRef = React.useRef<number>(numLeftPaneWidthVw); // 记录首次加载时的左侧宽度百分比
  const MIN_LEFT_WIDTH_PX = 450; // 左侧面板最小宽度（像素）

  // 动态计算最小/最大宽度百分比（随窗口宽度自适应）
  const getMinMaxVw = React.useCallback(() => {
    const minVw = Math.max((MIN_LEFT_WIDTH_PX / window.innerWidth) * 100, initialLeftVwRef.current - 20); // 至少 425px 或初始宽度减 20vw
    const maxVw = Math.min(92, initialLeftVwRef.current + 20); // 最多初始宽度加 20vw，但不超过 92vw
    return { minVw, maxVw };
  }, []);

  // 左右分栏宽度拖动相关 refs
  const draggingRef = React.useRef(false); // 记录拖动状态
  const startXRef = React.useRef(0); // 记录拖动起点 X 坐标
  const startLeftRef = React.useRef(numLeftPaneWidthVw); // 记录拖动前的左侧宽度

  // 存放当前绑定到 window 的处理函数（用于卸载时统一移除，防止内存泄漏）
  const mouseMoveHandlerRef = React.useRef<((e: MouseEvent) => void) | null>(null); // 鼠标移动处理器
  const mouseUpHandlerRef = React.useRef<(() => void) | null>(null); // 鼠标释放处理器
  const touchMoveHandlerRef = React.useRef<((e: TouchEvent) => void) | null>(null); // 触摸移动处理器
  const touchEndHandlerRef = React.useRef<((e: TouchEvent) => void) | null>(null); // 触摸结束处理器

  // 通用拖动处理：更新宽度并在范围内约束
  const updatePaneWidth = React.useCallback((clientX: number) => {
    const { minVw, maxVw } = getMinMaxVw(); // 动态获取约束范围
    const deltaX = clientX - startXRef.current; // 鼠标/触摸相对于拖动起点的位移（像素）
    const deltaVw = (deltaX / window.innerWidth) * 100; // 转换为相对于窗口宽度的百分比
    let newLeft = startLeftRef.current + deltaVw; // 计算新的左侧宽度
    if (newLeft < minVw) newLeft = minVw; // 强制约束到最小值（至少 425px）
    if (newLeft > maxVw) newLeft = maxVw; // 强制约束到最大值
    fnSetLeftPaneWidthVw(Number(newLeft.toFixed(2))); // 更新状态，保留 2 位小数
  }, [getMinMaxVw, fnSetLeftPaneWidthVw]);

  // 通用清理函数：移除已绑定的事件监听器
  const cleanupDragHandlers = React.useCallback((moveRef: React.MutableRefObject<any>, endRef: React.MutableRefObject<any>, eventType: "mouse" | "touch") => {
    const moveEvent = eventType === "mouse" ? "mousemove" : "touchmove"; // 确定移动事件类型
    const endEvent = eventType === "mouse" ? "mouseup" : "touchend"; // 确定结束事件类型
    if (moveRef.current) window.removeEventListener(moveEvent, moveRef.current); // 移除移动事件监听
    if (endRef.current) window.removeEventListener(endEvent, endRef.current); // 移除结束事件监听
    moveRef.current = null; // 清空移动处理器引用
    endRef.current = null; // 清空结束处理器引用
  }, []);

  // 启动左右分栏的鼠标拖动：创建并绑定移动/结束处理器
  const startMouseDrag = React.useCallback((clientX: number) => {
    draggingRef.current = true; // 标记拖动状态
    startXRef.current = clientX; // 记录拖动起点
    startLeftRef.current = numLeftPaneWidthVw; // 记录拖动前的左侧宽度

    const onMouseMove = (ev: MouseEvent) => updatePaneWidth(ev.clientX); // 鼠标移动时更新宽度

    const onMouseUp = () => {
      draggingRef.current = false; // 清除拖动状态
      cleanupDragHandlers(mouseMoveHandlerRef, mouseUpHandlerRef, "mouse"); // 清理鼠标事件监听
    };

    mouseMoveHandlerRef.current = onMouseMove;
    mouseUpHandlerRef.current = onMouseUp;
    window.addEventListener("mousemove", onMouseMove); // 添加鼠标移动监听
    window.addEventListener("mouseup", onMouseUp); // 添加鼠标释放监听
  }, [updatePaneWidth, cleanupDragHandlers, numLeftPaneWidthVw]);

  // 启动左右分栏的触摸拖动（移动端）：创建并绑定移动/结束处理器
  const startTouchDrag = React.useCallback((clientX: number) => {
    draggingRef.current = true; // 标记拖动状态
    startXRef.current = clientX; // 记录拖动起点
    startLeftRef.current = numLeftPaneWidthVw; // 记录拖动前的左侧宽度

    const onTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches[0]; // 获取第一个触摸点
      if (!touch) return; // 触摸点不存在则退出
      updatePaneWidth(touch.clientX); // 触摸移动时更新宽度
    };

    const onTouchEnd = () => {
      draggingRef.current = false; // 清除拖动状态
      cleanupDragHandlers(touchMoveHandlerRef, touchEndHandlerRef, "touch"); // 清理触摸事件监听
    };

    touchMoveHandlerRef.current = onTouchMove;
    touchEndHandlerRef.current = onTouchEnd;
    window.addEventListener("touchmove", onTouchMove, { passive: false }); // 添加触摸移动监听（需禁用被动模式以支持 preventDefault）
    window.addEventListener("touchend", onTouchEnd); // 添加触摸结束监听
  }, [updatePaneWidth, cleanupDragHandlers, numLeftPaneWidthVw]);

  // 卸载时清理左右分栏拖动监听器
  React.useEffect(() => {
    return () => {
      cleanupDragHandlers(mouseMoveHandlerRef, mouseUpHandlerRef, "mouse"); // 清理左右分栏鼠标事件
      cleanupDragHandlers(touchMoveHandlerRef, touchEndHandlerRef, "touch"); // 清理左右分栏触摸事件
    };
  }, [cleanupDragHandlers]);

  // 窗口 resize 时动态调整左侧面板宽度，确保不小于 425px
  React.useEffect(() => {
    const handleWindowResize = () => {
      const { minVw } = getMinMaxVw(); // 获取当前最小宽度
      if (numLeftPaneWidthVw < minVw) {
        fnSetLeftPaneWidthVw(Number(minVw.toFixed(2))); // 如果当前宽度小于最小值，自动调整
      }
    };

    window.addEventListener("resize", handleWindowResize); // 监听窗口 resize 事件
    return () => window.removeEventListener("resize", handleWindowResize); // 卸载时移除监听
  }, [getMinMaxVw, numLeftPaneWidthVw, fnSetLeftPaneWidthVw]);

  // ========== 预览图片高度拖动逻辑（右侧预览面板内部高度调节） ==========
  const previewDraggingRef = React.useRef(false); // 记录预览面板拖动状态
  const previewStartYRef = React.useRef(0); // 记录预览拖动的起始 Y 坐标
  const previewStartHeightRef = React.useRef(numPreviewHeightPercent); // 记录预览拖动前的高度百分比
  const previewContainerRectRef = React.useRef<DOMRect | null>(null); // 记录预览容器的位置和大小信息

  const previewMouseMoveHandlerRef = React.useRef<((e: MouseEvent) => void) | null>(null); // 预览鼠标移动处理器
  const previewMouseUpHandlerRef = React.useRef<(() => void) | null>(null); // 预览鼠标释放处理器
  const previewTouchMoveHandlerRef = React.useRef<((e: TouchEvent) => void) | null>(null); // 预览触摸移动处理器
  const previewTouchEndHandlerRef = React.useRef<(() => void) | null>(null); // 预览触摸结束处理器

  // 通用更新预览高度函数：基于容器高度和移动增量计算新高度并约束在 20%-70% 范围内
  const updatePreviewHeight = (clientY: number) => {
    if (!previewContainerRectRef.current) return; // 容器信息不存在则退出
    const containerHeight = previewContainerRectRef.current.height; // 获取容器高度
    const deltaY = clientY - previewStartYRef.current; // 计算相对于拖动起点的 Y 位移
    const deltaPercent = (deltaY / containerHeight) * 100; // 转换为百分比
    let newHeight = previewStartHeightRef.current + deltaPercent; // 计算新高度
    if (newHeight < 20) newHeight = 20; // 强制约束最小值 20%
    if (newHeight > 70) newHeight = 70; // 强制约束最大值 70%
    fnSetPreviewHeightPercent(Number(newHeight.toFixed(1))); // 更新状态，保留 1 位小数
  };

  // 启动预览高度的鼠标拖动：创建并绑定移动/结束处理器
  const startPreviewMouseDrag = (clientY: number, containerRect: DOMRect) => {
    previewDraggingRef.current = true; // 标记拖动状态
    previewStartYRef.current = clientY; // 记录拖动起点
    previewStartHeightRef.current = numPreviewHeightPercent; // 记录拖动前的高度
    previewContainerRectRef.current = containerRect; // 记录容器信息

    const onMouseMove = (ev: MouseEvent) => updatePreviewHeight(ev.clientY); // 鼠标移动时更新高度

    const onMouseUp = () => {
      previewDraggingRef.current = false; // 清除拖动状态
      previewContainerRectRef.current = null; // 清空容器信息
      cleanupDragHandlers(previewMouseMoveHandlerRef, previewMouseUpHandlerRef, "mouse"); // 清理鼠标事件监听
    };

    previewMouseMoveHandlerRef.current = onMouseMove;
    previewMouseUpHandlerRef.current = onMouseUp;
    window.addEventListener("mousemove", onMouseMove); // 添加鼠标移动监听
    window.addEventListener("mouseup", onMouseUp); // 添加鼠标释放监听
  };

  // 启动预览高度的触摸拖动（移动端）：创建并绑定移动/结束处理器
  const startPreviewTouchDrag = (clientY: number, containerRect: DOMRect) => {
    previewDraggingRef.current = true; // 标记拖动状态
    previewStartYRef.current = clientY; // 记录拖动起点
    previewStartHeightRef.current = numPreviewHeightPercent; // 记录拖动前的高度
    previewContainerRectRef.current = containerRect; // 记录容器信息

    const onTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches[0]; // 获取第一个触摸点
      if (!touch) return; // 触摸点不存在则退出
      updatePreviewHeight(touch.clientY); // 触摸移动时更新高度
    };

    const onTouchEnd = () => {
      previewDraggingRef.current = false; // 清除拖动状态
      previewContainerRectRef.current = null; // 清空容器信息
      cleanupDragHandlers(previewTouchMoveHandlerRef, previewTouchEndHandlerRef, "touch"); // 清理触摸事件监听
    };

    previewTouchMoveHandlerRef.current = onTouchMove;
    previewTouchEndHandlerRef.current = onTouchEnd;
    window.addEventListener("touchmove", onTouchMove, { passive: false }); // 添加触摸移动监听（需禁用被动模式以支持 preventDefault）
    window.addEventListener("touchend", onTouchEnd); // 添加触摸结束监听
  };

  // 卸载时清理预览拖动监听器
  React.useEffect(() => {
    return () => {
      cleanupDragHandlers(previewMouseMoveHandlerRef, previewMouseUpHandlerRef, "mouse"); // 清理预览鼠标事件
      cleanupDragHandlers(previewTouchMoveHandlerRef, previewTouchEndHandlerRef, "touch"); // 清理预览触摸事件
    };
  }, []);

  const handlePhotoClick = React.useCallback(
    async (clickphotos: Photo[], event: string) => {
      if (!clickphotos.length) return;
      const target = clickphotos[0];

      if (event === "Select") {
        await fnSelectPreviewPhotos(clickphotos);
        return;
      }

      if (event === "Change") {
        await fnTogglePhotoEnabledFromGrid(target);
      }
    },
    [fnSelectPreviewPhotos, fnTogglePhotoEnabledFromGrid],
  );

  const handleSubmit = async () => {
    await PhotoService.submitDetectionTask({
      similarityThreshold: numSimilarityThreshold,
      showDisabledPhotos: boolShowDisabledPhotos,
    });
  };

  const totalPhotoCount = lstGalleryGroupedPhotos.flat().length;
  const { minVw: currentMinVw, maxVw: currentMaxVw } = getMinMaxVw(); // 获取当前最小/最大宽度约束

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/60 px-4 py-2 dark:bg-gray-900">
      {/* 顶层左右分栏（左宽度可拖动），初始约 65vw，min/max = 初始 ±20vw，但左侧至少保持 425px */}
      <div className="flex w-full flex-1 items-stretch">
        {/* 左侧：主画廊（宽度由 numLeftPaneWidthVw 控制，窗口 resize 时自动调整） */}
        <div
          className="order-1"
          style={{
            width: `${numLeftPaneWidthVw}vw`,
            minWidth: `${currentMinVw}vw`,
            maxWidth: `${currentMaxVw}vw`,
          }}
        >
          <div className="bg-background/80 flex h-[calc(100vh-85px)] w-full flex-col space-y-4 rounded-xl p-3 shadow-sm">
            <GalleryPanel
              totalPhotoCount={totalPhotoCount}
              onPhotoClick={handlePhotoClick}
            />

            {/* 底部：提交任务 + 服务端状态 + 显示弃用开关 */}
            <div className="bg-background flex items-center justify-between rounded-lg border px-3 py-2 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSubmit}
                  size="sm"
                  className="flex items-center gap-1.5 bg-blue-600 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  {objServerStatusData?.status !== "空闲中" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                  <span>{t("filterPage.submitTask")}</span>
                </Button>

                <ServerStatusMonitorDrawer
                  serverStatus={strServerStatusText}
                  serverData={objServerStatusData}
                />
              </div>

              <div className="bg-muted/80 text-muted-foreground flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                <Label
                  htmlFor="disabled-display"
                  className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[11px] font-normal"
                >
                  {boolShowDisabledPhotos ? (
                    <Eye className="h-3.5 w-3.5" />
                  ) : (
                    <EyeOff className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {t("filterPage.showDisabledPhotos") || "Show disabled"}
                  </span>
                </Label>
                <Switch
                  id="disabled-display"
                  checked={boolShowDisabledPhotos}
                  onCheckedChange={fnSetShowDisabledPhotos}
                  className="scale-90"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 中间：左右分栏拖动条 */}
        <div
          className="order-2 mx-1 flex w-[6px] cursor-ew-resize items-center justify-center select-none"
          onMouseDown={(e) => startMouseDrag(e.clientX)}
          onTouchStart={(e) => {
            if (e.touches && e.touches[0]) startTouchDrag(e.touches[0].clientX);
          }}
        >
          <div className="bg-muted/60 h-10 w-[2px] rounded-full" />
        </div>

        {/* 右侧：筛选 & 预览面板 */}
        <div className="order-3 hidden min-w-[260px] flex-1 flex-col space-y-4 sm:flex">
          <SidePanel
            previewHeightPercent={numPreviewHeightPercent}
            onStartPreviewMouseDrag={startPreviewMouseDrag}
            onStartPreviewTouchDrag={startPreviewTouchDrag}
          />
        </div>
      </div>
    </div>
  );
}
