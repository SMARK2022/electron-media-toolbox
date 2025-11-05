# SMARK Media Tools

## 项目简介 | Project Introduction
本项目是一个媒体工具箱，旨在对图片进行高效的管理、筛选和处理操作。  
This project is a media toolbox designed for efficient management, filtering, and processing of images.

![alt text](assets/gui.png)

用户可能在摄影过程中存在大量的连拍照片，在后期照片筛选时会遇到棘手的难以筛选的问题。因此我创建了这个工具箱，可以直接读入相机存储卡的照片文件夹，经过HSV直方图相似度分组后，根据IQA美学评分进行美观度排序，便于删除。在用户管理照片完成后，进行导出复制到指定文件夹。  
Users may have a large number of burst photos during photography, and it can be difficult to filter them during post-processing. Therefore, I created this toolbox, which can directly read the photo folder from the camera's storage card, group them by HSV histogram similarity, and then sort them by IQA aesthetic score for easy deletion. After users finish managing the photos, they can export and copy them to a specified folder.

我们的项目能够实现：  
- 3ms/frame 的缩略图生成能力  
- 1s/frame 的照片推理与检测能力  

## 目前功能计划 | Current Feature Plan
| 功能 | Feature | Progress | Info |
| --- | --- | --- | --- |
| 实现照片的分组 | Grouping photos | ✅ Done | 24.10.08 Judged by HSV similarity |
| 添加显卡支持 | Add GPU support | ✅ Done | 24.12.02 Using pytorch+cuda |
| 调用更先进的IQA模型 | Use advanced IQA model | ✅ Done | 24.12.16 Using ZJU LAR-IQA no-reference image quality assessment algorithm |
| 配置项、支持页面切换与状态复原 | Configuration options, support page switching and state restoration | ⬜ In Progress | |
| 实现多种指标排序 | Implement multiple criteria sorting | ⬜ Todo | |
| 实现视频的导入与切片保存 | Implement video import and slice saving | ⬜ Todo | |

## 工作栈 | Tech Stack
- Electron + Vite + React + Shadcn
- Python + Torch-CUDA

## 项目结构 | Project Structure
```
└── 📁python
    └── web_api.py
    └── 📁utils
        └── thumbnails.py
└── 📁src
    └── 📁components
        └── CustomSlider.tsx
        └── ImagePreview.tsx
        └── PhotoGrid.tsx
    └── 📁pages
        └── AboutPage.tsx
        └── HomePage.tsx
        └── 📁PhotoFilterPage
            └── PhotoFilterPage.tsx
    └── App.tsx
    └── main.ts
```

## 运行方式 | How to Run
1. 首先运行 Python 的 `web_api.py`：  
   First, run the Python `web_api.py`:
    ```bash
    python python/web_api.py
    ```

2. 然后运行前端项目：  
   Then, run the frontend project:
    ```bash
    npm run start
    ```

## 作者 | Author
<table>
  <tr>
    <td><img src="src/assets/images/avatar.jpg" alt="SMARK's Avatar" width="100" height="100"></td>
    <td>
      <strong>作者:</strong> SMARK<br>
      <strong>Email:</strong> SMARK2019@outlook.com<br>
      <strong>GitHub:</strong> <a href="https://github.com/SMARK">https://github.com/SMARK</a>
    </td>
  </tr>
</table>

## 特别感谢 | Special Thanks
本项目基于 [https://github.com/LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn) 构建。  
This project is based on [https://github.com/LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn).

本项目采用了 [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA) 算法。  
This project uses the [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA) algorithm.


## 许可证 | License
此项目基于 Apache License 2.0 协议发布，详情请参见 LICENSE 文件。  
This project is licensed under the Apache License 2.0. For details, please refer to the LICENSE file.

## 更新日志 | Changelog
- 2025.01.06 发布a1.2版本 更新.vite文件夹，更新vite版本，添加筛选简易功能  
  ---------- Released version a1.2, updated .vite folder, updated vite version, and added simple filtering feature
- 2025.01.06 更新a1.1版本 修复了一些bug，改进了页面布局，并添加了文件夹可用性检测功能  
  ---------- Updated version a1.1, fixed several bugs, improved page layout, and added folder existence checking feature
- 2024.12.23 发布a1.1版本 设置全局语言翻译表，修改启动页，并整理代码  
  ---------- Released version a1.1, set global language translation table, modified the startup page, and organized the code
- 2024.12.22 发布a1.0版本 初始化整个项目，基本实现预期功能  
  ---------- Released version a1.0, initialized the entire project, and basically achieved the expected functions
