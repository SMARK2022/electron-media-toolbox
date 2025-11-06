// "use client";

import { CustomSlider } from "@/components/CustomSlider"; // 引入通用滑动条组件
import ImagePreview from "@/components/ImagePreview"; // 引入图片预览组件
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPhotosExtendByCriteria,
  getPhotosExtendByPhotos,
  initializeDatabase,
  updatePhotoEnabledStatus,
} from "@/lib/db"; // getEnabledPhotosExtend 用于获取启用的照片
import * as React from "react";

import { PhotoGridEnhance } from "@/components/PhotoGrid"; // Import PhotoGrid
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"; // 引入 Drawer 组件
import { Progress } from "@/components/ui/progress"; // 引入进度条
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator"; // 引入分割线
import PhotoDetailsTable from "./PhotoDetailsTable"; // Import the new component

interface PhotoExtend {
  fileName: string;
  fileUrl: string;
  filePath: string;
  fileSize?: number;
  info?: string;
  date?: string;
  groupId?: number;
  simRefPath?: string;
  similarity?: number;
  IQA?: number;
  isEnabled: boolean;
}

interface Photo {
  fileName: string;
  fileUrl: string;
  filePath: string;
  info: string;
  isEnabled: boolean;
}

export default function PhotoFilterSubpage() {
  const [photos, setPhotos] = React.useState<Photo[][]>([]); // 2D array of Photo type
  const [serverStatus, setServerStatus] =
    React.useState<string>("正在获取服务端状态...");
  interface ServerData {
    status: string;
    task_queue_length: number;
    workers: string[];
  }

  const [serverData, setServerData] = React.useState<ServerData | null>(null); // Store the complete server response

  const [preview_photos, setPreviewPhotos] = React.useState<PhotoExtend[]>([]);
  const [opt_panelTabValue, setPannelTabValue] = React.useState("filter");
  const [opt_galleryTabValue, setGalleryTabValue] = React.useState("group");

  const [bool_needUpdate, setUpdate] = React.useState<boolean>(true); // Flag to control server status updates
  const [float_similarityThreshold, setSimilarityThreshold] = React.useState<number>(
    () => {
      // Retrieve the initial value from session storage or default to 0.8
      return parseFloat(sessionStorage.getItem("similarityThreshold") || "0.8");
    },
  );

  const [bool_showDisabled, setShowDisabledPhotos] =
    React.useState<boolean>(false);
  const [opt_sortedColumn, setSortedColumn] = React.useState("IQA");

  const [bool_reloadAlbum, setReloadAlbum] = React.useState<boolean>(false);

  const [bool_isPreviewEnabled, setIsPreviewEnabled] = React.useState(
    preview_photos[0]?.isEnabled || false,
  );

  React.useEffect(() => {
    setIsPreviewEnabled(preview_photos[0]?.isEnabled || false);
  }, [preview_photos[0]?.isEnabled]);

  // Initialize database and load data
  React.useEffect(() => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());
    // setUpdate(true);

    initializeDatabase();
  }, []);
  const fetchEnabledPhotos = async () => {
    console.log("galleryTabValue", opt_galleryTabValue);
    console.log("showDisabledPhotos", bool_showDisabled);
    try {
      const undefinedGroupPhotos = await getPhotosExtendByCriteria(
        opt_galleryTabValue === "group" ? -1 : -2,
        opt_sortedColumn,
        !bool_showDisabled,
      );

      let groupId = 0;
      let skippedGroup = 0;
      const groupedPhotos: { [key: number]: Photo[] } = {};

      if (undefinedGroupPhotos.length > 0) {
        groupedPhotos[groupId] = undefinedGroupPhotos.map(
          (photo: PhotoExtend) => ({
            fileName: photo.fileName,
            fileUrl: photo.fileUrl,
            filePath: photo.filePath,
            info: (photo.IQA || 0).toString(),
            isEnabled: photo.isEnabled,
          }),
        );
        groupId++;
      }

      while (opt_galleryTabValue === "group") {
        const currentGroupPhotos = await getPhotosExtendByCriteria(
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
          (photo: PhotoExtend) => ({
            fileName: photo.fileName,
            fileUrl: photo.fileUrl,
            filePath: photo.filePath,
            info: (photo.IQA || 0).toString(),
            isEnabled: photo.isEnabled,
          }),
        );

        groupId++;
      }

      setPhotos(Object.values(groupedPhotos));
      console.log("照片更新一次", bool_needUpdate);
    } catch (error) {
      console.error("获取启用照片失败:", error);
    }
  };

  const fetchServerStatus = async () => {
    console.log("更新状态", bool_needUpdate);
    try {
      const response = await fetch("http://localhost:8000/status");
      if (response.ok) {
        const data = await response.json();
        setServerStatus(`服务端状态: ${data.status || "未知状态"}`);
        setServerData(data);

        const submitTime = sessionStorage.getItem("submitTime");
        if (submitTime) {
          const currentTime = Date.now();
          const timeDifference = (currentTime - parseInt(submitTime)) / 1000;

          if (timeDifference > 6 && data.status === "空闲中") {
            setTimeout(() => {
              if (data.status === "空闲中") {
                setUpdate(false);
                console.log("停止更新");
              }
            }, 5000);
          }
        }
      } else {
        setServerStatus("服务端状态: 无法连接");
      }
    } catch {
      setServerStatus("服务端状态: 请求失败");
    }
  };

  const handleSliderChange = (value: number) => {
    setSimilarityThreshold(value);
    sessionStorage.setItem("similarityThreshold", value.toString()); // Store value in session storage
  };

  const handleSubmit = async () => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());

    // Get the database path from the Electron API
    const dbPath = await window.ElectronDB.getDbPath();

    const response = await fetch("http://127.0.0.1:8000/detect_images", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        similarity_threshold: float_similarityThreshold,
        db_path: dbPath, // Include the database path in the request
        show_disabled_photos: bool_showDisabled, // Include the showDisabledPhotos parameter
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
      // 并行处理所有组
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

  // 添加组件卸载时的清理
  React.useEffect(() => {
    return () => {
      // 清理预览图片内存
      setPreviewPhotos([]);
      // 取消所有进行中的请求
      const controller = new AbortController();
      controller.abort();
    };
  }, []);

  React.useEffect(() => {
    fetchEnabledPhotos();
    const interval_photos = setInterval(() => {
      if (bool_needUpdate) {
        fetchEnabledPhotos();
      }
    }, 4000);

    return () => clearInterval(interval_photos);
  }, [bool_needUpdate]);

  React.useEffect(() => {
    fetchEnabledPhotos();
    if (bool_reloadAlbum) {
      setReloadAlbum(false);
    }
  }, [bool_reloadAlbum, bool_showDisabled, bool_isPreviewEnabled, opt_galleryTabValue]);

  React.useEffect(() => {
    fetchServerStatus();
    const interval_status = setInterval(() => {
      if (bool_needUpdate) {
        fetchServerStatus();
      }
    }, 1000);

    return () => clearInterval(interval_status);
  }, [bool_needUpdate]);

  return (
    <div className="min-h-screen p-4">
      <div className="flex gap-6">
        <div className="md:order-1">
          <div className="flex h-[85vh] max-w-[70vw] min-w-[50vw] flex-col space-y-4">
            <Tabs
              id="gallery-pannel"
              defaultValue="group"
              value={opt_galleryTabValue}
            >
              <TabsList className="grid grid-cols-2">
                <TabsTrigger
                  value="group"
                  onClick={() => {
                    setGalleryTabValue("group");
                  }}
                >
                  <span className="sr-only">分组模式</span>
                  分组模式
                </TabsTrigger>
                <TabsTrigger
                  value="total"
                  onClick={() => {
                    setGalleryTabValue("total");
                  }}
                >
                  <span className="sr-only">整体模式</span>
                  整体模式
                </TabsTrigger>
              </TabsList>
              <ScrollArea className="mx-auto h-[calc(100vh-200px)] max-w-[calc((100vw-10px)*0.6)] min-w-[calc((100vw-10px)*0.6)] rounded-md border p-4">
                {photos.map((group, index) => (
                  <React.Fragment key={index}>
                    <PhotoGridEnhance
                      photos={group}
                      onPhotoClick={async (clickphotos, event) => {
                        // console.log("点击了照片:", clickphotos);
                        if (event === "Select") {
                          setPreviewPhotos(
                            getPhotosExtendByPhotos(clickphotos),
                          );

                          setPannelTabValue("preview"); // 设置 Tabs 的值为 preview
                        } else if (event === "Change") {
                          console.log("修改了照片:", clickphotos);
                          getPhotosExtendByPhotos(clickphotos);
                          await updatePhotoEnabledStatus(
                            clickphotos[0].filePath,
                            !clickphotos[0].isEnabled,
                          );
                          setReloadAlbum(true);

                          setPreviewPhotos(
                            getPhotosExtendByPhotos(clickphotos),
                          );
                          setPannelTabValue("preview"); // 设置 Tabs 的值为 preview
                        }
                      }}
                      highlightPhotos={
                        preview_photos.length > 0
                          ? preview_photos.map((photo) => ({
                              fileName: photo.fileName,
                              fileUrl: photo.fileUrl,
                              filePath: photo.filePath,
                              info: photo.info || "",
                              isEnabled: photo.isEnabled,
                            }))
                          : []
                      }
                    />
                    {index < photos.length - 1 && (
                      <Separator className="mt-2 mb-2" />
                    )}
                    {/* Add separator after each group */}
                  </React.Fragment>
                ))}
              </ScrollArea>
            </Tabs>
            <div className="flex items-center justify-between space-x-2">
              <div className="flex items-center space-x-2">
                <Button onClick={handleSubmit}>提交任务</Button>
                {/* 使用 Drawer 显示详细的服务端状态 */}
                <Drawer>
                  <DrawerTrigger>{serverStatus}</DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>服务端状态</DrawerTitle>
                      <DrawerDescription>
                        当前任务队列长度:{" "}
                        {serverData?.task_queue_length || "无"}
                      </DrawerDescription>
                    </DrawerHeader>
                    <div className="space-y-4">
                      {/* 展示每个 worker 的进度 */}
                      {serverData?.workers?.map(
                        (workerStatus: string, index: number) => (
                          <div key={index} className="mx-auto w-1/4">
                            <div className="flex justify-between">
                              <span>Worker {index + 1}</span>
                              <span>{workerStatus}</span>
                            </div>
                            <Progress value={parseFloat(workerStatus)} />
                          </div>
                        ),
                      )}
                    </div>
                    <DrawerFooter>
                      <DrawerClose>
                        <Button variant="outline">关闭</Button>
                      </DrawerClose>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              </div>
              <div className="flex items-center justify-between space-x-2">
                <Switch
                  id="disabled-display"
                  onCheckedChange={setShowDisabledPhotos}
                />
                <Label htmlFor="airplane-mode">显示弃用照片</Label>
              </div>
            </div>
          </div>
        </div>
        <div className="hidden h-[90vh] max-w-[35vw] flex-col space-y-4 sm:flex md:order-2">
          <Tabs
            id="side-pannel"
            defaultValue="filter"
            value={opt_panelTabValue}
            className="flex-1"
          >
            <div className="min-w-[35vw]">
              <TabsList className="grid grid-cols-2">
                <TabsTrigger
                  value="filter"
                  onClick={() => {
                    setPannelTabValue("filter");
                  }}
                >
                  <span className="sr-only">筛选</span>
                  筛选
                </TabsTrigger>
                <TabsTrigger
                  value="preview"
                  onClick={() => {
                    setPannelTabValue("preview");
                  }}
                >
                  <span className="sr-only">预览</span>
                  预览
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="filter" className="mt-0 border-0 p-0">
              <div className="mb-4">
                <CustomSlider
                  label="相似度阈值"
                  description="调整图像检测的相似度阈值。值越高，表示相似度标准越严格。"
                  min={0}
                  max={1}
                  step={0.01}
                  value={float_similarityThreshold}
                  onChange={handleSliderChange}
                />
              </div>
              <div className="flex justify-between">
                <Button onClick={handleDisableRedundant}>弃用冗余</Button>
                <Button onClick={handleEnableAll}>启用所有</Button>
              </div>
            </TabsContent>
            <TabsContent value="preview" className="mt-0 border-0 p-0">
              {preview_photos.length > 0 && (
                <div className="p-4">
                  <ImagePreview
                    src={`local-resource://${preview_photos[0].filePath}`}
                    width={"33vw"} // 预览控件的宽度
                    height={"calc((100vh - 200px) * 0.50)"} // 预览控件的高度
                  />
                  <div className="mt-4 space-y-1">
                    <PhotoDetailsTable
                      photo={preview_photos[0]}
                      isPreviewEnabled={bool_isPreviewEnabled}
                      setIsPreviewEnabled={setIsPreviewEnabled}
                      updatePhotoEnabledStatus={updatePhotoEnabledStatus}
                      setPhotos={setPhotos}
                    />
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
  
}
