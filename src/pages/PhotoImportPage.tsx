// renderer/pages/PhotoImportSubpage.tsx

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
import { Separator } from "@/components/ui/separator";
import {
  addPhotosExtend,
  clearPhotos,
  getPhotos,
  initializeDatabase,
  PhotoExtend,
  Photo,
} from "@/lib/db";
import * as React from "react";
import { useTranslation } from "react-i18next";

// ----------------- 类型与小工具函数 -----------------

interface DroppedFile {
  name: string; // 文件名，如 "1.jpg"
  fullPath?: string; // 绝对路径，如 "E:/photos/1.jpg"
}

interface FileImportDrawerProps {
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
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

/** 规范化为正斜杠路径 */
const normalizePath = (p: string) => p.replace(/\\/g, "/");

// ----------------- 主导入 Drawer -----------------

function FileImportDrawer({ setPhotos }: FileImportDrawerProps) {
  const { t } = useTranslation();

  const [droppedFiles, setDroppedFiles] = React.useState<DroppedFile[]>([]);
  const [folderName, setFolderName] = React.useState("");
  const [isDropped, setIsDropped] = React.useState(false);
  const [hasInvalidDrop, setHasInvalidDrop] = React.useState(false);
  const [folderInputError, setFolderInputError] = React.useState(false);

  const invalidDropTimeoutRef = React.useRef<number | null>(null);
  const folderErrorTimeoutRef = React.useRef<number | null>(null);

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

  // ---------- 拖拽事件 ----------

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const validExt = ["png", "jpg", "jpeg", "webp"];

    const next: DroppedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !validExt.includes(ext)) continue;

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

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

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
    clearTimeoutRef(invalidDropTimeoutRef);
    clearTimeoutRef(folderErrorTimeoutRef);
  };

  // ---------- 提交 ----------

  const handleSubmit = async () => {
    if (!droppedFiles.length) return;

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

    // 获取缩略图缓存目录
    let thumbsPath = "../.cache/.thumbs";
    try {
      const electronAPI = (window as any)?.ElectronAPI;
      if (electronAPI?.getThumbsCacheDir) {
        thumbsPath = await electronAPI.getThumbsCacheDir();
      }
    } catch (error) {
      console.warn("getThumbsCacheDir failed, using default path:", error);
    }

    // 后端生成缩略图
    fetch("http://localhost:8000/generate_thumbnails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_paths: sortedPaths,
        thumbs_path: thumbsPath,
        width: 128,
        height: 128,
      }),
    }).catch((error) => console.error("Error generating thumbnails:", error));

    // 构造前端 PhotoExtend
    const photoObjects: PhotoExtend[] = await Promise.all(
      sortedPaths.map(async (absPath) => {
        const normalized = normalizePath(absPath);
        const fileName = normalized.split("/").pop() || "";

        let photoInfo: any = null;
        try {
          const res = await fetch(`photo-info://${normalized}`);
          if (res.ok) photoInfo = await res.json();
        } catch (error) {
          console.error(`Failed to get photo info for ${normalized}`, error);
        }

        const captureTime = photoInfo
          ? new Date(photoInfo.tags.captureTime * 1000).toLocaleString()
          : undefined;

        return {
          fileName,
          fileUrl: `thumbnail-resource://${normalized}`,
          filePath: normalized,
          date: captureTime,
          fileSize: photoInfo?.tags?.fileSize,
          info:
            photoInfo?.tags?.ExposureTime && photoInfo?.tags?.LensModel
              ? `1/${1 / photoInfo.tags.ExposureTime} ${photoInfo.tags.LensModel}`
              : undefined,
          isEnabled: true,
        };
      }),
    );

    // 更新数据库 + UI
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

    setPhotos(photoObjectsForState);

    // 一些持久化记录（当前页面不读取，但保留）
    sessionStorage.setItem(
      "savedFileNames",
      JSON.stringify(droppedFiles.map((f) => f.name)),
    );
    sessionStorage.setItem(
      "savedFolderName",
      allHaveFullPaths ? "" : normalizedFolder,
    );
    sessionStorage.setItem(
      "savedPhotoObjectsForState",
      JSON.stringify(photoObjectsForState),
    );

    handleReset();
  };

  // ---------- 样式 / 文案 ----------

  const dropAreaBase =
    "mx-auto flex w-full max-w-[60vw] h-[calc(70vh-14.1rem)] items-center justify-center rounded-md border-2 border-dashed transition-colors duration-1000";
  const dropAreaClass = hasInvalidDrop
    ? `${dropAreaBase} border-red-500 bg-red-500/10`
    : `${dropAreaBase} border-gray-400`;

  const dropText = hasInvalidDrop
    ? t("labels.dropInvalidFiles")
    : t("labels.dropFilesHere");

  const dropTextColor = hasInvalidDrop ? "text-red-500" : "text-gray-400";

  // 输入框样式：用于底部 Footer 内的横向布局
  const folderInputClass = [
    "flex-1 min-w-0",
    folderInputError && "border-red-500 focus-visible:ring-red-500",
  ]
    .filter(Boolean)
    .join(" ");

  const listHeaderSuffix = allHaveFullPaths
    ? t("placeholders.detectedFolder")
    : folderName || t("placeholders.enterFolderPath");

  // ---------- JSX ----------

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">{t("buttons.importPhotos")}</Button>
      </DrawerTrigger>

      <DrawerContent>
        <div className="mx-auto w-full max-w-xl">
          <div className="flex h-[70vh] flex-col gap-3 p-4">
            {/* 顶部标题 */}
            <DrawerHeader className="px-0 pb-0">
              <DrawerTitle>{t("modals.photoImport.title")}</DrawerTitle>
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
                    >
                      <p
                        className={`px-4 text-center text-sm ${dropTextColor}`}
                      >
                        {dropText}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-1 flex-col">
                      {droppedFiles.map((file, idx) => {
                        const displayPath = allHaveFullPaths
                          ? file.fullPath || file.name
                          : folderName
                            ? `${folderName}/${file.name}`
                            : file.name;

                        return (
                          <React.Fragment key={`${file.name}-${idx}`}>
                            <div className="text-sm break-all">
                              {displayPath}
                            </div>
                            <Separator className="my-2" />
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

              {/* 右侧：按钮组，始终靠右，不随输入框消失而改变布局结构 */}
              <div className="ml-auto flex flex-row items-center gap-2">
                <DrawerClose asChild>
                  <Button onClick={handleSubmit}>{t("buttons.submit")}</Button>
                </DrawerClose>
                <Button variant="outline" onClick={handleReset}>
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
  const [photos, setPhotos] = React.useState<Photo[]>([]);

  // 初始化数据库并加载数据（带兜底）
  React.useEffect(() => {
    const init = async () => {
      try {
        initializeDatabase();
        const savedPhotos = await getPhotos();

        if (Array.isArray(savedPhotos)) {
          setPhotos(savedPhotos);
        } else if (savedPhotos == null) {
          console.warn(
            "[PhotoImportSubpage] getPhotos() returned null/undefined, fallback to []",
          );
          setPhotos([]);
        } else {
          console.warn(
            "[PhotoImportSubpage] getPhotos() returned non-array:",
            savedPhotos,
          );
          setPhotos([]);
        }
      } catch (error) {
        console.error(
          "[PhotoImportSubpage] failed to init / load photos:",
          error,
        );
        setPhotos([]);
      }
    };
    void init();
  }, []);

  // 从 sessionStorage 恢复 UI 状态（带解析与类型保护）
  React.useEffect(() => {
    try {
      const saved = sessionStorage.getItem("savedPhotoObjectsForState");
      if (!saved) return;

      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed)) {
        console.warn(
          "[PhotoImportSubpage] sessionStorage savedPhotoObjectsForState is not array:",
          parsed,
        );
        return;
      }

      setPhotos(parsed as Photo[]);
    } catch (error) {
      console.error(
        "[PhotoImportSubpage] failed to restore photos from sessionStorage:",
        error,
      );
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col p-4">
      <div className="mb-4 flex justify-between">
        <FileImportDrawer setPhotos={setPhotos} />
        <div className="text-right">
          {t("labels.totalPhotosLabel")}: {photos.length}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="mx-auto h-[calc(100vh-160px)] w-full max-w-full rounded-md border p-4">
          <PhotoGridEnhance photos={photos} />
        </ScrollArea>
      </div>
    </div>
  );
}
