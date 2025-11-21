# web_api.py 顶部第一行就放这几个 import
import os
import sys
import traceback
from datetime import datetime

# ============================
# 环境检测 & 日志基础设施
# ============================

# 判断是否为 Nuitka 编译环境（onefile/standalone 都会有 __compiled__）
IS_COMPILED = "__compiled__" in globals()

# 日志写到 exe 同目录，onefile 模式下就是 web_api.exe 旁边
_LOG_PATH = os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), "web_api_runtime.log")


def _log(msg: str) -> None:
    """简单文件日志 +（开发阶段）控制台输出."""
    try:
        if not isinstance(msg, str):
            msg = str(msg)
        ts_msg = f"[{datetime.now().isoformat()}] {msg}"

        # 开发阶段：打印到控制台
        if not IS_COMPILED:
            try:
                print(ts_msg, flush=True)
            except Exception:
                pass

        # 无论是否编译，都写入文件，方便排错
        try:
            with open(_LOG_PATH, "a", encoding="utf-8") as f:
                f.write(ts_msg + "\n")
        except Exception:
            # 连日志都写不了就算了，避免死循环
            pass
    except Exception:
        # 兜底，保证 _log 本身不会抛异常
        pass


def _excepthook(exc_type, exc, tb):
    """全局未捕获异常 -> 写入 log 文件."""
    try:
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write("\n===== UNCAUGHT EXCEPTION =====\n")
            traceback.print_exception(exc_type, exc, tb, file=f)
            f.write("===== END EXCEPTION =====\n\n")
    except Exception:
        pass


# 安装全局异常钩子
sys.excepthook = _excepthook

_log("Python runtime started.")


# ============================
# 正文 import
# ============================

import asyncio
import io
import time
import numpy as np
import cv2

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

from utils.image_compute_onnx import process_and_group_images  # 使用 ONNX 版本的图像处理函数
from utils.thumbnails import generate_thumbnails, get_thumbnail


# ============================
# 全局状态 & 任务管理
# ============================

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
                    _log(f"[TaskManager] 开始处理任务: {task}")

                    # 调用包装函数，正确传递参数
                    _ = await run_in_threadpool(
                        run_process_and_group,
                        task,
                    )

                    async with self.lock:
                        global_state["status"] = "空闲中"
                        _log("[TaskManager] 任务处理完成")

                except Exception as e:
                    _log(f"[TaskManager] 任务执行错误: {e}")
                    _log(traceback.format_exc())
                    async with self.lock:
                        global_state["status"] = f"错误: {str(e)}"
                finally:
                    async with self.lock:
                        global_state["task_queue_length"] = self.task_queue.qsize()
                        if global_state["status"] != "空闲中":
                            global_state["status"] = f"队列中剩余{self.task_queue.qsize()}个任务" if self.task_queue.qsize() > 0 else "空闲中"
                    self.task_queue.task_done()
        except asyncio.CancelledError:
            _log("[TaskManager] process_tasks 被取消")
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
    _log(f"[Progress] {global_state}")


def run_process_and_group(task_dict):
    """包装函数，确保参数传递正确"""
    _log(f"DEBUG: run_process_and_group received: {type(task_dict)} = {task_dict}")
    if isinstance(task_dict, dict):
        _log(f"DEBUG: task_dict keys: {list(task_dict.keys())}")
    return process_and_group_images(
        db_path=task_dict["db_path"],
        similarity_threshold=task_dict["similarity_threshold"],
        update_progress=update_progress,
        show_disabled_photos=task_dict["show_disabled_photos"],
    )


# ============================
# Pydantic 模型
# ============================


class StatusResponse(BaseModel):
    status: str
    workers: list
    task_queue_length: int


class ThumbnailTask(BaseModel):
    photo_path: str
    height: int = 256
    width: int = 256


class DetectionTask(BaseModel):
    similarity_threshold: float = 0.8


