// "use client";

import { CustomSlider } from "@/components/CustomSlider";
import ImagePreview from "@/components/ImagePreview";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPhotosExtendByCriteria,
  getPhotosExtendByPhotos,
  initializeDatabase,
  updatePhotoEnabledStatus,
  PhotoExtend,
  Photo,
} from "@/lib/db";
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

import { PhotoGridEnhance } from "@/components/PhotoGrid";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import PhotoDetailsTable from "./PhotoFilterPage/PhotoDetailsTable";
import { cn } from "@/lib/utils";

interface ServerData {
  status: string;
  task_queue_length: number;
  workers: string[];
}

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

const PreviewPlaceholder: React.FC<{
  width?: string;
  height?: string;
}> = ({ width, height }) => {
  const { t } = useTranslation();

  const style: React.CSSProperties = {
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
  };

  return (
    <div
      style={style}
      className="border-muted-foreground/20 bg-muted/40 m-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center"
    >
      <div className="bg-muted mb-3 rounded-full p-3 shadow-sm">
        <ImageIcon className="text-muted-foreground/40 h-8 w-8" />
      </div>
      <p className="text-foreground text-sm font-medium">
        {t("filterPage.previewPlaceholderTitle") ||
          "Select a photo from the gallery to preview"}
      </p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs">
        {t("filterPage.previewPlaceholderDesc") ||
          "Click any thumbnail on the left to view details and toggle its enabled status."}
      </p>
    </div>
  );
};

