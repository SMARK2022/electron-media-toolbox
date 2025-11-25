import path from "path-browserify";
import { PhotoExtend, Photo } from "@/helpers/ipc/database/db";

// 创建文件夹函数（允许文件夹已存在，文件夹存在也没问题）
async function createFolder(folderPath: string): Promise<void> {
  try {
    await window.ElectronAPI.runCommand(
      `md "${folderPath.replace(/\//g, "\\")}"`,
      folderPath.split(path.sep)[0] + path.sep,
    );
  } catch (error) {
    console.log(
      `Failed to create folder: | md "${folderPath.replace(/\//g, "\\")}"`,
      error,
    );
    // if ((error as any).code !== "EEXIST") {
    //     throw error;
    // }
  }
}

// 复制文件函数
async function copyFile(src: string, dest: string): Promise<void> {
  try {
    await window.ElectronAPI.runCommand(
      `copy "${src.replace(/\//g, "\\")}" "${dest.replace(/\//g, "\\")}"`,
      path.dirname(dest),
    );
    console.log(
      `copy "${src.replace(/\//g, "\\")}" "${dest.replace(/\//g, "\\")}"`,
    );
  } catch (error) {
    console.error(
      `Failed to copy file: ${src.replace(/\//g, "\\")} to ${dest.replace(/\//g, "\\")}`,
      error,
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
  includeRaw: boolean = true,
): Promise<void> {
  console.log(`Copied ${targetFolder}`);
  await createFolder(targetFolder);

  const copyPromises = photos.map(async (photo) => {
    const destPath = path.join(targetFolder, path.basename(photo.filePath));
    console.log(`Copied ${photo.filePath} to ${destPath}`);
    await copyFile(photo.filePath, destPath);

    if (includeRaw) {
      const rawExtensions = [".NEF", ".CR3", ".RAW", ".ARW", ".DNG", ".dng"];
      const rawCopyPromises = rawExtensions.map(async (ext) => {
        const rawFilePath = changeFileExtension(photo.filePath, ext);
        try {
          await copyFile(
            rawFilePath,
            path.join(targetFolder, path.basename(rawFilePath)),
          );
        } catch (error) {
          // Ignore errors for missing RAW files
        }
      });
      await Promise.all(rawCopyPromises);
    }
  });

  await Promise.all(copyPromises);
}

// Function to check if a folder exists
async function folderExists(folderPath: string): Promise<boolean> {
  // Validate the folder path to prevent command injection by checking for quotes
  if (folderPath.includes('"') || folderPath.includes("'")) {
    console.error("Invalid folder path: path cannot contain quotes");
    return false;
  }

  try {
    const command = `if exist "${folderPath.replace(/\//g, "\\")}" (echo true) else (echo false)`;
    const result = await window.ElectronAPI.runCommand(command);
    return String(result).trim() === "true"; // Convert result to string before using trim
  } catch (error) {
    console.error("Error checking folder existence:", error);
    return false;
  }
}

export {
  changeFileExtension,
  copyFile,
  copyPhotos,
  createFolder,
  folderExists,
};
