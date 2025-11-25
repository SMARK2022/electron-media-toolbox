import threading
from pathlib import Path
from typing import Dict, List, Tuple, Optional

import numpy as np
import onnxruntime as ort
import cv2
import sys
import inspect

import insightface

# 控制是否启用人脸检测的全局开关（数据库字段仍会保留）
ENABLE_FACE_DETECTION: bool = True


def _select_ort_providers() -> List[str]:
    """选择最合适的 ONNX Runtime 执行后端。

    优先级：
    1. CUDAExecutionProvider
    2. DmlExecutionProvider (DirectML, 适合 Windows + DX12 显卡)
    3. CPUExecutionProvider
    """
    providers = ort.get_available_providers()
    if "CUDAExecutionProvider" in providers:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    if "DmlExecutionProvider" in providers:
        return ["DmlExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


def get_resource_path(relative_path: str) -> Path:
    """获取资源文件的绝对路径（支持 onefile 打包）"""
    if getattr(sys, "frozen", False):
        # 打包后的环境
        if hasattr(sys, "_MEIPASS"):
            # PyInstaller 风格
            base_path = Path(sys._MEIPASS)
        else:
            # Nuitka 风格：使用 exe 所在目录
            base_path = Path(sys.executable).parent
    else:
        # 开发环境
        base_path = Path(__file__).resolve().parent / ".."

    return base_path / relative_path


class _DummyIqaSession:
    """当 ONNX 模型不可用时的兜底 Session，避免程序直接崩溃。"""

    def run(self, *args, **kwargs):
        # 返回与真实模型相容的形状：第一个输出应当是可转换为标量的数组
        return [np.array([0.0], dtype=np.float32)]


# ============================================================================
# IQA 模型相关全局变量
# ============================================================================
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)

_IQA_CHECKPOINT_ONNX = Path(get_resource_path("checkpoint/lar_iqa.onnx"))
_IQA_SESSION: Optional[ort.InferenceSession] = None
_IQA_SESSION_CPU: Optional[ort.InferenceSession] = None
_IQA_INPUT_NAMES: List[str] = []
_IQA_RUN_LOCK = threading.Lock()
_IQA_IS_DML = False

# ============================================================================
# 人脸检测模型相关全局变量
# ============================================================================
_FACE_DET_MODEL_PATH = Path(get_resource_path("checkpoint/det_500m.onnx"))
_FACE_DETECTOR = None
_FACE_DET_PROVIDERS: List[str] = []
_FACE_DET_LOCK = threading.Lock()
_FACE_DET_IS_DML = False


def _init_iqa_sessions_if_needed() -> None:
    """懒加载方式初始化 IQA ONNX Session。"""
    global _IQA_SESSION, _IQA_SESSION_CPU, _IQA_INPUT_NAMES, _IQA_IS_DML

    if _IQA_SESSION is not None and _IQA_SESSION_CPU is not None and _IQA_INPUT_NAMES:
        return

    if not _IQA_CHECKPOINT_ONNX.exists():
        print(f"[IQA] ONNX model not found at {_IQA_CHECKPOINT_ONNX}. IQA will be disabled (using dummy session).")
        _IQA_SESSION = _DummyIqaSession()
        _IQA_SESSION_CPU = _IQA_SESSION
        _IQA_INPUT_NAMES = ["input_authentic", "input_synthetic"]
        _IQA_IS_DML = False
        return

    try:
        providers = _select_ort_providers()

        # ---- GPU / DirectML Session Options ----
        _session_options = ort.SessionOptions()
        if "DmlExecutionProvider" in providers:
            # DirectML 不支持 mem pattern + 并行执行，需要串行执行模式
            _session_options.enable_mem_pattern = False
            _session_options.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
            # 关闭图优化以避免 DmlFusedNode 等 fuse 导致崩溃
            _session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
        else:
            _session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        _IQA_SESSION = ort.InferenceSession(
            str(_IQA_CHECKPOINT_ONNX),
            sess_options=_session_options,
            providers=providers,
        )

        _IQA_INPUT_NAMES = [inp.name for inp in _IQA_SESSION.get_inputs()]
        _IQA_IS_DML = "DmlExecutionProvider" in _IQA_SESSION.get_providers()
        print(f"[IQA] Loaded ONNX model from {_IQA_CHECKPOINT_ONNX}, providers={_IQA_SESSION.get_providers()}, inputs={_IQA_INPUT_NAMES}")

        # ---- CPU Fallback Session ----
        _cpu_so = ort.SessionOptions()
        _cpu_so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _IQA_SESSION_CPU = ort.InferenceSession(
            str(_IQA_CHECKPOINT_ONNX),
            sess_options=_cpu_so,
            providers=["CPUExecutionProvider"],
        )

    except Exception as e:  # noqa: BLE001
        print(f"[IQA] Failed to create ONNX Runtime session ({e}). Falling back to dummy session to avoid crash.")
        _IQA_SESSION = _DummyIqaSession()
        _IQA_SESSION_CPU = _IQA_SESSION
        _IQA_INPUT_NAMES = ["input_authentic", "input_synthetic"]
        _IQA_IS_DML = False


