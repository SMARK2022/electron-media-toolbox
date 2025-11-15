import asyncio
import io
import os
import sqlite3
import time

import torch
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from packages.LAR_IQA.scripts.utils import infer, load_model, preprocess_image
from PIL import Image
from pydantic import BaseModel
from utils.image_compute import (process_and_group_images)
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
        try:
            while True:
                task = await self.task_queue.get()
                try:
                    async with self.lock:
                        global_state['status'] = f"正在处理: {task['description']}"

                    # 调用包装函数，正确传递参数
                    result = await run_in_threadpool(
                        run_process_and_group,
                        task,
                    )

                    async with self.lock:
                        global_state['status'] = "处理完成"

                except Exception as e:
                    print(f"任务执行错误: {e}")
                    import traceback
                    traceback.print_exc()
                    async with self.lock:
                        global_state['status'] = f"错误: {str(e)}"
                finally:
                    async with self.lock:
                        global_state['task_queue_length'] = self.task_queue.qsize()
                        if global_state['status'] != "处理完成":
                            global_state['status'] = (
                                f"队列中剩余{self.task_queue.qsize()}个任务"
                                if self.task_queue.qsize() > 0
                                else "空闲中"
                            )
                    self.task_queue.task_done()
        except asyncio.CancelledError:
            async with self.lock:
                global_state['status'] = "空闲中"
                global_state['task_queue_length'] = 0


from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()
task_manager = TaskManager()


device = "cuda" if torch.cuda.is_available() else "cpu"
model = load_model(r".\packages\LAR_IQA\checkpoint_epoch_3.pt", False, device)


# 正确设置允许的 CORS 来源
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # 只允许来自 http://localhost:5173 的请求
    allow_credentials=True,
    allow_methods=["*"],  # 允许所有 HTTP 方法
    allow_headers=["*"],  # 允许所有请求头
)


def update_progress(status_text, worker_id=None, value=None, total=None):
    global global_state
    global_state['status'] = status_text
    if worker_id is None:
        global_state["workers"] = []
    else:
        progress = int(value / total * 100)
        # global_state["status"] = f"工作中 ({len(global_state['workers'])} 线程工作)"
        for _ in range(max(worker_id - len(global_state["workers"]) + 1, 0)):
            global_state["workers"].append("0%")
        global_state["workers"][worker_id] = f"{progress}%"
    print(global_state)


def run_process_and_group(task_dict):
    """包装函数，确保参数传递正确"""
    print(f"DEBUG: run_process_and_group received: {type(task_dict)} = {task_dict}")
    if isinstance(task_dict, dict):
        print(f"DEBUG: task_dict keys: {task_dict.keys()}")
    return process_and_group_images(
        db_path=task_dict['db_path'],
        similarity_threshold=task_dict['similarity_threshold'],
        update_progress=update_progress,
        show_disabled_photos=task_dict['show_disabled_photos'],
    )


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

    generate_thumbnails(folder_path, thumbs_path, width, height, update_progress)
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
    print(f"DEBUG: detect_images received data: {data}")

    # 确保 db_path 是字符串，不是字典或其他类型
    db_path = data.get("db_path")
    if not isinstance(db_path, str) or db_path=="{}" or not db_path:
        db_path = "../.cache/photos.db"

    similarity_threshold = data.get("similarity_threshold", 0.8)
    show_disabled_photos = data.get("show_disabled_photos", False)

    print(f"DEBUG: processed db_path={db_path}, threshold={similarity_threshold}, show_disabled={show_disabled_photos}")

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
