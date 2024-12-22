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
import { addPhotosExtend, clearPhotos, getPhotos, initializeDatabase } from "@/lib/db";
import * as React from "react";

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
                const filePath = `${fileName}`;
                fileList.push(filePath);
                // console.log("File Path:", filePath);
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

    // 假设你已经定义了Photo类型和其他相关代码
    const handleSubmit = async () => {
        const savedFileNames = fileNames;
        const savedFolderName = folderName;
        console.log("Saved File Names:", savedFileNames);
        console.log("Saved Folder Name:", savedFolderName);

        // 向 Python 后端请求生成缩略图
        const url = "http://localhost:8000/generate_thumbnails";
        const data = {
            folder_path: `${savedFolderName}`,
            width: 128,
            height: 128,
        };

        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });
        } catch (error) {
            console.error("Error generating thumbnails:", error);
        }

        // 获取每个文件的拍摄时间
        const photoObjects: PhotoExtend[] = await Promise.all(
            savedFileNames.map(async (filePath) => {
                const fileName = filePath.split("/").pop() || "";
                const photoInfoResponse = await fetch(
                    `photo-info://${savedFolderName}/${filePath}`
                );

                if (photoInfoResponse.ok) {
                    const photoInfo = await photoInfoResponse.json();
                    // console.log("Photo Info:", photoInfo);

                    // 将时间戳转化为日期格式
                    const captureTime = new Date(
                        photoInfo.tags.captureTime * 1000
                    ).toLocaleString();

                    return {
                        fileName: fileName,
                        // 构建缩略图 URL
                        fileUrl: `thumbnail-resource://${savedFolderName}/${filePath}`,
                        filePath: `${savedFolderName}/${filePath}`,
                        date: captureTime, // 使用拍摄时间替代 info 字段
                        fileSize: photoInfo.tags.fileSize,
                        info:
                            `1/${1 / photoInfo.tags.ExposureTime} ${photoInfo.tags.LensModel}` ||
                            undefined,
                        isEnabled: true,
                    };
                } else {
                    console.error(`Failed to get photo info for ${filePath}`);
                    return {
                        fileName: fileName,
                        fileUrl: `thumbnail-resource://${savedFolderName}/${filePath}`,
                        filePath: `${savedFolderName}/${filePath}`,
                        date: undefined,
                        fileSize: undefined,
                        info: undefined,
                        isEnabled: true,
                    };
                }
            })
        );

        // 保存到数据库
        clearPhotos();
        initializeDatabase();
        addPhotosExtend(photoObjects);

        // Convert PhotoExtend objects to Photo objects
        const photoObjectsForState: Photo[] = photoObjects.map((photo) => ({
            fileName: photo.fileName,
            fileUrl: photo.fileUrl,
            filePath: photo.filePath,
            info: photo.date || "Unknown",
            isEnabled: photo.isEnabled || true,
        }));

        setPhotos(photoObjectsForState); // Set photo objects
        sessionStorage.setItem("savedFileNames", JSON.stringify(savedFileNames));
        sessionStorage.setItem("savedFolderName", savedFolderName);
        sessionStorage.setItem("savedPhotoObjectsForState", JSON.stringify(photoObjectsForState));
        handleReset();
    };

    return (
        <Drawer>
            <DrawerTrigger asChild>
                <Button variant="outline">导入照片</Button>
            </DrawerTrigger>
            <DrawerContent>
                <div className="mx-auto mt-4 w-full max-w-sm">
                    <DrawerHeader>
                        <DrawerTitle>照片导入</DrawerTitle>
                        <DrawerDescription>将照片拖到上面的区域以导入它们。</DrawerDescription>
                    </DrawerHeader>
                    <Input
                        type="text"
                        placeholder="输入文件夹路径"
                        value={folderName}
                        onChange={handleFolderChange}
                        className="mb-4"
                    />
                    <ScrollArea className="h-72 w-full rounded-md border">
                        <div className="p-4">
                            <h4 className="mb-4 text-sm font-medium leading-none">
                                文件列表 - {folderName || "请输入文件夹路径"}
                            </h4>

                            {!isDropped && (
                                <div
                                    id="drop-area"
                                    className="mx-auto flex h-48 w-full max-w-sm items-center justify-center border-2 border-dashed"
                                    onDrop={handleDrop}
                                    onDragOver={handleDragOver}
                                >
                                    <p className="text-center text-gray-500">将文件拖到这里</p>
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
                            <Button onClick={handleSubmit}>提交</Button>
                        </DrawerClose>
                        <Button variant="outline" onClick={handleReset}>
                            重置
                        </Button>
                    </DrawerFooter>
                </div>
            </DrawerContent>
        </Drawer>
    );
}

export default function PhotoImportSubpage() {
    const [photos, setPhotos] = React.useState<Photo[]>([]);

    // 初始化数据库并加载数据
    React.useEffect(() => {
        initializeDatabase();
        const savedPhotos = getPhotos();
        setPhotos(savedPhotos);
    }, []);

    // Effect to load photos from sessionStorage when the component is mounted
    React.useEffect(() => {
        const photoObjectsForState = sessionStorage.getItem("savedPhotoObjectsForState");

        if (photoObjectsForState?.length) {
            const photoObjects: Photo[] =  JSON.parse(photoObjectsForState);
            setPhotos(photoObjects); // Set photos from sessionStorage
        }
    }, []);

    return (
        <div className="min-h-screen p-4">
            <div className="mb-4 flex justify-between">
                <FileImportDrawer setPhotos={setPhotos} />
                <div className="text-right">总张数: {photos.length}</div>
            </div>
            <ScrollArea className="mx-auto h-[80vh] w-[100vw] rounded-md border p-4">
                <PhotoGridEnhance photos={photos} /> {/* Render PhotoGrid with photos */}
            </ScrollArea>
        </div>
    );
}