def _select_face_providers() -> List[str]:
    """为人脸检测选择最合适的 ONNX Runtime 执行后端。

    优先级：
    1. DmlExecutionProvider (优先，适合 Windows + DX12)
    2. CUDAExecutionProvider
    3. CPUExecutionProvider
    """
    providers = ort.get_available_providers()
    if "DmlExecutionProvider" in providers:
        return ["DmlExecutionProvider", "CPUExecutionProvider"]
    if "CUDAExecutionProvider" in providers:
        return ["CUDAExecutionProvider", "CPUExecutionProvider"]
    return ["CPUExecutionProvider"]


def _init_face_detector_if_needed() -> None:
    """懒加载人脸检测器 (SCRFD det_500m.onnx)。"""
    global _FACE_DETECTOR, _FACE_DET_PROVIDERS, _FACE_DET_IS_DML

    if _FACE_DETECTOR is not None:
        return

    if not _FACE_DET_MODEL_PATH.exists():
        print(f"[FACE] det_500m.onnx not found at {_FACE_DET_MODEL_PATH}, face detection disabled.")
        _FACE_DETECTOR = None
        _FACE_DET_PROVIDERS = []
        _FACE_DET_IS_DML = False
        return

    try:
        providers = _select_face_providers()
        _FACE_DET_PROVIDERS = providers
        _FACE_DET_IS_DML = "DmlExecutionProvider" in providers
        print(f"[FACE] providers={providers}, is_dml={_FACE_DET_IS_DML}")

        # insightface 的 get_model 会创建 ORT Session，并使用传入 providers
        _FACE_DETECTOR = insightface.model_zoo.get_model(str(_FACE_DET_MODEL_PATH), providers=providers)

        # 兼容不同版本 prepare 参数
        sig = inspect.signature(_FACE_DETECTOR.prepare)
        kw = {}
        if "ctx_id" in sig.parameters:
            # DirectML / CPU 用 -1，CUDA 用 0
            use_cuda = "CUDAExecutionProvider" in providers
            kw["ctx_id"] = 0 if use_cuda else -1
        if "input_size" in sig.parameters:
            kw["input_size"] = (640, 640)
        if "det_size" in sig.parameters:
            kw["det_size"] = (640, 640)
        if "det_thresh" in sig.parameters:
            kw["det_thresh"] = 0.5
        if "nms_thresh" in sig.parameters:
            kw["nms_thresh"] = 0.4

        _FACE_DETECTOR.prepare(**kw)

        # 某些版本把阈值存在 det_thresh 属性里（没有就忽略）
        if hasattr(_FACE_DETECTOR, "det_thresh"):
            _FACE_DETECTOR.det_thresh = 0.5

        print("[FACE] Face detector initialized successfully.")

    except Exception as e:  # noqa: BLE001
        print(f"[FACE] Failed to initialize face detector ({e}). Face detection disabled.")
        _FACE_DETECTOR = None
        _FACE_DET_PROVIDERS = []
        _FACE_DET_IS_DML = False


