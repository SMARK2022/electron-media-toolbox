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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getPhotosExtendByCriteria,
  initializeDatabase,
  PhotoExtend,
  Photo,
} from "@/lib/db";
import { copyPhotos, folderExists } from "@/lib/system";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";

export default function PhotoExportSubpage() {
  const { t } = useTranslation();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [folderName, setFolderName] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [copyInProgress, setCopyInProgress] = useState<boolean>(false);
  const [folderExistsStatus, setFolderExistsStatus] = useState<boolean | null>(
    null,
  );

  const handleFolderChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const inputPath = event.target.value;
    const normalizedPath = inputPath.replace(/\\/g, "/");
    setFolderName(normalizedPath);

    // Check if the folder exists
    const exists = await folderExists(normalizedPath);
    setFolderExistsStatus(exists);
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
        true,
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
              {copyInProgress
                ? t("status.exportingPhotos")
                : t("status.exportComplete")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {copyInProgress
                ? t("status.exportInProgress")
                : t("status.exportSuccess")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {copyInProgress && (
            <div className="mt-4 flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-gray-900"></div>
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

        <div className="mb-4 flex items-center justify-between space-x-4">
          <div className="text-right">
            {t("labels.totalPhotos")}: {photos.length}
          </div>

          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              onClick={submitPhotosCopy}
              disabled={!folderName}
            >
              {t("buttons.exportPhotos")}
            </Button>
          </AlertDialogTrigger>

          <div className="flex flex-grow items-center space-x-2">
            <Input
              type="text"
              placeholder={t("placeholders.folderPath")}
              value={folderName}
              onChange={handleFolderChange}
              className="flex-grow"
            />
            <Button
              variant="outline"
              className="w-35 max-w-[140px] min-w-[140px] underline"
            >
              <span
                className={`h-3 w-3 rounded-full ${
                  folderExistsStatus ? "bg-green-500" : "bg-red-500"
                }`}
              ></span>
              {folderExistsStatus ? "文件夹存在" : "文件夹不存在"}
            </Button>
          </div>
        </div>
      </AlertDialog>

      <ScrollArea className="mx-auto h-[calc(100vh-180px)] min-h-[60vh] max-w-[100vw] min-w-[85vw] rounded-md border p-2">
        <PhotoGridEnhance photos={photos} />
      </ScrollArea>
    </div>
  );
}