# ============================
# API 路由
# ============================


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
    _log(f"[generate_thumbnails] 请求数据: {data}")

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
        _log("[generate_thumbnails] No image files found in the request.")
        return {"message": "未发现可处理的图片文件"}

    # 调用实际执行函数（同步执行，内部使用线程池）
    generate_thumbnails(file_paths, thumbs_path, width, height, update_progress)
    return {"message": "缩略图生成任务已添加到后台"}


@app.get("/get_thumbnail")
def get_thumbnail_endpoint(task: ThumbnailTask):
    start_time = time.time()
    _log(f"[get_thumbnail] 请求: {task}")

    img_bytes = get_thumbnail(task.photo_path, task.width, task.height)

    # Convert BMP bytes to numpy array and decode using OpenCV
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if image is None:
        raise RuntimeError(f"Failed to decode thumbnail for {task.photo_path}")

    # Encode to WEBP format
    success, buffer = cv2.imencode(".webp", image)
    if not success:
        raise RuntimeError("Failed to encode image to WEBP format")

    webp_io = io.BytesIO(buffer)
    webp_io.seek(0)

    total_time = time.time() - start_time
    _log(f"[get_thumbnail] Total Time: {total_time:.2f} seconds")

    return StreamingResponse(webp_io, media_type="image/webp")


@app.get("/status", response_model=StatusResponse)
def get_status():
    _log(f"[status] {global_state}")
    return global_state


@app.post("/detect_images")
async def detect_images(request: Request):
    data = await request.json()
    _log(f"[detect_images] 收到请求: {data}")

    # 确保 db_path 是字符串，不是字典或其他类型
    db_path = data.get("db_path")
    if not isinstance(db_path, str) or db_path == "{}" or not db_path:
        db_path = "../.cache/photos.db"

    similarity_threshold = data.get("similarity_threshold", 0.8)
    show_disabled_photos = data.get("show_disabled_photos", False)

    _log(f"[detect_images] 处理后参数: db_path={db_path}, threshold={similarity_threshold}, show_disabled={show_disabled_photos}")

    detection_task = {
        "description": f"图像检测 (阈值: {similarity_threshold})",
        "db_path": db_path,
        "similarity_threshold": similarity_threshold,
        "show_disabled_photos": show_disabled_photos,
    }
    await task_manager.add_task(detection_task)
    return {"message": "检测任务已添加到队列"}


# ============================
# 入口：开发环境 vs 编译后环境
# ============================

if __name__ == "__main__":
    try:
        import uvicorn

        _log("[MAIN] __main__ block entered, starting uvicorn...")

        # 对于 Nuitka onefile/standalone：使用自定义 log_config，避免 uvicorn 默认 formatter 崩溃
        if IS_COMPILED:
            _log("[MAIN] Detected compiled environment, using file-only log_config for uvicorn.")

            log_config = {
                "version": 1,
                "disable_existing_loggers": False,
                "formatters": {
                    "default": {
                        "format": "%(levelname)s:%(name)s:%(message)s",
                    }
                },
                "handlers": {
                    "file": {
                        "class": "logging.FileHandler",
                        "filename": _LOG_PATH,
                        "mode": "a",
                        "formatter": "default",
                    },
                },
                "loggers": {
                    # uvicorn 主 logger
                    "uvicorn": {
                        "handlers": ["file"],
                        "level": "INFO",
                        "propagate": False,
                    },
                    "uvicorn.error": {
                        "handlers": ["file"],
                        "level": "INFO",
                        "propagate": False,
                    },
                    "uvicorn.access": {
                        "handlers": ["file"],
                        "level": "INFO",
                        "propagate": False,
                    },
                },
                "root": {
                    "handlers": ["file"],
                    "level": "INFO",
                },
            }

            uvicorn.run(
                app,
                host="0.0.0.0",
                port=8000,
                reload=False,
                log_config=log_config,
            )
        else:
            # 开发环境：用 uvicorn 默认日志配置，在控制台看 log 即可
            uvicorn.run(
                app,
                host="0.0.0.0",
                port=8000,
                reload=False,
            )

    except Exception:
        _log("[MAIN] Exception in uvicorn.run, see traceback below.")
        traceback.print_exc()
