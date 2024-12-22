# SMARK Media Tools

## 项目简介 | Project Introduction
本项目是一个媒体工具箱，旨在对图片进行高效的管理、筛选和处理操作。  
This project is a media toolbox designed for efficient management, filtering, and processing of images.

用户可能在摄影过程中存在大量的连拍照片，在后期照片筛选时会遇到棘手的难以筛选的问题。因此我创建了这个工具箱，可以直接读入相机存储卡的照片文件夹，经过HSV直方图相似度分组后，根据IQA美学评分进行美观度排序，便于删除。在用户管理照片完成后，进行导出复制到指定文件夹。  
Users may have a large number of burst photos during photography, and it can be difficult to filter them during post-processing. Therefore, I created this toolbox, which can directly read the photo folder from the camera's storage card, group them by HSV histogram similarity, and then sort them by IQA aesthetic score for easy deletion. After users finish managing the photos, they can export and copy them to a specified folder.

我们的项目能够实现：  
Our project can achieve:
- 3ms/frame 的缩略图生成能力  
  3ms/frame thumbnail generation capability
- 1s/frame 的照片推理与检测能力  
  1s/frame photo inference and detection capability

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
本项目基于 [https://github.com/LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn) 制作，特别感谢。  
This project is based on [https://github.com/LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn). Special thanks.

特别感谢 [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA) 的工作。  
Special thanks to the work of [https://github.com/nasimjamshidi/LAR-IQA](https://github.com/nasimjamshidi/LAR-IQA).

@article{avanaki2024lar,  
  title={LAR-IQA: A Lightweight, Accurate, and Robust No-Reference Image Quality Assessment Model},  
  author={Avanaki, Nasim Jamshidi and Ghildyal, Abhijay and Barman, Nabajeet and Zadtootaghaj, Saman},  
  journal={arXiv preprint arXiv:2408.17057},  
  year={2024}  
}

## 许可证 | License
此项目基于 Apache License 2.0 协议发布，详情请参见 LICENSE 文件。  
This project is licensed under the Apache License 2.0. For details, please refer to the LICENSE file.
