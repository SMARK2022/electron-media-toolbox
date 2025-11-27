// "use client";

import React, { useState, useEffect } from "react";
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
  PhotoExtend,
  Photo,
} from "@/helpers/ipc/database/db";
import { copyPhotos, folderExists } from "@/lib/system";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Save, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { usePhotoFilterStore } from "@/helpers/store/usePhotoFilterStore";

export default function PhotoExportSubpage() {
  const { t } = useTranslation();
  const photos = usePhotoFilterStore((s) => s.lstAllPhotos);
  const fnSetAllPhotos = usePhotoFilterStore((s) => s.fnSetAllPhotos);
  const fnSetCurrentPage = usePhotoFilterStore((s) => s.fnSetCurrentPage);
  const [folderName, setFolderName] = useState<string>("");
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [copyInProgress, setCopyInProgress] = useState<boolean>(false);
  const [folderExistsStatus, setFolderExistsStatus] = useState<boolean | null>(null);

  const handleFolderChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const normalizedPath = event.target.value.replace(/\\/g, "/").trim();
    setFolderName(normalizedPath);
    setFolderExistsStatus(normalizedPath ? await folderExists(normalizedPath) : null);
  };

  const submitPhotosCopy = async () => {
    if (!folderName || photos.length === 0) return;
    setIsDialogOpen(true);
    setCopyInProgress(true);
    try {
      await copyPhotos(photos, folderName);
    } finally {
      setCopyInProgress(false);
    }
  };

  // 获取启用照片用于导出
  const fetchEnabledPhotos = async () => {
    try {
      const photos = await getPhotosExtendByCriteria(-2, "IQA", true);
      fnSetAllPhotos(
        photos.map((p: PhotoExtend) => ({
          fileName: p.fileName,
          fileUrl: p.fileUrl,
          filePath: p.filePath,
          info: (p.IQA || 0).toString(),
          isEnabled: p.isEnabled,
        })),
      );
    } catch (error) {
      console.error("获取启用照片失败:", error);
      fnSetAllPhotos([]);
    }
  };

  useEffect(() => {
    fnSetCurrentPage("export");
    void fetchEnabledPhotos();
  }, [fnSetCurrentPage]);

  const isExportDisabled = !folderName || photos.length === 0;

  return (
    <div className="bg-background flex min-h-screen flex-col bg-slate-50/60 p-4 px-4 py-2 dark:bg-gray-900">
      <AlertDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!copyInProgress) setIsDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="items-center text-center">
            <div
              className={cn(
                "mb-3 flex h-10 w-10 items-center justify-center rounded-full",
                copyInProgress
                  ? "bg-primary/10 text-primary"
                  : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300",
              )}
            >
              {copyInProgress ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
            </div>
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

          {!copyInProgress && (
            <AlertDialogFooter className="sm:justify-center">
              <AlertDialogCancel className="min-w-[120px]">
                {t("buttons.close")}
              </AlertDialogCancel>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>

        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="bg-muted inline-flex items-center rounded-full px-3 py-1 text-xs font-medium">
            <span className="text-muted-foreground">
              {t("labels.totalPhotos")}
            </span>
            <span className="ml-1 text-sm font-semibold text-blue-600 dark:text-blue-400">
              {photos.length}
            </span>
          </div>
          {/* 右侧：总数 + 导出按钮 */}
          <div className="flex items-center gap-3">
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                onClick={submitPhotosCopy}
                disabled={isExportDisabled}
                className="inline-flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                {t("buttons.exportPhotos")}
              </Button>
            </AlertDialogTrigger>
          </div>
          {/* 左侧：路径输入 + 校验状态 */}
          <div className="flex flex-1 items-center gap-2">
            <Input
              type="text"
              placeholder={t("exportPage.folderPathPlaceholder")}
              value={folderName}
              onChange={handleFolderChange}
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              className="flex w-36 min-w-[140px] items-center justify-center gap-2 text-xs"
            >
              {folderExistsStatus === null ? (
                <>
                  <span className="bg-muted-foreground/40 h-2 w-2 rounded-full" />
                  <span className="text-muted-foreground">
                    {t("exportPage.folderToCheck")}
                  </span>
                </>
              ) : folderExistsStatus ? (
                <>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    {t("exportPage.folderExists")}
                  </span>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                    <XCircle className="h-3 w-3" />
                    {t("exportPage.folderNotExists")}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </AlertDialog>

      <ScrollArea className="mx-auto h-[calc(100vh-180px)] min-h-[60vh] w-full max-w-full rounded-md border p-3">
        {/* 导出页使用与筛选页 / 导入页一致的网格组件和右键菜单 */}
        <PhotoGridEnhance photos={photos} page="export" />
      </ScrollArea>
    </div>
  );
}
