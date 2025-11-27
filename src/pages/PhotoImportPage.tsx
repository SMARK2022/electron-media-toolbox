// renderer/pages/PhotoImportSubpage.tsx

import * as React from "react";
import { PhotoGridEnhance } from "@/components/PhotoGrid";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  addPhotosExtend,
  clearPhotos,
  initializeDatabase,
  PhotoExtend,
  Photo,
} from "@/helpers/ipc/database/db";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { usePhotoFilterStore } from "@/helpers/store/usePhotoFilterStore";
import { PhotoService } from "@/helpers/services/PhotoService";
import { Upload, FileWarning, Image as ImageIcon } from "lucide-react";

// 规范化路径为正斜杠
const normalizePath = (p: string) => p.replace(/\\/g, "/");

// ----------------- 类型与小工具函数 -----------------

interface DroppedFile {
  name: string; // 文件名，如 "1.jpg"
  fullPath?: string; // 绝对路径，如 "E:/photos/1.jpg"
}

interface FileImportDrawerProps {
  /**
   * 导入完成后，将新照片列表写入全局 store（而不是仅仅写入本地 state）。
   */
  onImported: (photos: Photo[]) => void;
}

// 允许的扩展名（用于拖拽和文件选择公用）
const VALID_EXTENSIONS = ["png", "jpg", "jpeg", "webp"];

/** 判断是否为合法图片文件 */
function isValidImageFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && VALID_EXTENSIONS.includes(ext);
}

/** 尝试从 ElectronAPI / 旧版 file.path 获取绝对路径，失败返回空字符串 */
function tryGetFullPath(file: File): string {
  try {
    const electronAPI = (window as any)?.ElectronAPI;
    if (electronAPI?.getPathForFile) {
      const p = electronAPI.getPathForFile(file);
      if (typeof p === "string" && p.length > 0) return p;
    }

    const anyFile = file as any;
    if (anyFile?.path && typeof anyFile.path === "string") {
      return anyFile.path;
    }
  } catch (error) {
    console.warn("[tryGetFullPath] error:", error);
  }
  return "";
}

// ----------------- 主导入 Drawer -----------------

