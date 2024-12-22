// "use client";

import { CustomSlider } from "@/components/CustomSlider"; // 引入通用滑动条组件
import ImagePreview from "@/components/ImagePreview"; // 引入图片预览组件
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCaption, TableCell, TableRow } from "@/components/ui/table";
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
    const [serverStatus, setServerStatus] = React.useState<string>("正在获取服务端状态...");
    const [serverData, setServerData] = React.useState<any>(null); // Store the complete server response
    // const [enabledPhotos, setEnabledPhotos] = React.useState<PhotoExtend[]>([]);

    const [preview_photos, setPreviewPhotos] = React.useState<PhotoExtend[]>([]);
    const [panelTabValue, setPannelTabValue] = React.useState("filter");
    const [galleryTabValue, setGalleryTabValue] = React.useState("group");

    const [update, setUpdate] = React.useState<boolean>(false); // Flag to control server status updates
    const [similarityThreshold, setSimilarityThreshold] = React.useState(0.8);

    const [showDisabledPhotos, setShowDisabledPhotos] = React.useState<boolean>(false);
    const [sortedColumn, setSortedColumn] = React.useState("IQA");

    const [reloadAlbum, setReloadAlbum] = React.useState<boolean>(false);

    const [isPreviewEnabled, setIsPreviewEnabled] = React.useState(
        preview_photos[0]?.isEnabled || false
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
        try {
            // 获取未定义组(-1)的照片
            const undefinedGroupPhotos = await getPhotosExtendByCriteria(
                galleryTabValue === "group" ?- 1:-2,
                sortedColumn,
                !showDisabledPhotos
            );

            // 获取启用的照片，groupId从0开始遍历
            let groupId = 0;
            let skippedGroup = 0;
            let currentGroupPhotos = [];
            let groupedPhotos: { [key: number]: Photo[] } = {};

            // 1. 如果未定义组的照片不为空，将其作为一组
            if (undefinedGroupPhotos.length > 0) {
                groupedPhotos[groupId] = undefinedGroupPhotos.map((photo: PhotoExtend) => ({
                    fileName: photo.fileName,
                    fileUrl: photo.fileUrl,
                    filePath: photo.filePath,
                    info: (photo.IQA || 0).toString(), // Set IQA as info
                    isEnabled: photo.isEnabled,
                }));
                groupId++; // Move to the next group
            }

            // 2. 遍历从groupId=0开始的组，直到某个组为空
            while (true && galleryTabValue === "group") {
                currentGroupPhotos = await getPhotosExtendByCriteria(
                    groupId + skippedGroup,
                    sortedColumn,
                    !showDisabledPhotos
                );
                if (currentGroupPhotos.length === 0) {
                    if (skippedGroup < 20) {
                        skippedGroup++;
                        continue; // Skip the empty group
                    } else {
                        break; // If a group is empty, stop the loop
                    }
                }


                // 将照片转换为新的格式，并加入到groupedPhotos
                groupedPhotos[groupId] = currentGroupPhotos.map((photo: PhotoExtend) => ({
                    fileName: photo.fileName,
                    fileUrl: photo.fileUrl,
                    filePath: photo.filePath,
                    info: (photo.IQA || 0).toString(), // Set IQA as info
                    isEnabled: photo.isEnabled,
                }));

                groupId++; // Move to the next group
            }

            // 4. 结果是按groupId分组的照片，sortedGroups是一个二维数组
            const sortedGroups = Object.values(groupedPhotos);

            setPhotos(sortedGroups); // Set the sorted groups
            console.log("照片更新一次", update);
        } catch (error) {
            console.error("获取启用照片失败:", error);
        }
    };

    // Fetch server status
    const fetchServerStatus = async () => {
        console.log("更新状态", update);
        try {
            const response = await fetch("http://localhost:8000/status");
            if (response.ok) {
                const data = await response.json();
                setServerStatus(`服务端状态: ${data.status || "未知状态"}`);
                setServerData(data); // Save complete data

                // Get submit time from sessionStorage
                const submitTime = sessionStorage.getItem("submitTime");
                if (submitTime) {
                    const currentTime = Date.now();
                    const timeDifference = (currentTime - parseInt(submitTime)) / 1000; // in seconds

                    if (timeDifference > 6 && data.status === "空闲中") {
                        setTimeout(() => {
                            if (data.status === "空闲中") {
                                setUpdate(false); // Stop updates if still idle after 8 seconds
                                console.log("停止更新");
                            }
                        }, 5000); // Wait for 8 seconds
                    }
                }
            } else {
                setServerStatus("服务端状态: 无法连接");
            }
        } catch (error) {
            setServerStatus("服务端状态: 请求失败");
        }
    };

    const handleSliderChange = (value: React.SetStateAction<number>) => {
        setSimilarityThreshold(value);
    };

    const handleSubmit = async () => {
        // Store current time in sessionStorage when submit is clicked
        const currentTime = Date.now();
        sessionStorage.setItem("submitTime", currentTime.toString());

        // Send the POST request to submit the task
        const response = await fetch("http://127.0.0.1:8000/detect_images", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                similarity_threshold: similarityThreshold,
            }),
        });

        if (response.ok) {
            const data = await response.json();
            console.log("检测任务已添加到队列:", data);

            // Set the update flag to true after submit
            setUpdate(true);
        } else {
            console.error("提交检测任务失败");
        }
    };

    // 定时轮询获取启用的照片并根据分组进行排序
    React.useEffect(() => {
        // 每隔 5 秒获取一次启用照片
        fetchEnabledPhotos();
        const interval_photos = setInterval(() => {
            if (update) {
                fetchEnabledPhotos();
            }
        }, 4000);

        // 在组件卸载时清除定时器
        return () => clearInterval(interval_photos);
    }, [update]);

    // 定时轮询获取启用的照片并根据分组进行排序
    React.useEffect(() => {
        fetchEnabledPhotos();
        if (reloadAlbum) {
            setReloadAlbum(false);
        }
    }, [reloadAlbum, showDisabledPhotos, isPreviewEnabled, galleryTabValue]);

    React.useEffect(() => {
        // 每隔 5 秒获取一次启用照片
        fetchServerStatus();
        const interval_status = setInterval(() => {
            if (update) {
                fetchServerStatus();
            }
        }, 1000);

        return () => clearInterval(interval_status); // Clean up interval
    }, [update]);

    return (
        <div className="min-h-screen p-4">
            <div className="flex gap-6">
                <div className="md:order-1">
                    <div className="flex h-[85vh] max-w-[70vw] flex-col space-y-4">
                        {/* <Textarea
                                        placeholder="Write a tagline for an ice cream shop"
                                        className="min-h-[100px] flex-1 p-4 md:min-h-[100px] lg:min-h-[700px]"
                                    /> */}
                        {/* 渲染分组照片并添加分割线 */}
                        <Tabs id="gallery-pannel" defaultValue="group" value={galleryTabValue}>
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
                            <ScrollArea className="mx-auto h-[80vh] max-h-[80vh] min-h-[60vh] max-w-[70vw] rounded-md border p-4">
                                {photos.map((group, index) => (
                                    <React.Fragment key={index}>
                                        <PhotoGridEnhance
                                            photos={group}
                                            onPhotoClick={async (clickphotos, event) => {
                                                // console.log("点击了照片:", clickphotos);
                                                if (event === "Select") {
                                                    setPreviewPhotos(
                                                        getPhotosExtendByPhotos(clickphotos)
                                                    );
                                                    // console.log(
                                                    //     "点击了照片:",
                                                    //     getPhotosExtendByPhotos(clickphotos)
                                                    // );
                                                    // setReloadAlbum(true);

                                                    setPannelTabValue("preview"); // 设置 Tabs 的值为 preview
                                                } else if (event === "Change") {
                                                    console.log("修改了照片:", clickphotos);
                                                    getPhotosExtendByPhotos(clickphotos);
                                                    await updatePhotoEnabledStatus(
                                                        clickphotos[0].filePath,
                                                        !clickphotos[0].isEnabled
                                                    );
                                                    setReloadAlbum(true);

                                                    setPreviewPhotos(
                                                        getPhotosExtendByPhotos(clickphotos)
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
                                            <Separator className="mb-2 mt-2" />
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
                                                        <Progress
                                                            value={parseFloat(workerStatus)}
                                                        />
                                                    </div>
                                                )
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
                        value={panelTabValue}
                        className="flex-1"
                    >
                        <div className="min-w-[25vw]">
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
                            <div className="mt-4 grid gap-2">
                                <HoverCard openDelay={200}>
                                    <HoverCardTrigger asChild>
                                        <span className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                            模式
                                        </span>
                                    </HoverCardTrigger>
                                    <HoverCardContent className="w-[320px] text-sm" side="left">
                                        选择最适合您任务的界面。您可以提供：一个简单的提示来完成，起始和结束文本以插入完成内容，或一些带有编辑指令的文本。
                                    </HoverCardContent>
                                </HoverCard>
                            </div>
                            <CustomSlider
                                label="相似度阈值"
                                description="调整图像检测的相似度阈值。值越高，表示相似度标准越严格。"
                                min={0}
                                max={1}
                                step={0.01}
                                defaultValue={0.8}
                                onChange={handleSliderChange}
                            />
                        </TabsContent>
                        <TabsContent value="preview" className="mt-0 border-0 p-0">
                            {preview_photos.length > 0 && (
                                <div className="p-4">
                                    {/* <img
                                        id="preview-image"
                                        src={`local-resource://${preview_photo.filePath}`}
                                        style={{ width: "500px" }}
                                    /> */}

                                    <ImagePreview
                                        src={`local-resource://${preview_photos[0].filePath}`}
                                        width={"30vw"} // 预览控件的宽度
                                        height={"40vh"} // 预览控件的高度
                                    />
                                    <div className="mt-4 space-y-1">
                                        <Table>
                                            <TableCaption>Preview Photo Details</TableCaption>
                                            <TableBody>
                                                <TableRow>
                                                    <TableCell className="font-medium">
                                                        文件名
                                                    </TableCell>
                                                    <TableCell>
                                                        {preview_photos[0].fileName}
                                                    </TableCell>
                                                </TableRow>
                                                <TableRow>
                                                    <TableCell className="font-medium">
                                                        文件路径
                                                    </TableCell>
                                                    <TableCell>
                                                        {preview_photos[0].filePath}
                                                    </TableCell>
                                                </TableRow>
                                                {preview_photos[0].fileSize && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            文件大小
                                                        </TableCell>
                                                        <TableCell>
                                                            {preview_photos[0].fileSize >= 1048576
                                                                ? (
                                                                      preview_photos[0].fileSize /
                                                                      1048576
                                                                  ).toFixed(2) + " MB"
                                                                : preview_photos[0].fileSize >= 1024
                                                                  ? (
                                                                        preview_photos[0].fileSize /
                                                                        1024
                                                                    ).toFixed(2) + " KB"
                                                                  : preview_photos[0].fileSize +
                                                                    " B"}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {preview_photos[0].info && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            信息
                                                        </TableCell>
                                                        <TableCell>
                                                            {preview_photos[0].info}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {preview_photos[0].date && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            日期
                                                        </TableCell>
                                                        <TableCell>
                                                            {preview_photos[0].date}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {preview_photos[0].groupId !== undefined && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            分组编号
                                                        </TableCell>
                                                        <TableCell>
                                                            {preview_photos[0].groupId}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {preview_photos[0].similarity !== undefined && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            相似度
                                                        </TableCell>
                                                        <TableCell>
                                                            {preview_photos[0].similarity}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {preview_photos[0].IQA !== undefined && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            IQA
                                                        </TableCell>
                                                        <TableCell>
                                                            {preview_photos[0].IQA}
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                                {preview_photos[0].isEnabled !== undefined && (
                                                    <TableRow>
                                                        <TableCell className="font-medium">
                                                            是否启用
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex items-center gap-2">
                                                                <Switch
                                                                    key={
                                                                        preview_photos[0].isEnabled
                                                                            ? "enabled"
                                                                            : "disabled"
                                                                    }
                                                                    id="disabled-display"
                                                                    checked={isPreviewEnabled}
                                                                    onClick={async (value) => {
                                                                        await updatePhotoEnabledStatus(
                                                                            preview_photos[0]
                                                                                .filePath,
                                                                            !isPreviewEnabled
                                                                        );

                                                                        setPhotos((prevPhotos) =>
                                                                            prevPhotos.map(
                                                                                (group) =>
                                                                                    group.map(
                                                                                        (photo) =>
                                                                                            photo.filePath ===
                                                                                            preview_photos[0]
                                                                                                .filePath
                                                                                                ? {
                                                                                                      ...photo,
                                                                                                      isEnabled:
                                                                                                          !isPreviewEnabled,
                                                                                                  }
                                                                                                : photo
                                                                                    )
                                                                            )
                                                                        );
                                                                        preview_photos[0].isEnabled =
                                                                            !isPreviewEnabled;
                                                                    }}
                                                                />

                                                                <Label htmlFor="disabled-display">
                                                                    {preview_photos[0].isEnabled
                                                                        ? "启用"
                                                                        : "弃用"}
                                                                </Label>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                )}
                                            </TableBody>
                                        </Table>
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
