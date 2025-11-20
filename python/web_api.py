import asyncio
import io
import time
import os
import numpy as np
import cv2

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from utils.image_compute_onnx import process_and_group_images  # 使用 ONNX 版本的图像处理函数
# from utils.image_compute import process_and_group_images  # 使用 ONNX 版本的图像处理函数
from utils.thumbnails import generate_thumbnails, get_thumbnail
from fastapi.middleware.cors import CORSMiddleware

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
            global_state["task_queue_length"] = self.task_queue.qsize()
            global_state["status"] = f"队列中有{self.task_queue.qsize()}个任务"
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
                        global_state["status"] = f"正在处理: {task['description']}"

                    # 调用包装函数，正确传递参数
                    _ = await run_in_threadpool(
                        run_process_and_group,
                        task,
                    )

                    async with self.lock:
                        global_state["status"] = "空闲中"

                except Exception as e:
                    print(f"任务执行错误: {e}")
                    import traceback

                    traceback.print_exc()
                    async with self.lock:
                        global_state["status"] = f"错误: {str(e)}"
                finally:
                    async with self.lock:
                        global_state["task_queue_length"] = self.task_queue.qsize()
                        if global_state["status"] != "空闲中":
                            global_state["status"] = f"队列中剩余{self.task_queue.qsize()}个任务" if self.task_queue.qsize() > 0 else "空闲中"
                    self.task_queue.task_done()
        except asyncio.CancelledError:
            async with self.lock:
                global_state["status"] = "空闲中"
                global_state["task_queue_length"] = 0


app = FastAPI()
task_manager = TaskManager()




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
    global_state["status"] = status_text
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
        db_path=task_dict["db_path"],
        similarity_threshold=task_dict["similarity_threshold"],
        update_progress=update_progress,
        show_disabled_photos=task_dict["show_disabled_photos"],
    )


class StatusResponse(BaseModel):
    status: str
    workers: list
    task_queue_length: int


class ThumbnailTask(BaseModel):
    photo_path: str
    height: int = 256
    width: int = 256


@app.post("/generate_thumbnails")
async def generate_thumbnails_endpoint(request: Request):
    """
    接收前端请求，触发缩略图生成任务。

    请求体 JSON 支持两种格式：
    1) 新格式（推荐）：
       {
         "file_paths": ["E:/photos/1.jpg", "D:/other/2.png", ...],
         "thumbs_path": "...",
         "width": 128,
         "height": 128
       }

    2) 旧格式（向下兼容，不建议继续使用）：
       {
         "folder_path": "E:/photos",
         "thumbs_path": "...",
         "width": 128,
         "height": 128
       }
       此时后端会在 folder_path 下扫描 .jpg/.jpeg/.png/.webp 文件，
       将其转换为 file_paths 列表后再统一处理。
    """
    data = await request.json()

    file_paths = data.get("file_paths")
    thumbs_path = data.get("thumbs_path", "../.cache/.thumbs")
    width = int(data.get("width", 128))
    height = int(data.get("height", 128))

    # 如果新格式的 file_paths 未提供，则尝试兼容旧格式的 folder_path
    if not file_paths:
        folder_path = data.get("folder_path")
        if folder_path and os.path.isdir(folder_path):
            # 从目录中收集所有图片文件
            candidates = [os.path.join(folder_path, f) for f in os.listdir(folder_path) if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp"))]
            file_paths = candidates

    # 如果依旧没有可用文件，直接返回提示信息
    if not file_paths:
        print("No image files found in the request.")
        return {"message": "未发现可处理的图片文件"}

    # 调用实际执行函数（同步执行，内部使用线程池）
    generate_thumbnails(file_paths, thumbs_path, width, height, update_progress)
    return {"message": "缩略图生成任务已添加到后台"}


@app.get("/get_thumbnail")
def get_thumbnail_endpoint(task: ThumbnailTask):
    start_time = time.time()
    img_bytes = get_thumbnail(task.photo_path, task.width, task.height)

    # Convert BMP bytes to numpy array and decode using OpenCV
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if image is None:
        raise RuntimeError(f"Failed to decode thumbnail for {task.photo_path}")

    # Encode to WEBP format
    success, buffer = cv2.imencode('.webp', image)
    if not success:
        raise RuntimeError("Failed to encode image to WEBP format")

    webp_io = io.BytesIO(buffer)
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
    if not isinstance(db_path, str) or db_path == "{}" or not db_path:
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