function FileImportDrawer({ onImported }: FileImportDrawerProps) {
  const { t } = useTranslation();
  const fnGetPhotoMetadata = usePhotoFilterStore((s) => s.fnGetPhotoMetadata); // 获取 store 中的缓存元数据函数

  const [droppedFiles, setDroppedFiles] = React.useState<DroppedFile[]>([]);
  const [folderName, setFolderName] = React.useState("");
  const [isDropped, setIsDropped] = React.useState(false);
  const [hasInvalidDrop, setHasInvalidDrop] = React.useState(false);
  const [folderInputError, setFolderInputError] = React.useState(false);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const invalidDropTimeoutRef = React.useRef<number | null>(null);
  const folderErrorTimeoutRef = React.useRef<number | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const allHaveFullPaths =
    droppedFiles.length > 0 && droppedFiles.every((f) => !!f.fullPath);
  // 决定“是否需要用户输入文件夹路径”
  const showFolderInput = droppedFiles.length > 0 && !allHaveFullPaths;

  const clearTimeoutRef = (ref: React.MutableRefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  // ---------- 统一处理文件列表的函数（拖拽 + 文件选择公用） ----------

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const next: DroppedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isValidImageFile(file)) continue;

      const rawFullPath = tryGetFullPath(file);
      const normalized = rawFullPath ? normalizePath(rawFullPath) : "";
      const fullPath =
        normalized && normalized !== file.name ? normalized : undefined;

      next.push({ name: file.name, fullPath });
    }

    if (next.length) {
      setDroppedFiles(next);
      setIsDropped(true);
      setHasInvalidDrop(false);
      clearTimeoutRef(invalidDropTimeoutRef);
    } else {
      setDroppedFiles([]);
      setIsDropped(false);
      clearTimeoutRef(invalidDropTimeoutRef);
      setHasInvalidDrop(true);
      invalidDropTimeoutRef.current = window.setTimeout(() => {
        setHasInvalidDrop(false);
        invalidDropTimeoutRef.current = null;
      }, 1000);
    }
  };

  // ---------- 拖拽事件 ----------

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    handleFilesAdded(event.dataTransfer.files);
  };

  // ---------- 点击打开文件选择框 ----------

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesAdded(event.target.files);
    // 选完之后重置 input 的 value，方便下次选择相同文件也能触发 change
    event.target.value = "";
  };

  // ---------- 文件夹输入 ----------

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    setFolderName(normalizePath(event.target.value));

  // ---------- 重置 ----------

  const handleReset = () => {
    setDroppedFiles([]);
    setFolderName("");
    setIsDropped(false);
    setHasInvalidDrop(false);
    setFolderInputError(false);
    setIsDragOver(false);
    setIsProcessing(false);
    clearTimeoutRef(invalidDropTimeoutRef);
    clearTimeoutRef(folderErrorTimeoutRef);
    // 重置数据库状态：重新初始化并清空 present 表
    initializeDatabase();
    clearPhotos();
  };

  // ---------- 提交 ----------

  const handleSubmit = async () => {
    if (!droppedFiles.length || isProcessing) return;

    let normalizedFolder = normalizePath(folderName).trim();

    // 仅在需要输入文件夹路径的模式下校验
    if (showFolderInput && !normalizedFolder) {
      clearTimeoutRef(folderErrorTimeoutRef);
      setFolderInputError(true);
      const prev = folderName;
      setFolderName(t("placeholders.enterFolderPath"));
      folderErrorTimeoutRef.current = window.setTimeout(() => {
        setFolderInputError(false);
        setFolderName(prev || "");
        folderErrorTimeoutRef.current = null;
      }, 1000);
      return;
    }

    setIsProcessing(true);

    try {
      // 构造绝对路径列表
      const absoluteFilePaths = droppedFiles.map((file) => {
        if (allHaveFullPaths && file.fullPath) {
          return normalizePath(file.fullPath);
        }
        return normalizePath(`${normalizedFolder}/${file.name}`);
      });

      const sortedPaths = [...absoluteFilePaths].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      );

      // 使用 PhotoService 提交缩略图生成任务
      await PhotoService.submitThumbnailTask({ filePaths: sortedPaths });

      // 构造前端 PhotoExtend
      const photoObjects: PhotoExtend[] = await Promise.all(
        sortedPaths.map(async (absPath) => {
          const normalized = normalizePath(absPath);
          const fileName = normalized.split("/").pop() || "";

          // 通过 store 缓存函数获取 EXIF 元数据（自动缓存，避免重复读取）
          const metadata = await fnGetPhotoMetadata(normalized);
          const exifData = metadata?.exif ?? null;

          const captureTime = exifData?.captureTime // EXIF 中的 captureTime 为 Unix 时间戳
            ? new Date(exifData.captureTime * 1000).toLocaleString()
            : undefined;

          return {
            fileName,
            fileUrl: `thumbnail-resource://${normalized}`,
            filePath: normalized,
            date: captureTime,
            fileSize: exifData?.fileSize,
            info: exifData?.ExposureTime && exifData?.LensModel
              ? `1/${1 / exifData.ExposureTime} ${exifData.LensModel}`
              : undefined,
            isEnabled: true,
          };
        }),
      );

      // 清空旧数据并重新初始化相册表结构
      clearPhotos();
      initializeDatabase();
      addPhotosExtend(photoObjects);

      const photoObjectsForState: Photo[] = photoObjects.map((p) => ({
        fileName: p.fileName,
        fileUrl: p.fileUrl,
        filePath: p.filePath,
        info: p.date || "Unknown",
        isEnabled: p.isEnabled ?? true,
      }));

      // 通过回调写入全局 store
      onImported(photoObjectsForState);
    } finally {
      setIsProcessing(false);
    }
  };

  // ---------- 样式 / 文案 ----------

  const dropText = hasInvalidDrop
    ? t("labels.dropInvalidFiles")
    : t("labels.dropFilesHere");

  const listHeaderSuffix = allHaveFullPaths
    ? t("placeholders.detectedFolder")
    : folderName || t("placeholders.enterFolderPath");

  const dropAreaClass = cn(
    "relative mx-auto flex w-full max-w-[60vw] h-[calc(70vh-14.8rem)]",
    "flex-col items-center justify-center rounded-xl border-2 border-dashed",
    "transition-all duration-200 cursor-pointer",
    "border-gray-300 bg-transparent hover:border-blue-400 hover:bg-gray-50/60",
    isDragOver && "border-blue-500 bg-blue-50/80 scale-[1.01]",
    hasInvalidDrop && "border-red-500 bg-red-50",
  );

  const folderInputClass = cn(
    "flex-1 min-w-0",
    folderInputError && "border-red-500 focus-visible:ring-red-500",
  );

  // ---------- JSX ----------

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="h-4 w-4" />
          {t("buttons.importPhotos")}
        </Button>
      </DrawerTrigger>

      <DrawerContent>
        <div className="mx-auto w-full max-w-xl">
          <div className="flex h-[70vh] flex-col gap-3 p-4">
            {/* 顶部标题 */}
            <DrawerHeader className="px-0 pb-0">
              <DrawerTitle className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-blue-100">
                  <ImageIcon className="h-4 w-4 text-blue-600" />
                </span>
                {t("modals.photoImport.title")}
              </DrawerTitle>
              <DrawerDescription>
                {t("modals.photoImport.description")}
              </DrawerDescription>
            </DrawerHeader>

            {/* 中部主体：列表 / 拖拽区域 */}
            <div className="flex min-h-0 flex-1 flex-col">
              <ScrollArea className="h-full w-full rounded-md border">
                <div className="flex h-full flex-col p-4">
                  <h4 className="mb-4 text-sm leading-none font-medium">
                    {t("labels.fileList")} - {listHeaderSuffix}
                  </h4>

                  {!isDropped ? (
                    <div
                      id="drop-area"
                      className={dropAreaClass}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {/* 内部 icon + 文案 */}
                      <div className="pointer-events-none flex flex-col items-center gap-3 px-4 text-center">
                        <div
                          className={cn(
                            "flex h-12 w-12 items-center justify-center rounded-full border",
                            hasInvalidDrop
                              ? "border-red-200 bg-red-100 text-red-600"
                              : "border-gray-200 bg-gray-100 text-gray-500",
                          )}
                        >
                          {hasInvalidDrop ? (
                            <FileWarning className="h-6 w-6" />
                          ) : (
                            <Upload className="h-6 w-6" />
                          )}
                        </div>
                        <div className="space-y-1">
                          <p
                            className={cn(
                              "text-sm font-medium",
                              hasInvalidDrop ? "text-red-600" : "text-gray-700",
                            )}
                          >
                            {dropText}
                          </p>
                          <p className="text-xs text-gray-400">
                            {t("labels.supportedFileTypes")}
                          </p>
                        </div>
                      </div>

                      {/* 隐藏的多文件选择 input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept=".jpg,.jpeg,.png,.webp"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col gap-2">
                      {droppedFiles.map((file, idx) => {
                        const displayPath = allHaveFullPaths
                          ? file.fullPath || file.name
                          : folderName
                            ? `${folderName}/${file.name}`
                            : file.name;

                        return (
                          <React.Fragment key={`${file.name}-${idx}`}>
                            <div className="flex items-center gap-3 rounded-md border bg-white px-3 py-2 shadow-sm">
                              <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100">
                                <ImageIcon className="h-4 w-4 text-gray-500" />
                              </div>
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate text-sm font-medium text-gray-700">
                                  {file.name}
                                </span>
                                <span className="truncate text-xs text-gray-400">
                                  {displayPath}
                                </span>
                              </div>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* 底部按钮 + 文件夹输入框（输入框在提交按钮左侧） */}
            <DrawerFooter className="mt-0 flex flex-row items-center gap-2 px-0 py-0">
              {/* 左侧：可选文件夹输入框 */}
              {showFolderInput && (
                <Input
                  type="text"
                  placeholder={t("placeholders.enterFolderPath")}
                  value={folderName}
                  onChange={handleFolderChange}
                  className={folderInputClass}
                />
              )}

              {/* 右侧：按钮组 */}
              <div className="ml-auto flex flex-row items-center gap-2">
                <DrawerClose asChild>
                  <Button
                    onClick={handleSubmit}
                    disabled={!droppedFiles.length || isProcessing}
                  >
                    {t("buttons.submit")}
                  </Button>
                </DrawerClose>
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={isProcessing}
                >
                  {t("buttons.reset")}
                </Button>
              </div>
            </DrawerFooter>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

// ----------------- 外层页面 -----------------

export default function PhotoImportSubpage() {
  const { t } = useTranslation();
  const photos = usePhotoFilterStore((s) => s.lstAllPhotos);
  const fnSetAllPhotos = usePhotoFilterStore((s) => s.fnSetAllPhotos);
  const fnSetCurrentPage = usePhotoFilterStore((s) => s.fnSetCurrentPage);

  // 进入页面时设置当前页面类型
  React.useEffect(() => {
    fnSetCurrentPage("import");
  }, [fnSetCurrentPage]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/60 p-4 px-4 py-2 dark:bg-gray-900">
      <div className="mb-2 flex justify-between">
        <FileImportDrawer
          onImported={(newPhotos) => {
            fnSetAllPhotos(newPhotos);
          }}
        />
        <div className="bg-muted inline-flex items-center rounded-full px-3 py-1 text-sm font-medium">
          <span className="text-muted-foreground">
            {t("labels.totalPhotos")}
          </span>
          <span className="text-m ml-1 font-semibold text-blue-600 dark:text-blue-400">
            {photos.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="mx-auto h-[calc(100vh-160px)] w-full max-w-full rounded-md border p-4">
          <PhotoGridEnhance photos={photos} page="import" />
          {photos.length === 0 && (
            <div className="text-muted-foreground flex h-[calc(70vh-100px)] flex-col items-center justify-center text-center">
              <div className="mb-3 rounded-full bg-white p-4 shadow-sm">
                <ImageIcon className="h-8 w-8 opacity-30" />
              </div>
              <p className="text-sm font-medium">
                {t("importPage.noPhotosFoundTitle") || "No photos found"}
              </p>
              <p className="text-muted-foreground mt-1 max-w-xs text-xs">
                {t("importPage.noPhotosFoundDesc") ||
                  "Try adjusting filters, importing more photos, or running a new detection task."}
              </p>
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
