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
} from "@/lib/db";
import * as React from "react";
import { useTranslation } from "react-i18next";

interface Photo {
  fileName: string;
  fileUrl: string;
  filePath: string;
  info: string;
  isEnabled: boolean;
}

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
  isEnabled?: boolean;
}

interface FileImportDrawerProps {
  setPhotos: React.Dispatch<React.SetStateAction<Photo[]>>;
}

function FileImportDrawer({ setPhotos }: FileImportDrawerProps) {
  const { t } = useTranslation();
  const [fileNames, setFileNames] = React.useState<string[]>([]);
  const [folderName, setFolderName] = React.useState<string>("");
  const [isDropped, setIsDropped] = React.useState<boolean>(false);

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

    setFileNames(fileList);
    setIsDropped(true);
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

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button variant="outline">{t("buttons.importPhotos")}</Button>
      </DrawerTrigger>
      <DrawerContent>
        <div className="mx-auto mt-4 w-full max-w-sm">
          <DrawerHeader>
            <DrawerTitle>{t("modals.photoImport.title")}</DrawerTitle>
            <DrawerDescription>
              {t("modals.photoImport.description")}
            </DrawerDescription>
          </DrawerHeader>
          <Input
            type="text"
            placeholder={t("placeholders.folderPath")}
            value={folderName}
            onChange={handleFolderChange}
            className="mb-4"
          />
          <ScrollArea className="h-72 w-full rounded-md border">
            <div className="p-4">
              <h4 className="mb-4 text-sm leading-none font-medium">
                {t("labels.fileList")} -{" "}
                {folderName || t("placeholders.folderPath")}
              </h4>

              {!isDropped && (
                <div
                  id="drop-area"
                  className="mx-auto flex h-48 w-full max-w-sm items-center justify-center border-2 border-dashed"
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                >
                  <p className="text-center text-gray-500">
                    {t("labels.dropFilesHere")}
                  </p>
                </div>
              )}

              {fileNames.map((filePath, index) => (
                <React.Fragment key={index}>
                  <div className="text-sm">
                    {folderName}/{filePath}
                  </div>
                  <Separator className="my-2" />
                </React.Fragment>
              ))}
            </div>
          </ScrollArea>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button onClick={handleSubmit}>{t("buttons.submit")}</Button>
            </DrawerClose>
            <Button variant="outline" onClick={handleReset}>
              {t("buttons.reset")}
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

export default function PhotoImportSubpage() {
  const { t } = useTranslation();
  const [photos, setPhotos] = React.useState<Photo[]>([]);

  // 初始化数据库并加载数据
  React.useEffect(() => {
    initializeDatabase();
    const savedPhotos = getPhotos();
    setPhotos(savedPhotos);
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
