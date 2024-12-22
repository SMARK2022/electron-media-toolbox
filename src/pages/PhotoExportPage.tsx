// "use client";

import { PhotoGridEnhance } from "@/components/PhotoGrid";
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPhotosExtendByCriteria, initializeDatabase } from "@/lib/db";
import { copyPhotos } from "@/lib/system";
import React from "react";

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

export default function PhotoExportSubpage() {
    const [photos, setPhotos] = React.useState<Photo[]>([]);
    const [folderName, setFolderName] = React.useState<string>("");
    const [isDialogOpen, setIsDialogOpen] = React.useState<boolean>(false);
    const [copyInProgress, setCopyInProgress] = React.useState<boolean>(false);

    const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const inputPath = event.target.value;
        const normalizedPath = inputPath.replace(/\\/g, "/");
        setFolderName(normalizedPath);
    };

    const submitPhotosCopy = async () => {
        setIsDialogOpen(true);
        setCopyInProgress(true);
        await copyPhotos(photos, folderName);
        setCopyInProgress(false);
    };

    const fetchEnabledPhotos = async () => {
        try {
            const undefinedGroupPhotos = await getPhotosExtendByCriteria(
                -2,
                "IQA",
                true
            );

            let groupedPhotos: Photo[] = [];

            if (undefinedGroupPhotos.length > 0) {
                groupedPhotos = undefinedGroupPhotos.map((photo: PhotoExtend) => ({
                    fileName: photo.fileName,
                    fileUrl: photo.fileUrl,
                    filePath: photo.filePath,
                    info: (photo.IQA || 0).toString(),
                    isEnabled: photo.isEnabled,
                }));
            }

            const sortedGroups = Object.values(groupedPhotos);

            setPhotos(sortedGroups);
        } catch (error) {
            console.error("获取启用照片失败:", error);
        }
    };


    React.useEffect(() => {
        const currentTime = Date.now();
        sessionStorage.setItem("submitTime", currentTime.toString());
        initializeDatabase();
        fetchEnabledPhotos();
    }, []);


    return (
        <div className="min-h-screen p-4">
            <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <AlertDialogTrigger asChild>
                    <Button variant="outline">Show Dialog</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {copyInProgress ? "正在导出照片" : "导出完成"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {copyInProgress
                                ? "程序正在保存中，将会耗时较长未响应，请耐心等待。"
                                : "照片已成功导出！"}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {copyInProgress && (
                        <div className="mt-4 flex items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-gray-900"></div>
                        </div>
                    )}
                    {copyInProgress ? (<></>
                    ) : (
                        <AlertDialogFooter>
                            <AlertDialogCancel>关闭</AlertDialogCancel>
                        </AlertDialogFooter>
                    )}
                </AlertDialogContent>
            </AlertDialog>

            <div className="mb-4 flex justify-between">
                <div className="text-right">总张数: {photos.length}</div>

                <Button variant="outline" onClick={submitPhotosCopy}>
                    导出照片
                </Button>

                <Input
                    type="text"
                    placeholder="输入文件夹路径"
                    value={folderName}
                    onChange={handleFolderChange}
                    className="mb-4"
                />
            </div>
            <ScrollArea className="mx-auto h-[80vh] max-h-[80vh] min-h-[60vh] min-w-[85vw] max-w-[100vw] rounded-md border p-2">
                <PhotoGridEnhance photos={photos} />
            </ScrollArea>
        </div>
    );
}
