import path from "path-browserify";
import { PhotoExtend, Photo } from "@/helpers/ipc/database/db";

// 创建文件夹（跨平台：通过 IPC 委托主进程 fs.mkdirSync，不再走 Windows cmd 的 md 命令）
async function createFolder(folderPath: string): Promise<void> {
  try {
    // 直接传递原始路径，主进程用 fs.mkdirSync({recursive:true}) 实现，
    // 避免在 macOS/Linux 上执行不存在的 Windows shell 命令
    await window.ElectronAPI.createFolder(folderPath);
  } catch (error) {
    // 旧实现用 try/catch 吞掉错误（包括文件夹已存在），保持此不变量
    console.log(`Failed to create folder: ${folderPath}`, error);
  }
}

// 复制文件（跨平台：通过 IPC 委托主进程 fs.copyFileSync，不再走 Windows cmd 的 copy 命令）
async function copyFile(src: string, dest: string): Promise<void> {
  try {
    // src/dest 原样传递，IPC 序列化对 CJK/空格路径透明
    await window.ElectronAPI.copyFile(src, dest);
    console.log(`Copied ${src} to ${dest}`);
  } catch (error) {
    console.error(`Failed to copy file: ${src} to ${dest}`, error);
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
        } catch {
          // 忽略 RAW 副本缺失，主文件已复制即可
        }
      });
      await Promise.all(rawCopyPromises);
    }
  });

  await Promise.all(copyPromises);
}

// 检查文件夹是否存在（跨平台：通过 IPC 委托主进程 fs.existsSync）
async function folderExists(folderPath: string): Promise<boolean> {
  // 旧实现检查引号防 cmd 注入；新 IPC 用 fs API 无注入风险，
  // 且 macOS 文件夹名常含撇号（如 John's Photos），保留检查会导致误报"不存在"
  // 故移除引号校验，直接委托 fs.existsSync
  try {
    return await window.ElectronAPI.folderExists(folderPath);
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
