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
import { useTranslation } from "react-i18next";

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
    const { t } = useTranslation();
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
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {copyInProgress ? t("status.exportingPhotos") : t("status.exportComplete")}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {copyInProgress
                                ? t("status.exportInProgress")
                                : t("status.exportSuccess")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {copyInProgress && (
                        <div className="mt-4 flex items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-gray-900"></div>
                        </div>
                    )}
                    {copyInProgress ? (
                        <></>
                    ) : (
                        <AlertDialogFooter>
                            <AlertDialogCancel>{t("buttons.close")}</AlertDialogCancel>
                        </AlertDialogFooter>
                    )}
                </AlertDialogContent>

                <div className="mb-4 flex justify-between items-center space-x-4">
                    <div className="text-right">{t("labels.totalPhotos")}: {photos.length}</div>

                    <AlertDialogTrigger asChild>
                        <Button variant="outline" onClick={submitPhotosCopy}>
                            {t("buttons.exportPhotos")}
                        </Button>
                    </AlertDialogTrigger>

                    <Input
                        type="text"
                        placeholder={t("placeholders.folderPath")}
                        value={folderName}
                        onChange={handleFolderChange}
                        className="mb-4"
                    />
                </div>
            </AlertDialog>

            <ScrollArea className="mx-auto h-[80vh] max-h-[80vh] min-h-[60vh] min-w-[85vw] max-w-[100vw] rounded-md border p-2">
                <PhotoGridEnhance photos={photos} />
            </ScrollArea>
        </div>
    );
}
