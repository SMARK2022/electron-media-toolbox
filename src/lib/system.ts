import path from "path-browserify";

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

// 创建文件夹函数（允许文件夹已存在，文件夹存在也没问题）
async function createFolder(folderPath: string): Promise<void> {
    try {
        await window.electronAPI.runCommand(`md "${folderPath.replace(/\//g, "\\")}"`, folderPath.split(path.sep)[0] + path.sep);
    } catch (error) {
            console.log(`Failed to create folder: | md "${folderPath.replace(/\//g, "\\")}"`, error);
            // if ((error as any).code !== "EEXIST") {
            //     throw error;
            // }
    }
}

// 复制文件函数
async function copyFile(src: string, dest: string): Promise<void> {
    try {
        await window.electronAPI.runCommand(
            `copy "${src.replace(/\//g, "\\")}" "${dest.replace(/\//g, "\\")}"`,
            path.dirname(dest)
        );
        console.log(`copy "${src.replace(/\//g, "\\")}" "${dest.replace(/\//g, "\\")}"`);
    } catch (error) {
        console.error(
            `Failed to copy file: ${src.replace(/\//g, "\\")} to ${dest.replace(/\//g, "\\")}`,
            error
        );
    }
}

// 创建扩展名修改文件路径生成函数（替换扩展名）
function changeFileExtension(filePath: string, newExtension: string): string {
    return filePath.replace(/\.[^/.]+$/, newExtension);
}

// 创建相册复制函数
async function copyPhotos(
    photos: (Photo | PhotoExtend)[],
    targetFolder: string,
    includeRaw: boolean = true
): Promise<void> {
    console.log(`Copied ${targetFolder}`);
    await createFolder(targetFolder);

    const copyPromises = photos.map(async (photo) => {
        const destPath = path.join(targetFolder, path.basename(photo.filePath));
        console.log(`Copied ${photo.filePath} to ${destPath}`);
        await copyFile(photo.filePath, destPath);

        if (includeRaw) {
            const rawExtensions = [".NEF", ".CR3", ".RAW"];
            const rawCopyPromises = rawExtensions.map(async (ext) => {
                const rawFilePath = changeFileExtension(photo.filePath, ext);
                try {
                    await copyFile(rawFilePath, path.join(targetFolder, path.basename(rawFilePath)));
                } catch (error) {
                    // Ignore errors for missing RAW files
                }
            });
            await Promise.all(rawCopyPromises);
        }
    });

    await Promise.all(copyPromises);
}

export { changeFileExtension, copyFile, copyPhotos, createFolder };
