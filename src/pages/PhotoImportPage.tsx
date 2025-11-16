// renderer/pages/PhotoImportSubpage.tsx

import { PhotoGridEnhance } from "@/components/PhotoGrid"; // Import PhotoGrid
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

// 拖拽进来的单个文件信息：name 必有，fullPath 在成功获取绝对路径时存在
interface DroppedFile {
  name: string; // 纯文件名，如 "1.jpg"
  fullPath?: string; // 绝对路径，如 "E:/photos/1.jpg"；获取失败时为 undefined
}

interface FileImportDrawerProps {
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
}

/**
 * 尝试从 ElectronAPI 获取 File 的绝对路径。
 * - 优先 ElectronAPI.getPathForFile
 * - 其次尝试 file.path（旧版 Electron）
 * - 失败则返回空字符串
 */
function tryGetFullPathFromElectron(file: File): string {
  try {
    const anyWindow = window as any;
    const api = anyWindow?.ElectronAPI;

    if (api && typeof api.getPathForFile === "function") {
      const p = api.getPathForFile(file);
      if (typeof p === "string" && p.length > 0) {
        return p;
      }
    }

    const anyFile = file as any;
    if (
      anyFile &&
      typeof anyFile.path === "string" &&
      anyFile.path.length > 0
    ) {
      return anyFile.path;
    }
  } catch (error) {
    console.warn("[tryGetFullPathFromElectron] error:", error);
  }

  return "";
}

