import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: {
      translation: {
        page: {
          title: "Home Page",
          description: "This is an example of translation in en",
        },
        instructions: {
          importPhotos:
            "Import photos on the import page, then filter photos on the filter page, and finally select the photos you need.",
        },
        status: {
          checking: "Checking server status",
          backendRunning: "Python backend is running",
          backendNotRunning: "Python backend is not running",
          exportingPhotos: "Exporting Photos",
          exportComplete: "Export Complete",
          exportInProgress:
            "The program is saving, it will take a long time to respond, please be patient.",
          exportSuccess: "Photos have been successfully exported!",
        },
        navigation: {
          home: "Home",
          import: "Import",
          filter: "Filter",
          export: "Export",
          settings: "Settings",
          about: "About",
          testing: "Testing",
        },
        pageDescriptions: {
          home: "Manage your photos in the gallery.",
          import: "Upload your photos to the gallery for management.",
          filter: "Filter and view your photo collection by criteria.",
          export: "Export your photos to local or other platforms.",
          settings: "Configure application features and preferences.",
          about: "Learn more about this application.",
          testing: "Test the features of this application.",
        },
        buttons: {
          importPhotos: "Import Photos",
          submit: "Submit",
          reset: "Reset",
          exportPhotos: "Export Photos",
          close: "Close",
        },
        modals: {
          photoImport: {
            title: "Photo Import",
            description: "Drag and drop photos above to import them.",
          },
        },
        placeholders: {
          enterFolderPath: "Enter folder path",
          detectedFolder: "Detected folder path",
        },
        labels: {
          fileList: "File List",
          dropFilesHere: "Drop files here",
          dropInvalidFiles: "Contains invalid files, please reselect",
          totalPhotos: "Total Photos",
          author: "Author",
          email: "Email",
          totalPhotosLabel: "Total Photos",
        },
        about: {
          pageTitle: "About Page",
          personalInfo: "Personal Information",
          toolboxDescription: "This is the media toolbox designed by SMARK",
          contactInfo:
            "If you have any questions or suggestions, please feel free to contact me. Thank you for using!",
          basedOnProject: "Based on project",
          build: "build",
          adoptedProject: "Adopted project",
        },
        settings: {
          notAvailable:
            "In the development phase, no configuration items have been applied yet, all are test",
          cacheDirectory: "Cache Directory",
          enterCacheDirectory: "Enter cache directory",
          workerThreads: "Worker Threads",
          enterWorkerThreads: "Enter number of worker threads",
          updateSettings: "Update Settings",
        },
        updateChecker: {
          title: "Application Version",
          currentVersion: "Current:",
          latestVersion: "Latest:",
          checking: "Checking GitHub updates…",
          upToDate: "You are on the latest version",
          updateAvailable: "New version available, open GitHub",
          error: "Update check failed (click to retry)",
        },
      },
    },
    zh: {
      translation: {
        page: {
          title: "主页",
          description: "这是一个中文翻译示例",
        },
        instructions: {
          importPhotos:
            "在导入页面中导入照片，然后在筛选页面中进行照片筛选，最终筛选出您需要的照片。",
        },
        status: {
          checking: "检查服务器状态中",
          backendRunning: "Python后端已启动",
          backendNotRunning: "Python后端未启动",
          exportingPhotos: "正在导出照片",
          exportComplete: "导出完成",
          exportInProgress: "程序正在保存中，将会耗时较长未响应，请耐心等待。",
          exportSuccess: "照片已成功导出！",
        },
        navigation: {
          home: "首页",
          import: "导入",
          filter: "筛选",
          export: "导出",
          settings: "设置",
          about: "关于",
          testing: "测试",
        },
        pageDescriptions: {
          home: "在图库中管理您的照片。",
          import: "上传您的照片到图库中进行管理。",
          filter: "按条件筛选和查看您的照片集合。",
          export: "将您的照片导出到本地或其他平台。",
          settings: "配置应用程序的功能与偏好设置。",
          about: "了解更多关于此应用程序的信息。",
          testing: "测试此应用程序的功能。",
        },
        buttons: {
          importPhotos: "导入照片",
          submit: "提交",
          reset: "重置",
          exportPhotos: "导出照片",
          close: "关闭",
        },
        modals: {
          photoImport: {
            title: "照片导入",
            description: "将照片拖到上面的区域以导入它们。",
          },
        },
        placeholders: {
          enterFolderPath: "输入文件夹路径",
          detectedFolder: "文件夹已自动读取",
        },
        labels: {
          fileList: "文件列表",
          dropFilesHere: "将文件拖到这里",
          dropInvalidFiles: "包含无效文件，请重新选择",
          totalPhotos: "总张数",
          author: "作者",
          email: "邮箱",
          totalPhotosLabel: "总张数",
        },
        about: {
          pageTitle: "关于页面",
          personalInfo: "个人信息",
          toolboxDescription: "这是由SMARK构建的媒体工具箱",
          contactInfo: "如果您有任何问题或建议，请随时联系我。 感谢您的使用！",
          basedOnProject: "本项目基于",
          build: "构建",
          adoptedProject: "本项目采用了",
        },
        settings: {
          notAvailable: "目前开发阶段，还没有应用任何设置配置项",
          cacheDirectory: "缓存目录",
          enterCacheDirectory: "请输入缓存目录",
          workerThreads: "工作线程数",
          enterWorkerThreads: "请输入工作线程数",
          updateSettings: "更新设置",
        },
        updateChecker: {
          title: "应用版本",
          currentVersion: "当前：",
          latestVersion: "最新：",
          checking: "正在检查 GitHub 更新…",
          upToDate: "当前已是最新版本",
          updateAvailable: "发现新版本，前往 GitHub 下载",
          error: "检查更新失败（点击重试）",
        },
      },
    },
  },
});
