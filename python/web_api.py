import asyncio
import io
import os
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List

import cv2
import numpy as np
import torch
import torchvision
from fastapi import BackgroundTasks, FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from packages.LAR_IQA.scripts.utils import infer, load_model, preprocess_image
from PIL import Image
from pydantic import BaseModel
from utils.thumbnails import generate_thumbnails, get_thumbnail

global_state = {
    "status": "空闲中",
    "workers": [],
    "task_queue_length": 0,
}


class TaskManager:
    def __init__(self):
        global global_state
        self.task_queue = asyncio.Queue()
        self.lock = asyncio.Lock()
        self.processing_task = None

    async def add_task(self, task):
        await self.task_queue.put(task)
        async with self.lock:
            global_state['task_queue_length'] = self.task_queue.qsize()
            global_state['status'] = f"队列中有{self.task_queue.qsize()}个任务"
        if not self.processing_task or self.processing_task.done():
            await self.start_processing()

    async def start_processing(self):
        self.processing_task = asyncio.create_task(self.process_tasks())

    async def process_tasks(self):
        global global_state
        while not self.task_queue.empty():
            task = await self.task_queue.get()
            async with self.lock:
                global_state['status'] = f"正在处理: {task['description']}"
            result = await run_in_threadpool(
                lambda: process_and_group_images(
                    db_path=task['db_path'],
                    similarity_threshold=task['similarity_threshold'],
                )
            )
            async with self.lock:
                global_state['task_queue_length'] = self.task_queue.qsize()
                global_state['status'] = (
                    f"队列中剩余{self.task_queue.qsize()}个任务"
                    if self.task_queue.qsize() > 0
                    else "空闲中"
                )
            self.task_queue.task_done()
        async with self.lock:
            global_state['status'] = "空闲中"
            global_state['task_queue_length'] = 0


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
task_manager = TaskManager()


device = "cuda" if torch.cuda.is_available() else "cpu"
model = load_model(".\packages\LAR_IQA\checkpoint_epoch_3.pt", False, device)


# 正确设置允许的 CORS 来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # 只允许来自 http://localhost:5173 的请求
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有 HTTP 方法
    allow_headers=["*"],  # 允许所有请求头
)


def update_progress(workerid, value, total):
    global global_state
    progress = int(value / total * 100)
    global_state["status"] = f"工作中 ({len(global_state['workers'])} 线程工作)"
    for _ in range(max(workerid - len(global_state["workers"]) + 1, 0)):
        global_state["workers"].append("0%")
    global_state["workers"][workerid] = f"{progress}%"
    print(global_state)


def cv_imread(file_path):
    return cv2.imdecode(np.fromfile(file_path, dtype=np.uint8), cv2.IMREAD_COLOR)


