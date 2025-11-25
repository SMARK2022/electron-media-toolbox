// "use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  Layers,
  Grid,
  Play,
  RotateCcw,
  Trash2,
  Eye,
  EyeOff,
  Server,
  Loader2,
  AlertCircle,
  Image as ImageIcon,
} from "lucide-react";

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
import { Photo } from "@/helpers/db/db";
import {
  usePhotoFilterSelectors,
  type ServerData,
} from "../helpers/store/usePhotoFilterStore"; // Zustand 领域 store：照片列表、预览、服务状态等统一在这里管理
import { GalleryPanel } from "./PhotoFilterPage/GalleryPanel"; // 左侧画廊 UI，只关心 gallery 相关的 slice
import { SidePanel } from "./PhotoFilterPage/SidePanel"; // 右侧筛选 & 预览 UI，只关心 panel 相关的 slice
import { usePhotoFilterEffects } from "./PhotoFilterPage/PhotoFilterEffects"; // 副作用 hook：初始化 / 轮询都集中到这里
import { PhotoGridEnhance } from "@/components/PhotoGrid"; // 旧版 GalleryGroup 仍然引用的增强网格组件

/**
 * 单个分组组件，使用 React.memo 避免无关重渲染
 * 只有 group 本身的引用变化时才会重渲染这组
 */
// 旧版的分组渲染组件，目前已由 `GalleryPanel` 内部实现更合理的版本
// 如果后续不再直接从本文件使用，可以考虑完全移除以进一步精简入口组件
const GalleryGroup = React.memo(
  ({
    group,
    index,
    isGroupMode,
    groupLabel,
    highlightPhotos,
    onPhotoClick,
  }: {
    group: Photo[];
    index: number;
    isGroupMode: boolean;
    groupLabel: string;
    highlightPhotos: Photo[];
    onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
  }) => {
    // 每组的 key 建议用首张的 filePath，避免 index 导致的错乱
    const header =
      isGroupMode && group.length > 0 ? (
        <div className="mb-1 flex items-center gap-2 px-1 pt-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          <span>
            {groupLabel} {index + 1}
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-400" />
        </div>
      ) : null;

    return (
      <div
        key={group[0]?.filePath ?? `group-${index}`}
        className="mb-2 last:mb-0"
      >
        {header}
        {/* 注意：当前项目真正使用的分组渲染已经迁移到 `GalleryPanel` 中，
            这里保留仅为了兼容旧引用或快速对比；如果不再需要可整体删除。*/}
        <PhotoGridEnhance
          photos={group}
          onPhotoClick={onPhotoClick}
          highlightPhotos={highlightPhotos}
        />
      </div>
    );
  },
);
GalleryGroup.displayName = "GalleryGroup"; // 便于在 React DevTools 中识别组件名称

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
      <DrawerContent className="bg-background max-h-[80vh] max-w-xl translate-y-0 border-t sm:rounded-t-xl sm:border">
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

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
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
                      <span>
                        {t("filterPage.workerLabel")} {index + 1}
                      </span>
                      <span className="text-foreground font-mono text-xs">
                        {workerStatus}
                      </span>
                    </div>
                    <Progress value={parseFloat(workerStatus)} />
                  </div>
                ),
              )}
              {!serverData?.workers?.length && (
                <p className="text-muted-foreground text-center text-xs">
                  {t("filterPage.noWorkerInfo") || "No worker info available."}
                </p>
              )}
            </div>
          </div>
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
    strSortedColumnKey,
    strServerStatusText,
    objServerStatusData,
    numLeftPaneWidthVw,
    numPreviewHeightPercent,
    fnSetShowDisabledPhotos,
    fnSetServerPollingNeeded,
    fnSetLeftPaneWidthVw,
    fnSetPreviewHeightPercent,
    fnSelectPreviewPhotos,
    fnTogglePhotoEnabledFromGrid,
  } = usePhotoFilterSelectors();

  usePhotoFilterEffects(); // 初始化数据库 + 相册轮询 + 服务状态轮询，解耦出组件外

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

  const previewMouseMoveHandlerRef = React.useRef<
    ((e: MouseEvent) => void) | null
  >(null);
  const previewMouseUpHandlerRef = React.useRef<(() => void) | null>(null);
  const previewTouchMoveHandlerRef = React.useRef<
    ((e: TouchEvent) => void) | null
  >(null);
  const previewTouchEndHandlerRef = React.useRef<(() => void) | null>(null);

  const startPreviewMouseDrag = (clientY: number) => {
    previewDraggingRef.current = true;
    previewStartYRef.current = clientY;
    previewStartHeightRef.current = numPreviewHeightPercent;

    const onMouseMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - previewStartYRef.current;
      // 假设 preview 容器高度约为 calc(100vh - 85px) = 约 915px（取整）
      // 但实际计算：deltaY / 视口高度 * 100 -> %
      const deltaPercent = (deltaY / (window.innerHeight - 85)) * 100;
      let newHeight = previewStartHeightRef.current + deltaPercent;
      if (newHeight < 20) newHeight = 20;
      if (newHeight > 70) newHeight = 70;
    fnSetPreviewHeightPercent(Number(newHeight.toFixed(1)));
    };

    const onMouseUp = () => {
      previewDraggingRef.current = false;
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

  const startPreviewTouchDrag = (clientY: number) => {
    previewDraggingRef.current = true;
    previewStartYRef.current = clientY;
    previewStartHeightRef.current = numPreviewHeightPercent;

    const onTouchMove = (ev: TouchEvent) => {
      const touch = ev.touches[0];
      if (!touch) return;
      const deltaY = touch.clientY - previewStartYRef.current;
      const deltaPercent = (deltaY / (window.innerHeight - 85)) * 100;
      let newHeight = previewStartHeightRef.current + deltaPercent;
      if (newHeight < 20) newHeight = 20;
      if (newHeight > 70) newHeight = 70;
    fnSetPreviewHeightPercent(Number(newHeight.toFixed(1)));
    };

    const onTouchEnd = () => {
      previewDraggingRef.current = false;
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

  // 滑块变化由 SidePanel 内部直接操作 store 的 similarityThreshold

  const handleSubmit = async () => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());

    const dbPath = await window.ElectronDB.getDbPath();

    const response = await fetch("http://127.0.0.1:8000/detect_images", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        similarity_threshold: numSimilarityThreshold,
        db_path: dbPath,
        show_disabled_photos: boolShowDisabledPhotos,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("检测任务已添加到队列:", data);
  fnSetServerPollingNeeded(true);
    } else {
      console.error("提交检测任务失败");
    }
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
