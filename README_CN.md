# SMARK Media Tools

## 项目简介
本项目是一个媒体工具箱，旨在对图片进行高效的管理、筛选和处理操作。  
用户可能在摄影过程中存在大量的连拍照片，在后期照片筛选时会遇到棘手的难以筛选的问题。因此我创建了这个工具箱，可以直接读入相机存储卡的照片文件夹，经过HSV直方图相似度分组后，根据IQA美学评分进行美观度排序，便于删除。在用户管理照片完成后，进行导出复制到指定文件夹。

我们的项目能够实现：  
- 3ms/frame 的缩略图生成能力  
- 1s/frame 的照片推理与检测能力  

## 目前功能计划

| 功能 | 完成进度 | 信息 |
| --- | --- | --- |
| 实现照片的分组 | ✅ 已完成 | 24.10.08 根据HSV相似度进行判断 |
| 添加显卡支持 | ✅ 已完成 | 24.12.02 使用pytorch+cuda |
| 调用更先进的IQA模型 | ✅ 已完成 | 24.12.16 使用浙大LAR-IQA无参图像评价算法 |
| 图片便捷筛选与恢复 | 🚧 进行中 | 25.03.20 已添加简易的图片增删功能 |
| 配置项、支持页面切换与状态复原 | ⬜ 未完成 | |
| 实现多种指标排序 | ⬜ 未完成 | |
| 实现视频的导入与切片保存 | ⬜ 未完成 | |

## 工作栈
- Electron + Vite + React + Shadcn
- Python + Torch-CUDA

## 项目结构
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

## 运行方式
1. 首先运行 Python 的 `web_api.py`：
    ```bash
    python python/web_api.py
    ```

2. 然后运行前端项目：
    ```bash
    npm run start
    ```

## 作者
<table>
  <tr>
    <td><img src="src/assets/images/avatar.jpg" alt="SMARK's Avatar" width="100" height="100"></td>
    <td>
      <strong>作者:</strong> SMARK<br>
      <strong>邮箱:</strong> SMARK2019@outlook.com<br>
      <strong>GitHub:</strong> <a href="https://github.com/SMARK">https://github.com/SMARK</a>
    </td>
  </tr>
</table>

## 特别感谢
本项目基于 [https://github.com/LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn) 制作，特别感谢。  
本项目采用了 [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA) 算法。

## 许可证
此项目基于 Apache License 2.0 协议发布，详情请参见 LICENSE 文件。

## 更新日志
- 2025.11.06 发布a1.3版本 修正electron-forge与vite打包导致的依赖项缺失问题，修复若干 bug，并发布 electron 打包后的 release
- 2025.01.06 发布a1.2版本 更新.vite文件夹，更新vite版本，添加筛选简易功能  
- 2025.01.06 更新a1.1版本 修复了一些bug，改进了页面布局，并添加了文件夹可用性检测功能  
- 2024.12.23 发布a1.1版本 设置全局语言翻译表，修改启动页，并整理代码  
- 2024.12.22 发布a1.0版本 初始化整个项目，基本实现预期功能
