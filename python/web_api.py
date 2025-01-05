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
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from packages.LAR_IQA.scripts.utils import infer, load_model, preprocess_image
from PIL import Image
from pydantic import BaseModel
from utils.thumbnails import generate_thumbnails, get_thumbnail
from utils.image_compute import (
    compute_similarity_and_IQA,
    process_image_batch,
    process_and_group_images,
    cv_imread
)
from utils.database import load_cache_from_db, save_cache_to_db, update_group_id_in_db

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
                    update_progress=update_progress,
                    update_status=update_status,
                    show_disabled_photos=task['show_disabled_photos']
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


def update_status(new_status):
    global global_state
    global_state['status'] = new_status
    print(global_state)


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
async def generate_thumbnails_endpoint(request: Request):
    data = await request.json()
    folder_path = data.get("folder_path")
    thumbs_path = data.get("thumbs_path", "../.cache/.thumbs")  # Default path if not provided
    width = data.get("width", 128)
    height = data.get("height", 128)

    generate_thumbnails(folder_path, thumbs_path, width, height)
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
    print("get_status", global_state)
    return global_state


class DetectionTask(BaseModel):
    # db_path: str
    similarity_threshold: float = 0.8


@app.post("/detect_images")
async def detect_images(request: Request):
    data = await request.json()
    db_path = data.get("db_path", "../.cache/photos.db")  # Default path if not provided
    similarity_threshold = data.get("similarity_threshold", 0.8)
    show_disabled_photos = data.get("show_disabled_photos", False)

    detection_task = {
        "description": f"图像检测 (阈值: {similarity_threshold})",
        "db_path": db_path,
        "similarity_threshold": similarity_threshold,
        "show_disabled_photos": show_disabled_photos,
    }
    await task_manager.add_task(detection_task)
    return {"message": "检测任务已添加到队列"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
