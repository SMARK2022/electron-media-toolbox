# SMARK Media Tools

## 项目简介
本项目是一个媒体工具箱，旨在对图片进行高效的管理、筛选和处理操作。
本项目由 Electron、React 和 Python 等技术协同构建，致力于为用户提供一站式的图片处理与管理功能，支持批量导入、筛选和对图片进行相似度与质量分析。借助数据库技术，实现对各类元数据和编辑记录的持久化管理，方便日后回溯与检索。

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

## 许可证
此项目基于 Apache License 2.0 协议发布，详情请参见 LICENSE 文件。