export default function PhotoFilterSubpage() {
  const { t } = useTranslation();

  // 相册视图：二维数组，每个子数组是一组照片
  const [photos, setPhotos] = React.useState<Photo[][]>([]);
  // 服务端状态（简要字符串 + 完整数据）
  const [serverStatus, setServerStatus] = React.useState<string>(
    t("filterPage.serverStatusPrefix", {
      status: t("filterPage.serverStatusFetching"),
    }),
  );
  const [serverData, setServerData] = React.useState<ServerData | null>(null);

  // 右侧预览面板的数据
  const [preview_photos, setPreviewPhotos] = React.useState<PhotoExtend[]>([]);
  const [opt_panelTabValue, setPannelTabValue] = React.useState("filter");
  const [opt_galleryTabValue, setGalleryTabValue] = React.useState("group");

  // 轮询控制：检测任务进行中时为 true，空闲且超时后置 false
  const [bool_needUpdate, setUpdate] = React.useState<boolean>(true);
  const [float_similarityThreshold, setSimilarityThreshold] =
    React.useState<number>(() =>
      parseFloat(sessionStorage.getItem("similarityThreshold") || "0.8"),
    );

  const [bool_showDisabled, setShowDisabledPhotos] =
    React.useState<boolean>(false);
  const [opt_sortedColumn, setSortedColumn] = React.useState("IQA");
  const [bool_reloadAlbum, setReloadAlbum] = React.useState<boolean>(false);
  const [bool_isPreviewEnabled, setIsPreviewEnabled] =
    React.useState<boolean>(false);

  // 预览面板：当 preview_photos 变化时，同步当前预览图片的启用状态
  React.useEffect(() => {
    setIsPreviewEnabled(preview_photos[0]?.isEnabled ?? false);
  }, [preview_photos]);

  // 初始化数据库 & 记录本次提交时间
  React.useEffect(() => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());
    initializeDatabase();
  }, []);

  /**
   * 根据当前视图模式（分组/整体）、排序方式、是否隐藏弃用照片，拉取相册数据。
   * 使用 useCallback 保证给 setInterval 的永远是最新逻辑。
   */
  const fetchEnabledPhotos = React.useCallback(async () => {
    // console.log("galleryTabValue", opt_galleryTabValue);
    // console.log("showDisabledPhotos", bool_showDisabled);

    try {
      // group 模式：-1 表示“未分组/基础组”，total 模式：-2 表示“整体列表”
      const undefinedGroupPhotos: PhotoExtend[] =
        await getPhotosExtendByCriteria(
          opt_galleryTabValue === "group" ? -1 : -2,
          opt_sortedColumn,
          !bool_showDisabled,
        );

      let groupId = 0;
      let skippedGroup = 0;
      const groupedPhotos: { [key: number]: Photo[] } = {};

      // 先放入 undefinedGroup / total 列表作为第 0 组
      if (undefinedGroupPhotos.length > 0) {
        groupedPhotos[groupId] = undefinedGroupPhotos.map(
          (photo: PhotoExtend): Photo => ({
            fileName: photo.fileName,
            fileUrl: photo.fileUrl,
            filePath: photo.filePath,
            info: (photo.IQA ?? 0).toString(),
            isEnabled: photo.isEnabled ?? true,
          }),
        );
        groupId++;
      }

      // 只有在“分组模式下”才继续拉后续 groupId
      while (opt_galleryTabValue === "group") {
        const currentGroupPhotos: PhotoExtend[] =
          await getPhotosExtendByCriteria(
            groupId + skippedGroup,
            opt_sortedColumn,
            !bool_showDisabled,
          );
        if (currentGroupPhotos.length === 0) {
          if (skippedGroup < 20) {
            skippedGroup++;
            continue;
          } else {
            break;
          }
        }

        groupedPhotos[groupId] = currentGroupPhotos.map(
          (photo: PhotoExtend): Photo => ({
            fileName: photo.fileName,
            fileUrl: photo.fileUrl,
            filePath: photo.filePath,
            info: (photo.IQA ?? 0).toString(),
            isEnabled: photo.isEnabled ?? true,
          }),
        );

        groupId++;
      }

      setPhotos(Object.values(groupedPhotos));
      console.log("照片更新一次");
    } catch (error) {
      console.error("获取启用照片失败:", error);
    }
  }, [opt_galleryTabValue, opt_sortedColumn, bool_showDisabled]);

  /**
   * 拉取服务端状态
   */
  const fetchServerStatus = React.useCallback(async () => {
    console.log("更新状态标志 bool_needUpdate =", bool_needUpdate);
    try {
      const response = await fetch("http://localhost:8000/status");
      if (response.ok) {
        const data: ServerData = await response.json();
        setServerStatus(
          t("filterPage.serverStatusPrefix", {
            status: data.status || t("filterPage.unknownStatus"),
          }),
        );
        setServerData(data);

        const submitTime = sessionStorage.getItem("submitTime");
        if (submitTime) {
          const currentTime = Date.now();
          const timeDifference = (currentTime - parseInt(submitTime)) / 1000;

          // 提交 6 秒后，如果状态仍然是空闲，则 5 秒后停止轮询
          if (timeDifference > 2 && data.status === "空闲中") {
            setTimeout(() => {
              if (data.status === "空闲中") {
                setUpdate(false);
                fetchEnabledPhotos();
                console.log("[STATUS] Server idle, stopping updates.");
              } else {
                setUpdate(true);
              }
            }, 600);
          } else {
            setUpdate(true);
          }
        }
      } else {
        setServerStatus(
          t("filterPage.serverStatusPrefix", {
            status: t("filterPage.serverUnreachable"),
          }),
        );
      }
    } catch {
      setServerStatus(
        t("filterPage.serverStatusPrefix", {
          status: t("filterPage.serverRequestFailed"),
        }),
      );
    }
  }, [bool_needUpdate, t]);

  const handleSliderChange = (value: number) => {
    setSimilarityThreshold(value);
    sessionStorage.setItem("similarityThreshold", value.toString());
  };

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
        similarity_threshold: float_similarityThreshold,
        db_path: dbPath,
        show_disabled_photos: bool_showDisabled,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("检测任务已添加到队列:", data);
      setUpdate(true);
    } else {
      console.error("提交检测任务失败");
    }
  };

  const handleDisableRedundant = async () => {
    try {
      // 并行处理所有组：每组保留第 1 张，弃用后面所有
      await Promise.all(
        photos.map(async (group) => {
          const updates = group
            .slice(1)
            .map((photo) => updatePhotoEnabledStatus(photo.filePath, false));
          await Promise.all(updates);
        }),
      );
      setReloadAlbum(true);
    } catch (error) {
      console.error("禁用冗余照片失败:", error);
    }
  };

  const handleEnableAll = async () => {
    try {
      await Promise.all(
        photos
          .flat()
          .map((photo) => updatePhotoEnabledStatus(photo.filePath, true)),
      );
      setReloadAlbum(true);
    } catch (error) {
      console.error("启用所有照片失败:", error);
    }
  };

  // 组件卸载时简单清理预览数据
  React.useEffect(() => {
    return () => {
      setPreviewPhotos([]);
    };
  }, []);

  /**
   * 轮询相册数据：每 4 秒刷新一次，受 bool_needUpdate 控制
   */
  React.useEffect(() => {
    // 首次或依赖变化时，先拉一次
    fetchEnabledPhotos();

    const interval_photos = window.setInterval(() => {
      if (bool_needUpdate) {
        fetchEnabledPhotos();
      }
    }, 4000);

    return () => window.clearInterval(interval_photos);
  }, [bool_needUpdate, fetchEnabledPhotos]);

  /**
   * 显式触发相册刷新：
   */
  React.useEffect(() => {
    fetchEnabledPhotos();
    if (bool_reloadAlbum) {
      setReloadAlbum(false);
    }
  }, [
    bool_reloadAlbum,
    bool_showDisabled,
    opt_galleryTabValue,
    fetchEnabledPhotos,
  ]);

  /**
   * 轮询服务端状态：每 1 秒拉一次，受 bool_needUpdate 控制
   */
  React.useEffect(() => {
    fetchServerStatus();

    const interval_status = window.setInterval(() => {
      if (bool_needUpdate) {
        fetchServerStatus();
      }
    }, 500);

    return () => window.clearInterval(interval_status);
  }, [bool_needUpdate, fetchServerStatus]);

  const totalPhotoCount = photos.flat().length;

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/60 px-4 py-2 dark:bg-gray-900">
      {/* 顶层左右 65% / 35% 分栏布局 */}
      <div className="flex w-full flex-1 gap-4">
        {/* 左侧：主画廊（约 65% 宽度） */}
        <div className="order-1 max-w-[65%] min-w-[55%] basis-[65%]">
          <div className="bg-background/80 flex h-[calc(100vh-85px)] w-full flex-col space-y-4 rounded-xl p-3 shadow-sm">
            <Tabs
              id="gallery-pannel"
              value={opt_galleryTabValue}
              onValueChange={setGalleryTabValue}
              className="space-y-3"
            >
              {/* 顶部工具栏：模式切换 + 总数提示 */}
              <div className="flex items-center justify-between gap-3">
                <TabsList className="bg-muted/70 grid w-[280px] grid-cols-2">
                  <TabsTrigger
                    value="group"
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    {t("filterPage.galleryMode")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="total"
                    className="flex items-center gap-1.5 text-sm"
                  >
                    <Grid className="h-3.5 w-3.5" />
                    {t("filterPage.totalMode")}
                  </TabsTrigger>
                </TabsList>

                <div className="text-muted-foreground flex items-center gap-3 text-sm">
                  <div className="bg-muted flex items-center gap-1 rounded-full px-2 py-1">
                    <ImageIcon className="text-muted-foreground/80 h-3.5 w-3.5" />
                    <span className="font-sm">
                      {t("labels.totalPhotosLabel")}:
                    </span>
                    <span className="rounded-full bg-blue-50 px-1.5 font-mono text-[14px] text-blue-700">
                      {totalPhotoCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Scrollable Gallery：宽度随左侧 65% 容器自适应 */}
              <ScrollArea className="mx-auto h-[calc(100vh-220px)] w-full rounded-xl border bg-slate-50 p-3">
                {photos.map((group, index) => (
                  <React.Fragment key={index}>
                    {opt_galleryTabValue === "group" && (
                      <div className="mb-1 flex items-center gap-2 px-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        <span>
                          {t("filterPage.groupLabel") || "Group"} {index + 1}
                        </span>
                        <div className="h-px flex-1 bg-slate-200" />
                      </div>
                    )}

                    <PhotoGridEnhance
                      photos={group}
                      onPhotoClick={async (clickphotos, event) => {
                        if (event === "Select") {
                          // 异步获取扩展信息
                          const extended =
                            await getPhotosExtendByPhotos(clickphotos);
                          // console.log("选中了照片:", extended, clickphotos);

                          setPreviewPhotos(extended);
                          setPannelTabValue("preview");
                        } else if (event === "Change") {
                          // console.log("修改了照片:", clickphotos);

                          // 先更新启用状态（默认 undefined 按 true 处理）
                          await updatePhotoEnabledStatus(
                            clickphotos[0].filePath,
                            !(clickphotos[0].isEnabled ?? true),
                          );
                          setReloadAlbum(true);

                          // 再获取最新的扩展信息
                          const extended =
                            await getPhotosExtendByPhotos(clickphotos);
                          setPreviewPhotos(extended);
                          setPannelTabValue("preview");
                        }
                      }}
                      highlightPhotos={
                        preview_photos.length > 0
                          ? preview_photos.map((photo) => ({
                              fileName: photo.fileName,
                              fileUrl: photo.fileUrl,
                              filePath: photo.filePath,
                              info: photo.info ?? "",
                              isEnabled: photo.isEnabled ?? true,
                            }))
                          : []
                      }
                    />

                    {index < photos.length - 1 && (
                      <div className="my-3">
                        <Separator className="bg-slate-200" />
                      </div>
                    )}
                  </React.Fragment>
                ))}

                {photos.length === 0 && (
                  <div className="text-muted-foreground flex h-[calc(70vh-100px)] flex-col items-center justify-center text-center">
                    <div className="mb-3 rounded-full bg-white p-4 shadow-sm">
                      <ImageIcon className="h-8 w-8 opacity-30" />
                    </div>
                    <p className="text-sm font-medium">
                      {t("filterPage.noPhotosFoundTitle") || "No photos found"}
                    </p>
                    <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                      {t("filterPage.noPhotosFoundDesc") ||
                        "Try adjusting filters, importing more photos, or running a new detection task."}
                    </p>
                  </div>
                )}
              </ScrollArea>
            </Tabs>

            {/* 底部：提交任务 + 服务端状态 + 显示弃用开关 */}
            <div className="bg-background flex items-center justify-between rounded-lg border px-3 py-2 text-xs shadow-sm">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSubmit}
                  size="sm"
                  className="flex items-center gap-1.5 bg-blue-600 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  {serverData?.status !== "空闲中" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                  <span>{t("filterPage.submitTask")}</span>
                </Button>

                <ServerStatusMonitorDrawer
                  serverStatus={serverStatus}
                  serverData={serverData}
                />
              </div>

              <div className="bg-muted/80 text-muted-foreground flex items-center gap-2 rounded-md border px-2 py-1 text-[11px]">
                <Label
                  htmlFor="disabled-display"
                  className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-[11px] font-normal"
                >
                  {bool_showDisabled ? (
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
                  checked={bool_showDisabled}
                  onCheckedChange={setShowDisabledPhotos}
                  className="scale-90"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右侧：筛选 / 预览面板（约 35% 宽度） */}
        <div className="hidden max-w-[35%] basis-[35%] flex-col space-y-4 sm:flex md:order-2">
          <Tabs
            id="side-pannel"
            value={opt_panelTabValue}
            onValueChange={setPannelTabValue}
            className="bg-background/80 flex-1 rounded-xl p-3 shadow-sm"
          >
            <div className="mb-3 w-full">
              <TabsList className="bg-muted/70 grid grid-cols-2">
                <TabsTrigger
                  value="filter"
                  className="flex items-center gap-1.5 text-xs"
                >
                  <AlertCircle className="h-3.5 w-3.5" />
                  {t("filterPage.filterTab")}
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  className="flex items-center gap-1.5 text-xs"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                  {t("filterPage.previewTab")}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent
              value="filter"
              className="mt-0 border-0 bg-transparent p-0"
            >
              <div className="space-y-4">
                <CustomSlider
                  label={t("filterPage.similarityThresholdLabel")}
                  description={t("filterPage.similarityThresholdDesc")}
                  min={0}
                  max={1}
                  step={0.01}
                  value={float_similarityThreshold}
                  onChange={handleSliderChange}
                />

                <div className="flex justify-between gap-3">
                  <Button
                    onClick={handleDisableRedundant}
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-start gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("filterPage.disableRedundant")}
                  </Button>
                </div>
                <div className="flex justify-between gap-3">
                  <Button
                    onClick={handleEnableAll}
                    variant="outline"
                    size="sm"
                    className="flex-1 justify-start gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("filterPage.enableAll")}
                  </Button>
                </div>

                <div className="mt-3 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <p className="leading-relaxed whitespace-pre-wrap">
                      {t("filterPage.filterHint")}
                    </p>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent
              value="preview"
              className="mt-0 border-0 bg-transparent p-0"
            >
              {preview_photos.length > 0 ? (
                <div>
                  <ImagePreview
                    src={`local-resource://${preview_photos[0].filePath}`}
                    height={"calc((100vh - 200px) * 0.50)"} // 预览控件的高度
                  />
                  <div className="mt-4 space-y-1">
                    <PhotoDetailsTable
                      photo={preview_photos[0]}
                      isPreviewEnabled={bool_isPreviewEnabled}
                      setIsPreviewEnabled={setIsPreviewEnabled}
                      updatePhotoEnabledStatus={updatePhotoEnabledStatus}
                      setPhotos={setPhotos}
                      onPhotoStatusChanged={() => setReloadAlbum(true)}
                    />
                  </div>
                </div>
              ) : (
                <PreviewPlaceholder height={"calc((100vh - 180px))"} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
