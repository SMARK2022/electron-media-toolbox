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

interface FileImportDrawerProps {
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
}

function FileImportDrawer({ setPhotos }: FileImportDrawerProps) {
  const { t } = useTranslation();
  const [fileNames, setFileNames] = React.useState<string[]>([]);
  const [folderName, setFolderName] = React.useState<string>("");
  const [isDropped, setIsDropped] = React.useState<boolean>(false);
  const [hasInvalidDrop, setHasInvalidDrop] = React.useState<boolean>(false); // 是否发生无效拖入

  // 保存无效拖入的定时器，避免多次快速触发
  const invalidDropTimeoutRef = React.useRef<number | null>(null);

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const files = event.dataTransfer.files;
    const fileList: string[] = [];
    const validExtensions = ["png", "jpg", "jpeg", "webp"];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name;
      const fileExtension = fileName.split(".").pop()?.toLowerCase();

      if (fileExtension && validExtensions.includes(fileExtension)) {
        // 此处可以根据需要获取文件的完整路径
        const filePath = `${fileName}`;
        fileList.push(filePath);
      }
    }

    if (fileList.length > 0) {
      // 至少有一个有效图片文件：正常进入「已拖入」状态
      setFileNames(fileList);
      setIsDropped(true);
      setHasInvalidDrop(false);
      if (invalidDropTimeoutRef.current !== null) {
        window.clearTimeout(invalidDropTimeoutRef.current);
        invalidDropTimeoutRef.current = null;
      }
    } else {
      // 没有任何有效图片：保持拖拽框，红色显示约 1s 并提示无效文件
      setFileNames([]);
      setIsDropped(false);

      // 先清掉之前的定时器
      if (invalidDropTimeoutRef.current !== null) {
        window.clearTimeout(invalidDropTimeoutRef.current);
      }

      setHasInvalidDrop(true);
      invalidDropTimeoutRef.current = window.setTimeout(() => {
        setHasInvalidDrop(false);
        invalidDropTimeoutRef.current = null;
      }, 1000); // 约 1s 后恢复
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  };

  const handleFolderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const inputPath = event.target.value;
    const normalizedPath = inputPath.replace(/\\/g, "/");
    setFolderName(normalizedPath);
  };

  const handleReset = () => {
    setFileNames([]);
    setFolderName("");
    setIsDropped(false);
    setHasInvalidDrop(false);
    if (invalidDropTimeoutRef.current !== null) {
      window.clearTimeout(invalidDropTimeoutRef.current);
      invalidDropTimeoutRef.current = null;
    }
  };

  const handleSubmit = async () => {
    const savedFileNames = [...fileNames].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
    const savedFolderName = folderName;

    // 从 Electron API 获取缩略图目录路径（python生成的路径是固定的）
    // 注意：Electron IPC 的 invoke 返回 Promise，需要 await 才能拿到字符串值
    const thumbsPath = await window.ElectronDB.getThumbsPath();

    const url = "http://localhost:8000/generate_thumbnails";
    console.log("Generating thumbnails with data:", {
      folder_path: savedFolderName,
      thumbs_path: thumbsPath,
      width: 128,
      height: 128,
    });
    const data = {
      folder_path: savedFolderName,
      thumbs_path: thumbsPath, // 请求中包含缩略图目录路径
      width: 128,
      height: 128,
    };

    // 发起生成缩略图的请求，采用 fire-and-forget 的方式，不阻塞后续流程
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    }).catch((error) => {
      console.error("Error generating thumbnails:", error);
    });

    // 立即构造 photo 对象。对于尚未生成缩略图的图片，其地址依然可用，后续可以更新显示
    const photoObjects: PhotoExtend[] = await Promise.all(
      savedFileNames.map(async (filePath) => {
        const fileName = filePath.split("/").pop() || "";
        let photoInfo: any = null;
        try {
          const photoInfoResponse = await fetch(
            `photo-info://${savedFolderName}/${filePath}`,
          );
          if (photoInfoResponse.ok) {
            photoInfo = await photoInfoResponse.json();
          }
        } catch (error) {
          console.error(`Failed to get photo info for ${filePath}`, error);
        }

        const captureTime = photoInfo
          ? new Date(photoInfo.tags.captureTime * 1000).toLocaleString()
          : undefined;

        return {
          fileName: fileName,
          fileUrl: `thumbnail-resource://${savedFolderName}/${filePath}`,
          filePath: `${savedFolderName}/${filePath}`,
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
    sessionStorage.setItem("savedFileNames", JSON.stringify(savedFileNames));
    sessionStorage.setItem("savedFolderName", savedFolderName);
    sessionStorage.setItem(
      "savedPhotoObjectsForState",
      JSON.stringify(photoObjectsForState),
    );
    handleReset();
  };

  // 根据是否无效拖入，动态设置拖拽框的样式与文案
  const dropAreaBaseClass =
    "mx-auto flex w-full max-w-[60vw] items-center justify-center border-2 border-dashed rounded-md transition-colors duration-1000";
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
        <div className="mx-auto w-full max-w-xl">
          <div className="flex flex-col gap-4 p-4">
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
                placeholder={t("placeholders.folderPath")}
                value={folderName}
                onChange={handleFolderChange}
                className="mb-2"
              />
            </div>

            {/* 主体区域：文件列表 + 拖拽区域 */}
            <div className="min-h-0 w-full flex-1">
              <ScrollArea className="h-full w-full rounded-md border">
                <div className="max-h-[calc(50vh-11rem)] p-4">
                  <h4 className="mb-4 text-sm leading-none font-medium">
                    {t("labels.fileList")} -{" "}
                    {folderName || t("placeholders.folderPath")}
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

                  {fileNames.map((filePath, index) => (
                    <React.Fragment key={index}>
                      <div className="text-sm break-all">
                        {folderName}/{filePath}
                      </div>
                      <Separator className="my-2" />
                    </React.Fragment>
                  ))}
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
      const savedPhotos = await getPhotos(); // ✅ 等待 Promise 结果
      setPhotos(savedPhotos);
    };

    void init(); // 可忽略返回的 Promise
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