def load_cache_from_db(db_path):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT filePath, simRefPath, similarity, IQA
        FROM present
        WHERE isEnabled = 1
    """
    )
    cache_data = {(row[0], row[1]): (row[2], row[3]) for row in cursor.fetchall()}
    conn.close()
    return cache_data


def save_cache_to_db(db_path, cache_data):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    for (file1, file2), (similarity, IQA) in cache_data.items():
        cursor.execute(
            """
            SELECT id FROM present WHERE filePath = ? AND isEnabled = 1
        """,
            (file1,),
        )
        result = cursor.fetchone()
        if result:
            cursor.execute(
                """
                UPDATE present
                SET simRefPath = ?, similarity = ?, IQA = ?
                WHERE id = ?
            """,
                (file2, similarity, IQA, result[0]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO present (fileName, fileUrl, filePath, info, date, groupId, simRefPath, similarity, IQA)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
                (file1, '', file1, '', '', 0, file2, similarity, IQA),
            )
    conn.commit()
    conn.close()


def compute_similarity_and_IQA(img1, img2, img1filename):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    start_time_similarity = time.time()

    def rgb_channel_to_hsv_channel(r, g, b, device):
        maxc = torch.max(torch.stack([r, g, b], dim=0), dim=0)[0]
        minc = torch.min(torch.stack([r, g, b], dim=0), dim=0)[0]
        diff = maxc - minc
        v = maxc
        s = torch.zeros_like(maxc, device=device)
        s[maxc != 0] = diff[maxc != 0] / maxc[maxc != 0]
        h = torch.zeros_like(maxc, device=device)
        mask = diff != 0
        idx = (maxc == r) & mask
        h[idx] = ((g[idx] - b[idx]) / diff[idx]) % 6
        idx = (maxc == g) & mask
        h[idx] = ((b[idx] - r[idx]) / diff[idx]) + 2
        idx = (maxc == b) & mask
        h[idx] = ((r[idx] - g[idx]) / diff[idx]) + 4
        h = h / 6.0
        h = h % 1.0
        return h, s, v

    def calculate_histogram_similarity(img1, img2, bins, device):
        similarities = []
        for i, bin_size in enumerate(bins):
            channel_img1 = img1[i].flatten()
            channel_img2 = img2[i].flatten()
            hist_img1 = torch.histc(channel_img1, bins=bin_size, min=0.0, max=1.0)
            hist_img2 = torch.histc(channel_img2, bins=bin_size, min=0.0, max=1.0)
            # 归一化直方图
            hist_img1 /= hist_img1.sum()
            hist_img2 /= hist_img2.sum()
            # 计算余弦相似度
            similarity = torch.dot(hist_img1, hist_img2).item()
            similarities.append(similarity)
        return sum(similarities) / len(similarities)

    def hsv_similarity(img1, img2, bins, device):
        # 延迟计算 HSV 通道
        r1, g1, b1 = [
            torch.tensor(img1[..., i], dtype=torch.float32, device=device) / 255.0 for i in range(3)
        ]
        r2, g2, b2 = [
            torch.tensor(img2[..., i], dtype=torch.float32, device=device) / 255.0 for i in range(3)
        ]

        h1, s1, v1 = rgb_channel_to_hsv_channel(r1, g1, b1, device)
        h2, s2, v2 = rgb_channel_to_hsv_channel(r2, g2, b2, device)

        # 构建 HSV 图像通道
        hsv_img1 = [h1, s1, v1]
        hsv_img2 = [h2, s2, v2]

        # 删除 RGB 数据
        del r1, g1, b1, r2, g2, b2

        # 计算相似度
        similarity = calculate_histogram_similarity(hsv_img1, hsv_img2, bins, device)

        # 删除 HSV 数据
        del h1, s1, v1, h2, s2, v2
        return similarity

    bins = [90, 128, 128]
    similarity = hsv_similarity(img1, img2, bins, device)
    similarity_time = time.time() - start_time_similarity

    torch.cuda.empty_cache()

    start_time_IQA = time.time()

    image_authentic, image_synthetic = preprocess_image(img1filename, "RGB", device)
    IQA = infer(model, image_authentic, image_synthetic)

    IQA_time = time.time() - start_time_IQA

    torch.cuda.empty_cache()

    print('similarity_time', similarity_time, 'IQA_time', IQA_time)

    return similarity, IQA * 20.0


def process_image_batch(worker_id, image_files, cache_data, db_path):
    previous_image = None
    total_images = len(image_files)

    for idx, file in enumerate(image_files):
        if idx > 0 and (file, image_files[idx - 1]) in cache_data:
            update_progress(worker_id, idx + 1, total_images)
            continue
        elif idx == 0:
            continue

        img = cv_imread(file)

        if idx > 0:
            previous_file = image_files[idx - 1]
            if not previous_image or previous_image[0] != previous_file:
                previous_image = (previous_file, cv_imread(previous_file))

        similarity, IQA = compute_similarity_and_IQA(previous_image[1], img, file)
        cache_data[(file, previous_image[0])] = (similarity, IQA)

        # 实时写入数据库
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT id FROM present WHERE filePath = ?
            """,
            (file,),
        )
        result = cursor.fetchone()
        if result:
            cursor.execute(
                """
                UPDATE present
                SET simRefPath = ?, similarity = ?, IQA = ?
                WHERE id = ?
                """,
                (previous_image[0], similarity, IQA, result[0]),
            )
        else:
            cursor.execute(
                """
                INSERT INTO present (fileName, fileUrl, filePath, info, date, groupId, simRefPath, similarity, IQA)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (file, '', file, '', '', 0, previous_image[0], similarity, IQA),
            )
        conn.commit()
        conn.close()

        previous_image = (file, img)
        update_progress(worker_id, idx + 1, total_images)

    return cache_data


def process_and_group_images(db_path, similarity_threshold):
    start_time = time.time()
    cache_data = load_cache_from_db(db_path)
    image_files = [key[0] for key in cache_data.keys()]
    total_images = len(image_files)
    num_threads = 4
    chunk_size = (total_images + num_threads - 1) // num_threads

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = []
        for i in range(0, total_images, chunk_size):
            chunk_start = i - 1
            chunk_end = min(total_images, i + chunk_size)
            chunk_files = (
                [image_files[-1]] + image_files[0:chunk_end]
                if chunk_start == -1
                else image_files[chunk_start:chunk_end]
            )
            worker_id = i // chunk_size
            futures.append(
                executor.submit(
                    process_image_batch,
                    worker_id,
                    chunk_files,
                    cache_data,
                    db_path,
                )
            )
        similarity_data = {}
        for future in as_completed(futures):
            similarity_data.update(future.result())

    global global_state
    global_state["workers"] = []
    global_state["status"] = "空闲中"

    save_cache_to_db(db_path, cache_data)

    groups = []
    current_group = []

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    for i in range(total_images):
        file1 = image_files[i]
        file2 = image_files[max(0, i - 1)]
        similarity = cache_data.get((file1, file2), (0, 0))[0]

        if i > 0 and similarity < similarity_threshold:
            groups.append(sorted(current_group, key=lambda x: x[2], reverse=True))
            current_group = []

        current_group.append((file1, similarity, cache_data.get((file1, file2), (0, 0))[1]))

        # 实时更新数据库中的分组信息
        cursor.execute(
            """
            UPDATE present
            SET groupId = ?
            WHERE filePath = ? AND isEnabled = 1
            """,
            (len(groups), file1),
        )

        update_progress(0, i + 1, total_images)

    if current_group:
        groups.append(sorted(current_group, key=lambda x: x[2], reverse=True))

    conn.commit()
    conn.close()

    total_time = time.time() - start_time
    average_time_per_image = total_time / total_images if total_images > 0 else 0

    print(f"Total Time: {total_time:.2f} seconds")
    print(f"Average Time per Image: {average_time_per_image:.2f} seconds")

    return groups


class StatusResponse(BaseModel):
    status: str
    workers: list
    task_queue_length: int


class ThumbnailFolderTask(BaseModel):
    folder_path: str
    height: int = 256
    width: int = 256


class ThumbnailTask(BaseModel):
    photo_path: str
    height: int = 256
    width: int = 256


@app.post("/generate_thumbnails")
def generate_thumbnails_endpoint(task: ThumbnailFolderTask):
    generate_thumbnails(task.folder_path, task.width, task.height)
    return {"message": "缩略图生成任务已添加到后台"}


@app.get("/get_thumbnail")
def get_thumbnail_endpoint(task: ThumbnailTask):
    start_time = time.time()
    img_bytes = get_thumbnail(task.photo_path, task.width, task.height)

    # Convert image to webp format
    image = Image.open(io.BytesIO(img_bytes))
    webp_io = io.BytesIO()
    image.save(webp_io, format="WEBP")
    webp_io.seek(0)

    total_time = time.time() - start_time
    print(f"Total Time: {total_time:.2f} seconds")

    return StreamingResponse(webp_io, media_type="image/webp")


@app.get("/status", response_model=StatusResponse)
def get_status():
    return global_state


class DetectionTask(BaseModel):
    # db_path: str
    similarity_threshold: float = 0.8


@app.post("/detect_images")
async def detect_images(task: DetectionTask):
    detection_task = {
        "description": f"图像检测 (阈值: {task.similarity_threshold})",
        "db_path": "../.cache/photos.db",
        "similarity_threshold": task.similarity_threshold,
    }
    await task_manager.add_task(detection_task)
    return {"message": "检测任务已添加到队列"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