function FileImportDrawer({ setPhotos }: FileImportDrawerProps) {
  const { t } = useTranslation();

  // 拖入的文件列表：包含 name 和 optional fullPath
  const [droppedFiles, setDroppedFiles] = React.useState<DroppedFile[]>([]);

  // 用户输入的文件夹路径（在“文件夹模式”下使用）
  const [folderName, setFolderName] = React.useState<string>("");

  // 是否已经发生有效拖拽（控制隐藏/显示拖拽区域）
  const [isDropped, setIsDropped] = React.useState<boolean>(false);

  // 拖入了无效文件的提示状态
  const [hasInvalidDrop, setHasInvalidDrop] = React.useState<boolean>(false);

  // 文件夹输入框错误状态（用于变红）
  const [folderInputError, setFolderInputError] =
    React.useState<boolean>(false);

  // 保存无效拖入的定时器，避免多次快速触发
  const invalidDropTimeoutRef = React.useRef<number | null>(null);

  // 文件夹输入错误提示的定时器
  const folderErrorTimeoutRef = React.useRef<number | null>(null);

  // 是否所有文件都成功获取了绝对路径：全路径模式判定
  const allHaveFullPaths =
    droppedFiles.length > 0 && droppedFiles.every((f) => !!f.fullPath);

  /**
   * 处理拖拽放入事件
   */
  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const validExtensions = ["png", "jpg", "jpeg", "webp"];

    const nextDroppedFiles: DroppedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;
      const fileExtension = fileName.split(".").pop()?.toLowerCase();

      if (fileExtension && validExtensions.includes(fileExtension)) {
        // 优先尝试从 Electron 拿到绝对路径
        const rawFullPath = tryGetFullPathFromElectron(file);

        // 规范化路径分隔符
        const normalizedFullPath =
          typeof rawFullPath === "string" && rawFullPath.length > 0
            ? rawFullPath.replace(/\\/g, "/")
            : "";

        // 如果拿到的路径只是文件名本身，就当作没有获取到绝对路径
        const fullPath =
          normalizedFullPath && normalizedFullPath !== fileName
            ? normalizedFullPath
            : undefined;

        nextDroppedFiles.push({
          name: fileName,
          fullPath,
        });
      }
    }

    if (nextDroppedFiles.length > 0) {
      // 至少有一个有效图片文件：正常进入「已拖入」状态
      setDroppedFiles(nextDroppedFiles);
      setIsDropped(true);
      setHasInvalidDrop(false);

      if (invalidDropTimeoutRef.current !== null) {
        window.clearTimeout(invalidDropTimeoutRef.current);
        invalidDropTimeoutRef.current = null;
      }
    } else {
      // 没有任何有效图片：保持拖拽框，红色显示约 1s 并提示无效文件
      setDroppedFiles([]);
      setIsDropped(false);

      if (invalidDropTimeoutRef.current !== null) {
        window.clearTimeout(invalidDropTimeoutRef.current);
      }

      setHasInvalidDrop(true);
      invalidDropTimeoutRef.current = window.setTimeout(() => {
        setHasInvalidDrop(false);
        invalidDropTimeoutRef.current = null;
      }, 1000);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  /**
   * 手动输入文件夹路径（仅在非全路径模式下有意义）
   */
  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputPath = event.target.value;
    const normalizedPath = inputPath.replace(/\\/g, "/");
    setFolderName(normalizedPath);
  };

  /**
   * 重置所有状态
   */
  const handleReset = () => {
    setDroppedFiles([]);
    setFolderName("");
    setIsDropped(false);
    setHasInvalidDrop(false);
    setFolderInputError(false);

    if (invalidDropTimeoutRef.current !== null) {
      window.clearTimeout(invalidDropTimeoutRef.current);
      invalidDropTimeoutRef.current = null;
    }
    if (folderErrorTimeoutRef.current !== null) {
      window.clearTimeout(folderErrorTimeoutRef.current);
      folderErrorTimeoutRef.current = null;
    }
  };

  /**
   * 提交：构造绝对路径列表，发送给后端生成缩略图，
   * 同时构造 PhotoExtend / Photo 用于前端展示和 DB 存储。
   */
  const handleSubmit = async () => {
    if (droppedFiles.length === 0) {
      // 没有任何文件，不做处理
      return;
    }

    // 文件夹路径标准化
    let normalizedFolder = folderName.replace(/\\/g, "/").trim();

    // 如果不是全路径模式，则必须要求用户填写文件夹路径
    if (!allHaveFullPaths && !normalizedFolder) {
      // 显示错误提示：输入框变红，内容变为“输入文件路径”约 1 秒
      if (folderErrorTimeoutRef.current !== null) {
        window.clearTimeout(folderErrorTimeoutRef.current);
      }

      setFolderInputError(true);
      const prevFolderName = folderName;
      setFolderName("输入文件路径");

      folderErrorTimeoutRef.current = window.setTimeout(() => {
        setFolderInputError(false);
        setFolderName(prevFolderName || "");
        folderErrorTimeoutRef.current = null;
      }, 1000);

      return;
    }

    // 统一构造「绝对路径列表」
    const absoluteFilePaths: string[] = droppedFiles.map((file) => {
      if (allHaveFullPaths && file.fullPath) {
        return file.fullPath.replace(/\\/g, "/");
      }
      // 非全路径模式：由 folderName + 文件名 拼接
      return `${normalizedFolder}/${file.name}`.replace(/\\/g, "/");
    });

    // 为了稳定性，按路径进行排序
    const sortedAbsolutePaths = [...absoluteFilePaths].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );

    // 从 Electron API 获取缩略图缓存目录路径（若不可用则使用默认）
    let thumbsPath = "../.cache/.thumbs";
    try {
      const anyWindow = window as any;
      if (anyWindow.ElectronAPI?.getThumbsCacheDir) {
        thumbsPath = await anyWindow.ElectronAPI.getThumbsCacheDir();
      }
    } catch (error) {
      console.warn("getThumbsCacheDir failed, using default path:", error);
    }

    const url = "http://localhost:8000/generate_thumbnails";
    const data = {
      file_paths: sortedAbsolutePaths, // ✅ 后端现在按文件列表处理
      thumbs_path: thumbsPath,
      width: 128,
      height: 128,
    };

    console.log("Generating thumbnails with data:", data);

    // Fire-and-forget 方式发起缩略图生成请求
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).catch((error) => {
      console.error("Error generating thumbnails:", error);
    });

    // 构造 PhotoExtend 对象，使用绝对路径 + 自定义协议
    const photoObjects: PhotoExtend[] = await Promise.all(
      sortedAbsolutePaths.map(async (absolutePath) => {
        const normalizedPath = absolutePath.replace(/\\/g, "/");
        const fileName = normalizedPath.split("/").pop() || "";

        let photoInfo: any = null;
        try {
          // 直接把绝对路径拼在 scheme 后面，主进程解析时去掉前缀即可得到真实路径
          const photoInfoResponse = await fetch(
            `photo-info://${normalizedPath}`,
          );
          if (photoInfoResponse.ok) {
            photoInfo = await photoInfoResponse.json();
          }
        } catch (error) {
          console.error(
            `Failed to get photo info for ${normalizedPath}`,
            error,
          );
        }

        const captureTime = photoInfo
          ? new Date(photoInfo.tags.captureTime * 1000).toLocaleString()
          : undefined;

        return {
          fileName,
          fileUrl: `thumbnail-resource://${normalizedPath}`,
          filePath: normalizedPath,
          date: captureTime,
          fileSize: photoInfo?.tags?.fileSize,
          info:
            photoInfo && photoInfo.tags.ExposureTime && photoInfo.tags.LensModel
              ? `1/${1 / photoInfo.tags.ExposureTime} ${photoInfo.tags.LensModel}`
              : undefined,
          isEnabled: true,
        };
      }),
    );

    // 更新数据库与 UI
    clearPhotos();
    initializeDatabase();
    addPhotosExtend(photoObjects);

    const photoObjectsForState: Photo[] = photoObjects.map((photo) => ({
      fileName: photo.fileName,
      fileUrl: photo.fileUrl,
      filePath: photo.filePath,
      info: photo.date || "Unknown",
      isEnabled: photo.isEnabled || true,
    }));

    setPhotos(photoObjectsForState);

    // 下面这两个只作为持久化记录，当前页面并未读取使用
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

  // 根据是否无效拖入，动态设置拖拽框的样式与文案
  const dropAreaBaseClass =
    "mx-auto flex h-[calc(60vh-14.7rem)] w-full max-w-[60vw] items-center justify-center border-2 border-dashed rounded-md transition-colors duration-1000";
  const dropAreaClass = hasInvalidDrop
    ? `${dropAreaBaseClass} border-red-500 bg-red-500/10`
    : `${dropAreaBaseClass} border-gray-400`;

  const dropText = hasInvalidDrop
    ? t("labels.dropInvalidFiles")
    : t("labels.dropFilesHere");

  const dropTextColor = hasInvalidDrop ? "text-red-500" : "text-gray-400";

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">{t("buttons.importPhotos")}</Button>
      </DrawerTrigger>

      {/* DrawerContent 本身由 shadcn 提供 fixed bottom 布局，这里只控制内部高度分配 */}
      <DrawerContent>
        {/* 这个容器是整个抽屉的「内部布局」 */}
        <div className="mx-auto h-[70vh] w-full max-w-xl">
          <div className="flex flex-col gap-3 p-4">
            {/* 头部：标题 + 描述 */}
            <DrawerHeader className="px-0 pb-0">
              <DrawerTitle>{t("modals.photoImport.title")}</DrawerTitle>
              <DrawerDescription>
                {t("modals.photoImport.description")}
              </DrawerDescription>
            </DrawerHeader>

            {/* 输入路径 */}
            <div className="w-full px-0">
              <Input
                type="text"
                placeholder={t("placeholders.enterFolderPath")}
                value={
                  // 全路径模式：禁用输入，仅展示提示文字
                  allHaveFullPaths ? "已获取到完整路径" : folderName
                }
                onChange={handleFolderChange}
                disabled={allHaveFullPaths}
                className={`mb-2 ${
                  folderInputError
                    ? "border-red-500 focus-visible:ring-red-500"
                    : ""
                }`}
              />
            </div>

            {/* 主体区域：文件列表 + 拖拽区域 */}
            <div className="min-h-0 w-full flex-1">
              <ScrollArea className="h-full w-full rounded-md border">
                <div className="h-[calc(60vh-11rem)] p-4">
                  <h4 className="mb-4 text-sm leading-none font-medium">
                    {t("labels.fileList")} -{" "}
                    {allHaveFullPaths
                      ? t("placeholders.detectedFolder")
                      : folderName || t("placeholders.enterFolderPath")}
                  </h4>

                  {!isDropped && (
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
                  )}

                  {droppedFiles.map((file, index) => {
                    // 列表展示路径：全路径模式显示 fullPath，文件夹模式显示 folderName + name
                    const displayPath = allHaveFullPaths
                      ? file.fullPath || file.name
                      : folderName
                        ? `${folderName}/${file.name}`
                        : file.name;

                    return (
                      <React.Fragment key={index}>
                        <div className="text-sm break-all">{displayPath}</div>
                        <Separator className="my-2" />
                      </React.Fragment>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* 底部按钮：始终占据布局的最底部，不随 ScrollArea 滚动 */}
            <DrawerFooter className="mt-0 flex flex-row items-center justify-end gap-2 px-0 py-0">
              <DrawerClose asChild>
                <Button onClick={handleSubmit}>{t("buttons.submit")}</Button>
              </DrawerClose>
              <Button variant="outline" onClick={handleReset}>
                {t("buttons.reset")}
              </Button>
            </DrawerFooter>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default function PhotoImportSubpage() {
  const { t } = useTranslation();
  const [photos, setPhotos] = React.useState<Photo[]>([]);

  // 初始化数据库并加载数据（异步）
  React.useEffect(() => {
    const init = async () => {
      initializeDatabase();
      const savedPhotos = await getPhotos();
      setPhotos(savedPhotos);
    };

    void init();
  }, []);

  // 组件挂载时从 sessionStorage 加载数据
  React.useEffect(() => {
    const photoObjectsForState = sessionStorage.getItem(
      "savedPhotoObjectsForState",
    );

    if (photoObjectsForState?.length) {
      const photoObjects: Photo[] = JSON.parse(photoObjectsForState);
      setPhotos(photoObjects);
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