def preprocess_iqa_from_bgr(
    img_bgr: np.ndarray,
    color_space: str = "RGB",
) -> Tuple[np.ndarray, np.ndarray]:
    """根据 IQA 模型需求，对 BGR 图像做前处理，输出两个 NCHW Tensor。

    - BGR -> RGB
    - authentic 分支: Resize 到 384x384
    - synthetic 分支: CenterCrop 到 1280x1280
    - 归一化 & 标准化
    """
    # BGR -> RGB
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    if color_space == "RGB":
        working = img_rgb
    else:
        raise ValueError(
            f"Unsupported color_space: {color_space}. Only 'RGB' is supported in IQA pipeline.",
        )

    # authentic 分支：Resize 到 384x384
    authentic = cv2.resize(
        working,
        (384, 384),
        interpolation=cv2.INTER_AREA,
    )

    # synthetic 分支：CenterCrop 到 1280x1280（先对原图操作）
    h, w, _ = working.shape
    crop_size = 1280
    if h < crop_size or w < crop_size:
        # 模拟 torchvision CenterCrop 对"小图"的行为：
        # 先将短边缩放到 1280，再中心裁剪
        scale = crop_size / min(h, w)
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))
        resized = cv2.resize(working, (new_w, new_h), interpolation=cv2.INTER_AREA)
        h, w, _ = resized.shape
        y0 = max((h - crop_size) // 2, 0)
        x0 = max((w - crop_size) // 2, 0)
        synthetic = resized[y0 : y0 + crop_size, x0 : x0 + crop_size]
    else:
        y0 = (h - crop_size) // 2
        x0 = (w - crop_size) // 2
        synthetic = working[y0 : y0 + crop_size, x0 : x0 + crop_size]

    def _to_nchw_normalized(img: np.ndarray) -> np.ndarray:
        # HWC uint8 -> float32 [0,1]
        arr = img.astype(np.float32) / 255.0
        # Normalize
        arr = (arr - _IMAGENET_MEAN) / _IMAGENET_STD
        # HWC -> NCHW
        arr = np.transpose(arr, (2, 0, 1))
        # [1, C, H, W]
        return arr[None, :, :, :].astype(np.float32)

    image_authentic = _to_nchw_normalized(authentic)
    image_synthetic = _to_nchw_normalized(synthetic)
    return image_authentic, image_synthetic


def infer_iqa_from_bgr(img_bgr: np.ndarray, color_space: str = "RGB") -> float:
    """直接从 BGR 图像计算 IQA 分数，返回标量评分（已 *20）。"""
    _init_iqa_sessions_if_needed()

    if len(_IQA_INPUT_NAMES) != 2:
        raise RuntimeError(f"Expected IQA ONNX model with 2 inputs, got {_IQA_INPUT_NAMES}")

    image_authentic, image_synthetic = preprocess_iqa_from_bgr(img_bgr, color_space=color_space)

    inputs: Dict[str, np.ndarray] = {
        _IQA_INPUT_NAMES[0]: image_authentic,
        _IQA_INPUT_NAMES[1]: image_synthetic,
    }

    try:
        if _IQA_IS_DML:
            # DirectML Session 不允许多线程并发 Run，必须串行化
            with _IQA_RUN_LOCK:
                outputs = _IQA_SESSION.run(None, inputs)
        else:
            outputs = _IQA_SESSION.run(None, inputs)
    except Exception as e:  # noqa: BLE001
        print(f"[IQA] GPU/DirectML inference failed ({e}), falling back to CPUExecutionProvider.")
        outputs = _IQA_SESSION_CPU.run(None, inputs)

    # 假定第一个输出是标量或 [1,1] 形式
    score_array = outputs[0]
    score = float(np.asarray(score_array).reshape(-1)[0])
    return float(score) * 20.0


def detect_faces_from_bgr(img_bgr: np.ndarray, score_thresh: float = 0.5) -> dict:
    """在 BGR 图像上做人脸检测，返回易于前端消费的 JSON 结构。

    返回示例：
    {
        "faces": [
            {"bbox": [x1, y1, x2, y2], "score": 0.93},
            ...
        ]
    }
    仅保留 score >= score_thresh 的人脸。
    """
    if not ENABLE_FACE_DETECTION:
        # 若关闭开关，则返回空结构（数据库仍保留列）
        return {"faces": []}

    _init_face_detector_if_needed()
    if _FACE_DETECTOR is None:
        return {"faces": []}

    try:
        # insightface detector 接收 BGR np.ndarray
        sig = inspect.signature(_FACE_DETECTOR.detect)
        kw = {}
        if "input_size" in sig.parameters:
            kw["input_size"] = (640, 640)
        if "max_num" in sig.parameters:
            kw["max_num"] = 0
        if "metric" in sig.parameters:
            kw["metric"] = "default"

        # 如果是 DirectML，使用互斥锁保护
        if _FACE_DET_IS_DML:
            with _FACE_DET_LOCK:
                bboxes, _kpss = _FACE_DETECTOR.detect(img_bgr, **kw)
        else:
            bboxes, _kpss = _FACE_DETECTOR.detect(img_bgr, **kw)

        faces: list[dict] = []
        if bboxes is not None:
            for bb in bboxes:
                x1, y1, x2, y2, score = bb.astype(np.float32).tolist()
                if score < score_thresh:
                    continue
                cx, cy = (x1 + x2) / 2, (y1 + y2) / 2  # 人脸中心点
                faces.append({"bbox": [float(x1), float(y1), float(x2), float(y2)], "score": float(score), "cx": cx, "cy": cy})

        # 按空间位置排序：拟合直线后按投影距离排序
        if len(faces) >= 2:
            pts = np.array([[f["cx"], f["cy"]] for f in faces])  # 提取中心点
            mean = pts.mean(axis=0)  # 中心化
            _, _, vh = np.linalg.svd(pts - mean, full_matrices=False)  # SVD 拟合主方向
            direction = vh[0]  # 主方向向量
            if direction[0] + direction[1] < 0:  # 确保方向指向右下（从左上开始排序）
                direction = -direction
            projs = [(pts[i] - mean) @ direction for i in range(len(faces))]  # 计算投影值
            faces = [faces[i] for i in np.argsort(projs)]  # 按投影值排序
        elif len(faces) == 1:
            pass  # 单个人脸无需排序

        for f in faces:  # 清理临时字段
            f.pop("cx", None)
            f.pop("cy", None)

        return {"faces": faces}

    except Exception as e:  # noqa: BLE001
        print(f"[FACE] Face detection failed ({e}).")
        return {"faces": []}
