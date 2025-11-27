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
  usePhotoFilterSelectors,
  usePhotoFilterStore,
  type ServerData,
} from "../helpers/store/usePhotoFilterStore";
import { PhotoService } from "@/helpers/services/PhotoService";
import { GalleryPanel } from "./PhotoFilterPage/GalleryPanel";
import { SidePanel } from "./PhotoFilterPage/SidePanel";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

/**
 * 单个分组组件，使用 React.memo 避免无关重渲染
 */

function ServerStatusMonitorDrawer({
  serverStatus,
  serverData,
}: {
  serverStatus: string;
  serverData: ServerData | null;
}) {
  const { t } = useTranslation();

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-muted/60 text-muted-foreground hover:bg-muted flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
        >
          <Server className="h-3 w-3" />
          <span className="max-w-[19vw] truncate">{serverStatus}</span>
        </Button>
      </DrawerTrigger>
      <DrawerContent className="bg-background grid max-h-[80vh] max-w-xl translate-y-0 grid-rows-[auto_1fr_auto] overflow-hidden border-t sm:rounded-t-xl sm:border">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-center justify-between">
            <div>
              <DrawerTitle className="text-base font-semibold">
                {t("filterPage.serverTitle")}
              </DrawerTitle>
              <DrawerDescription className="text-muted-foreground text-xs">
                {t("filterPage.serverQueueLength", {
                  len: serverData?.task_queue_length ?? 0,
                })}
              </DrawerDescription>
            </div>
            <div
              className={cn(
                "rounded-full px-2 py-1 text-[12px] font-semibold",
                serverData?.status === "空闲中"
                  ? "bg-gray-100 text-gray-600"
                  : "bg-emerald-100 text-emerald-700",
              )}
            >
              {serverData?.status ?? t("filterPage.unknownStatus")}
            </div>
          </div>
        </DrawerHeader>

        <div className="min-h-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="space-y-4 p-4 pr-3">
              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium">
                    {t("filterPage.serverQueueTitle")}
                  </p>
                  <p className="font-mono text-2xl font-bold text-blue-600">
                    {serverData?.task_queue_length ?? 0}
                  </p>
                </div>
                <div className="bg-muted rounded-lg p-3">
                  <p className="text-muted-foreground mb-1 text-[11px] font-medium">
                    {t("filterPage.serverWorkerCount") || "Workers"}
                  </p>
                  <p className="text-foreground font-mono text-2xl font-bold">
                    {serverData?.workers.length ?? 0}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                  {t("filterPage.workerLabelPlural") || "Workers Progress"}
                </p>
                <div className="space-y-2">
                  {serverData?.workers?.map(
                    (workerStatus: string, index: number) => (
                      <div key={index} className="space-y-1">
                        <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                          <span className="truncate">
                            {t("filterPage.workerLabel")} {index + 1}
                          </span>
                          <span className="text-foreground ml-2 flex-shrink-0 font-mono text-xs">
                            {workerStatus}
                          </span>
                        </div>
                        <Progress
                          value={parseFloat(workerStatus)}
                          className="w-full"
                        />
                      </div>
                    ),
                  )}
                  {!serverData?.workers?.length && (
                    <p className="text-muted-foreground py-4 text-center text-xs">
                      {t("filterPage.noWorkerInfo") ||
                        "No worker info available."}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <ScrollBar />
          </ScrollArea>
        </div>

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
}

export default function PhotoFilterSubpage() {
  const { t } = useTranslation();
  const {
    lstGalleryGroupedPhotos,
    lstPreviewPhotoDetails,
    numSimilarityThreshold,
    boolShowDisabledPhotos,
    strServerStatusText,
    objServerStatusData,
    numLeftPaneWidthVw,
    numPreviewHeightPercent,
    fnSetShowDisabledPhotos,
    fnSetLeftPaneWidthVw,
    fnSetPreviewHeightPercent,
    fnSelectPreviewPhotos,
    fnTogglePhotoEnabledFromGrid,
  } = usePhotoFilterSelectors();

  // ========== PhotoFilterEffects 逻辑直接嵌入 ==========
  const fnSetCurrentPage = usePhotoFilterStore((s: any) => s.fnSetCurrentPage);
  const modeGalleryView = usePhotoFilterStore((s: any) => s.modeGalleryView);

  // 进入页面时设置标识
  React.useEffect(() => {
    fnSetCurrentPage("filter");
  }, [fnSetCurrentPage]);

  // 配置变化时刷新（使用 ref 防止首次触发）
  const isFirstMountRef = React.useRef(true);
  React.useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    PhotoService.refreshPhotos();
  }, [boolShowDisabledPhotos, modeGalleryView]);

  // ========== 左右分栏拖动逻辑 ==========
  const initialLeftVwRef = React.useRef<number>(numLeftPaneWidthVw); // 记录首次加载时的左侧宽度百分比
  const minLeftVw = Math.max(8, initialLeftVwRef.current - 20); // 限制拖拽最小宽度，避免左侧太窄
  const maxLeftVw = Math.min(92, initialLeftVwRef.current + 20); // 限制拖拽最大宽度，避免遮挡右侧

  // 左右分栏宽度拖动相关 refs
  const draggingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startLeftRef = React.useRef(numLeftPaneWidthVw);

  // 存放当前绑定到 window 的处理函数（用于卸载时统一移除，防止内存泄漏）
  const mouseMoveHandlerRef = React.useRef<((e: MouseEvent) => void) | null>(
    null,
  );
  const mouseUpHandlerRef = React.useRef<(() => void) | null>(null);
  const touchMoveHandlerRef = React.useRef<((e: TouchEvent) => void) | null>(
    null,
  );
  const touchEndHandlerRef = React.useRef<(() => void) | null>(null);

  // 启动左右分栏的鼠标拖动：在这里创建并绑定移动/结束处理器
  const startMouseDrag = (clientX: number) => {
    draggingRef.current = true;
    startXRef.current = clientX;
    startLeftRef.current = numLeftPaneWidthVw;

    const onMouseMove = (ev: MouseEvent) => {
      const deltaX = ev.clientX - startXRef.current;
      const deltaVw = (deltaX / window.innerWidth) * 100;
      let newLeft = startLeftRef.current + deltaVw;
      if (newLeft < minLeftVw) newLeft = minLeftVw;
      if (newLeft > maxLeftVw) newLeft = maxLeftVw;
      fnSetLeftPaneWidthVw(Number(newLeft.toFixed(2)));
    };

    const onMouseUp = () => {
      draggingRef.current = false;
      if (mouseMoveHandlerRef.current) {
        window.removeEventListener("mousemove", mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        window.removeEventListener("mouseup", mouseUpHandlerRef.current);
      }
      mouseMoveHandlerRef.current = null;
      mouseUpHandlerRef.current = null;
    };

    mouseMoveHandlerRef.current = onMouseMove;
    mouseUpHandlerRef.current = onMouseUp;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // 启动左右分栏的触摸拖动（移动端）
  const startTouchDrag = (clientX: number) => {
    draggingRef.current = true;
    startXRef.current = clientX;
    startLeftRef.current = numLeftPaneWidthVw;

    const onTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches[0];
      if (!touch) return;
      const deltaX = touch.clientX - startXRef.current;
      const deltaVw = (deltaX / window.innerWidth) * 100;
      let newLeft = startLeftRef.current + deltaVw;
      if (newLeft < minLeftVw) newLeft = minLeftVw;
      if (newLeft > maxLeftVw) newLeft = maxLeftVw;
      fnSetLeftPaneWidthVw(Number(newLeft.toFixed(2)));
    };

    const onTouchEnd = () => {
      draggingRef.current = false;
      if (touchMoveHandlerRef.current) {
        window.removeEventListener("touchmove", touchMoveHandlerRef.current);
      }
      if (touchEndHandlerRef.current) {
        window.removeEventListener("touchend", touchEndHandlerRef.current);
      }
      touchMoveHandlerRef.current = null;
      touchEndHandlerRef.current = null;
    };

    touchMoveHandlerRef.current = onTouchMove;
    touchEndHandlerRef.current = onTouchEnd;
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };

  // 卸载时清理左右分栏拖动监听器
  React.useEffect(() => {
    return () => {
      if (mouseMoveHandlerRef.current) {
        window.removeEventListener("mousemove", mouseMoveHandlerRef.current);
      }
      if (mouseUpHandlerRef.current) {
        window.removeEventListener("mouseup", mouseUpHandlerRef.current);
      }
      if (touchMoveHandlerRef.current) {
        window.removeEventListener("touchmove", touchMoveHandlerRef.current);
      }
      if (touchEndHandlerRef.current) {
        window.removeEventListener("touchend", touchEndHandlerRef.current);
      }
    };
  }, []);

  // ========== 预览图片高度拖动逻辑（右侧预览面板内部高度调节） ==========
  const previewDraggingRef = React.useRef(false);
  const previewStartYRef = React.useRef(0);
  const previewStartHeightRef = React.useRef(numPreviewHeightPercent);
  const previewContainerRectRef = React.useRef<DOMRect | null>(null);

  const previewMouseMoveHandlerRef = React.useRef<
    ((e: MouseEvent) => void) | null
  >(null);
  const previewMouseUpHandlerRef = React.useRef<(() => void) | null>(null);
  const previewTouchMoveHandlerRef = React.useRef<
    ((e: TouchEvent) => void) | null
  >(null);
  const previewTouchEndHandlerRef = React.useRef<(() => void) | null>(null);

  const startPreviewMouseDrag = (clientY: number, containerRect: DOMRect) => {
    previewDraggingRef.current = true;
    previewStartYRef.current = clientY;
    previewStartHeightRef.current = numPreviewHeightPercent;
    previewContainerRectRef.current = containerRect;

    const onMouseMove = (ev: MouseEvent) => {
      if (!previewContainerRectRef.current) return;
      const containerHeight = previewContainerRectRef.current.height;
      // 计算鼠标移动的增量（相对于拖动开始位置）
      const deltaY = ev.clientY - previewStartYRef.current;
      // 将增量转换为百分比
      const deltaPercent = (deltaY / containerHeight) * 100;
      // 基于初始高度加上增量
      let newHeight = previewStartHeightRef.current + deltaPercent;
      // 限制范围
      if (newHeight < 20) newHeight = 20;
      if (newHeight > 70) newHeight = 70;
      fnSetPreviewHeightPercent(Number(newHeight.toFixed(1)));
    };

    const onMouseUp = () => {
      previewDraggingRef.current = false;
      previewContainerRectRef.current = null;
      if (previewMouseMoveHandlerRef.current) {
        window.removeEventListener(
          "mousemove",
          previewMouseMoveHandlerRef.current,
        );
      }
      if (previewMouseUpHandlerRef.current) {
        window.removeEventListener("mouseup", previewMouseUpHandlerRef.current);
      }
      previewMouseMoveHandlerRef.current = null;
      previewMouseUpHandlerRef.current = null;
    };

    previewMouseMoveHandlerRef.current = onMouseMove;
    previewMouseUpHandlerRef.current = onMouseUp;
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const startPreviewTouchDrag = (clientY: number, containerRect: DOMRect) => {
    previewDraggingRef.current = true;
    previewStartYRef.current = clientY;
    previewStartHeightRef.current = numPreviewHeightPercent;
    previewContainerRectRef.current = containerRect;

    const onTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches[0];
      if (!touch || !previewContainerRectRef.current) return;
      const containerHeight = previewContainerRectRef.current.height;
      // 计算触摸点移动的增量（相对于拖动开始位置）
      const deltaY = touch.clientY - previewStartYRef.current;
      // 将增量转换为百分比
      const deltaPercent = (deltaY / containerHeight) * 100;
      // 基于初始高度加上增量
      let newHeight = previewStartHeightRef.current + deltaPercent;
      // 限制范围
      if (newHeight < 20) newHeight = 20;
      if (newHeight > 70) newHeight = 70;
      fnSetPreviewHeightPercent(Number(newHeight.toFixed(1)));
    };

    const onTouchEnd = () => {
      previewDraggingRef.current = false;
      previewContainerRectRef.current = null;
      if (previewTouchMoveHandlerRef.current) {
        window.removeEventListener(
          "touchmove",
          previewTouchMoveHandlerRef.current,
        );
      }
      if (previewTouchEndHandlerRef.current) {
        window.removeEventListener(
          "touchend",
          previewTouchEndHandlerRef.current,
        );
      }
      previewTouchMoveHandlerRef.current = null;
      previewTouchEndHandlerRef.current = null;
    };

    previewTouchMoveHandlerRef.current = onTouchMove;
    previewTouchEndHandlerRef.current = onTouchEnd;
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
  };

  // 卸载时清理预览拖动监听器
  React.useEffect(() => {
    return () => {
      if (previewMouseMoveHandlerRef.current) {
        window.removeEventListener(
          "mousemove",
          previewMouseMoveHandlerRef.current,
        );
      }
      if (previewMouseUpHandlerRef.current) {
        window.removeEventListener("mouseup", previewMouseUpHandlerRef.current);
      }
      if (previewTouchMoveHandlerRef.current) {
        window.removeEventListener(
          "touchmove",
          previewTouchMoveHandlerRef.current,
        );
      }
      if (previewTouchEndHandlerRef.current) {
        window.removeEventListener(
          "touchend",
          previewTouchEndHandlerRef.current,
        );
      }
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

  // 当前高亮照片列表（只在 previewPhotos 变化时重建）
  const highlightPhotos = React.useMemo<Photo[]>(() => {
    if (!lstPreviewPhotoDetails.length) return [];
    return lstPreviewPhotoDetails.map((photo) => ({
      fileName: photo.fileName,
      fileUrl: photo.fileUrl,
      filePath: photo.filePath,
      info: photo.info ?? "",
      isEnabled: photo.isEnabled ?? true,
    }));
  }, [lstPreviewPhotoDetails]);

  const totalPhotoCount = lstGalleryGroupedPhotos.flat().length;

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/60 px-4 py-2 dark:bg-gray-900">
      {/* 顶层左右分栏（左宽度可拖动），初始约 65vw，min/max = 初始 ±20vw */}
      <div className="flex w-full flex-1 items-stretch">
        {/* 左侧：主画廊（宽度由 numLeftPaneWidthVw 控制） */}
        <div
          className="order-1"
          style={{
            width: `${numLeftPaneWidthVw}vw`,
            minWidth: `${minLeftVw}vw`,
            maxWidth: `${maxLeftVw}vw`,
          }}
        >
          <div className="bg-background/80 flex h-[calc(100vh-85px)] w-full flex-col space-y-4 rounded-xl p-3 shadow-sm">
            <GalleryPanel
              totalPhotoCount={totalPhotoCount}
              highlightPhotos={highlightPhotos}
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
