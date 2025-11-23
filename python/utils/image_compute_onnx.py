import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, List, Tuple, Callable, Optional, Any
from pathlib import Path
import sys
import threading

import cv2
import numpy as np
import onnxruntime as ort
import os

from utils.database import (
    load_cache_from_db,
    save_cache_to_db,
    update_group_id_in_db,
)

# ---------------------------------------------------------------------------
# ONNX Runtime session initialization
# ---------------------------------------------------------------------------


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


# ONNX IQA 模型路径（由原来的 .pt 导出的 .onnx）
# 如果你的 onnx 文件名不同，请改这里
# Nuitka onefile 模式下，资源文件会被解压到临时目录
# 需要使用特殊的方式获取路径
def get_resource_path(relative_path):
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


# 使用新的路径获取方式（带判断与 try，避免直接闪退）
_checkpoint_onnx = Path(get_resource_path("checkpoint/lar_iqa.onnx"))

_IQA_SESSION = None
_IQA_SESSION_CPU = None
_IQA_INPUT_NAMES: List[str] = []
_IQA_RUN_LOCK = threading.Lock()
_IS_DML = False


# 如果模型文件不存在或 ORT 初始化失败，使用一个简单的 dummy session 以避免程序崩溃。
class _DummyIqaSession:
    def run(self, *args, **kwargs):
        # 返回与真实模型相容的形状：第一个输出应当是可转换为标量的数组
        return [np.array([0.0], dtype=np.float32)]


if not _checkpoint_onnx.exists():
    print(f"[IQA] ONNX model not found at {_checkpoint_onnx}. IQA will be disabled (using dummy session).")
    _IQA_SESSION = _DummyIqaSession()
    _IQA_INPUT_NAMES = ["input_authentic", "input_synthetic"]
    _IQA_SESSION_CPU = _IQA_SESSION
else:
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
            str(_checkpoint_onnx),
            sess_options=_session_options,
            providers=providers,
        )

        _IQA_INPUT_NAMES = [inp.name for inp in _IQA_SESSION.get_inputs()]
        _IS_DML = "DmlExecutionProvider" in _IQA_SESSION.get_providers()
        print(f"[IQA] Loaded ONNX model from {_checkpoint_onnx}, providers={_IQA_SESSION.get_providers()}, inputs={_IQA_INPUT_NAMES}")

        # ---- CPU Fallback Session ----
        _cpu_so = ort.SessionOptions()
        _cpu_so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _IQA_SESSION_CPU = ort.InferenceSession(
            str(_checkpoint_onnx),
            sess_options=_cpu_so,
            providers=["CPUExecutionProvider"],
        )

    except Exception as e:
        print(f"[IQA] Failed to create ONNX Runtime session ({e}). Falling back to dummy session to avoid crash.")
        _IQA_SESSION = _DummyIqaSession()
        _IQA_INPUT_NAMES = ["input_authentic", "input_synthetic"]
        _IQA_SESSION_CPU = _IQA_SESSION
        _IS_DML = False

HSVHist = Tuple[np.ndarray, np.ndarray, np.ndarray]
BINS: List[int] = [90, 128, 128]

# ---------------------------------------------------------------------------
# 图像读取
# ---------------------------------------------------------------------------


def cv_imread(file_path: str) -> np.ndarray:
    """支持中文路径的 cv2 读取."""
    data = np.fromfile(file_path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"Failed to read image: {file_path}")
    return img


# ---------------------------------------------------------------------------
# HSV 直方图（NumPy + OpenCV，CPU）
# ---------------------------------------------------------------------------


def compute_centered_hsv_histogram(
    img_bgr: np.ndarray,
    bins: List[int],
) -> HSVHist:
    """
    计算图像的 HSV 直方图，并做归一化 + 去均值。

    返回 (h_hist_centered, s_hist_centered, v_hist_centered)，类型为 np.float32。
    """
    # BGR -> HSV，OpenCV 范围: H in [0,180], S/V in [0,255]
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)

    h_channel = hsv[:, :, 0].astype(np.float32)  # [0,180]
    s_channel = hsv[:, :, 1].astype(np.float32)  # [0,255]
    v_channel = hsv[:, :, 2].astype(np.float32)  # [0,255]

    # 映射到 [0,1]，保持和原先 torch 版本 histc(min=0,max=1) 一致
    h_norm = h_channel / 180.0
    s_norm = s_channel / 255.0
    v_norm = v_channel / 255.0

    channels = [h_norm, s_norm, v_norm]
    centered_hists: List[np.ndarray] = []

    for ch, bin_size in zip(channels, bins):
        ch_flat = ch.reshape(-1)
        hist, _ = np.histogram(ch_flat, bins=bin_size, range=(0.0, 1.0))

        hist = hist.astype(np.float32)
        total = float(hist.sum())
        if total > 0.0:
            hist /= total

        hist_mean = float(hist.mean())
        centered = (hist - hist_mean).astype(np.float32)
        centered_hists.append(centered)

    return centered_hists[0], centered_hists[1], centered_hists[2]


def calculate_similarity_from_hist(
    hist1: HSVHist,
    hist2: HSVHist,
) -> float:
    """
    根据中心化后的 HSV 直方图计算相似度（相关系数形式）。
    """
    similarities: List[float] = []
    for ch1, ch2 in zip(hist1, hist2):
        numerator = float(np.dot(ch1, ch2))
        denom = float(np.sqrt(np.dot(ch1, ch1) * np.dot(ch2, ch2)) + 1e-6)
        similarities.append(numerator / denom if denom > 0 else 0.0)

    return float(np.mean(similarities)) if similarities else 0.0


def ensure_hist_cached(
    file_path: str,
    hist_cache: Dict[str, HSVHist],
    img_bgr: Optional[np.ndarray] = None,
) -> None:
    """
    确保某张图的 HSV 直方图已缓存。
    img_bgr:
        可选的预加载 BGR 图像（用于和 IQA 复用 IO）。
    """
    if file_path in hist_cache:
        return

    start_time = time.time()
    if img_bgr is None:
        img_bgr = cv_imread(file_path)
    hist_cache[file_path] = compute_centered_hsv_histogram(img_bgr, BINS)
    elapsed = time.time() - start_time
    print(f"[ensure_hist_cached] {file_path} histogram computed in {elapsed:.3f}s")


# ---------------------------------------------------------------------------
# IQA：ONNX Runtime 前处理 + 推理
# ---------------------------------------------------------------------------

# 与原 PyTorch 版本一致的 ImageNet 归一化参数
_IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
_IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def _preprocess_image_from_bgr(
    img_bgr: np.ndarray,
    color_space: str = "RGB",
) -> Tuple[np.ndarray, np.ndarray]:
    """
    IQA 模型前处理（对应原来的 torchvision pipeline），仅用 OpenCV + NumPy：

      - BGR -> RGB
      - 仅支持 RGB color_space（移除 LAB/YUV 等不会用到的分支）
      - authentic 分支: Resize 到 384x384
      - synthetic 分支: CenterCrop 到 1280x1280
      - /255 -> [0,1] -> Normalize -> HWC->NCHW -> 加 batch 维
    """
    # BGR -> RGB
    img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

    # 当前调用只会传 "RGB"，保留参数是为了不改函数形式
    if color_space == "RGB":
        working = img_rgb
    else:
        # 如果以后要扩展 HSV/LAB/YUV，请在这里显式添加
        raise ValueError(f"Unsupported color_space: {color_space}. Only 'RGB' is supported in ONNX pipeline.")

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
        # 模拟 torchvision CenterCrop 对“小图”的行为：
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


def preprocess_image(
    image_path: str,
    color_space: str = "RGB",
) -> Tuple[np.ndarray, np.ndarray]:
    """兼容旧接口：从路径读图，再调用基于 BGR 的前处理."""
    img_bgr = cv_imread(image_path)
    return _preprocess_image_from_bgr(img_bgr, color_space=color_space)


def infer_iqa(
    image_authentic: np.ndarray,
    image_synthetic: np.ndarray,
) -> float:
    """用 ONNX Runtime 跑 IQA 推理，返回标量评分."""
    if len(_IQA_INPUT_NAMES) != 2:
        raise RuntimeError(f"Expected IQA ONNX model with 2 inputs, got {_IQA_INPUT_NAMES}")

    inputs: Dict[str, np.ndarray] = {
        _IQA_INPUT_NAMES[0]: image_authentic,
        _IQA_INPUT_NAMES[1]: image_synthetic,
    }
    try:
        if _IS_DML:
            # DirectML Session 不允许多线程并发 Run，必须串行化
            with _IQA_RUN_LOCK:
                outputs = _IQA_SESSION.run(None, inputs)
        else:
            outputs = _IQA_SESSION.run(None, inputs)
    except Exception as e:
        print(f"[IQA] GPU/DirectML inference failed ({e}), falling back to CPUExecutionProvider.")
        outputs = _IQA_SESSION_CPU.run(None, inputs)
    # 假定第一个输出是标量或 [1,1] 形式
    score_array = outputs[0]
    score = float(np.asarray(score_array).reshape(-1)[0])
    return score


def ensure_iqa_cached(
    file_path: str,
    iqa_cache: Dict[str, float],
    img_bgr: Optional[np.ndarray] = None,
) -> None:
    """
    确保某张图的 IQA 已缓存。
    img_bgr:
        可选的预加载 BGR 图像（用于和 HSV 复用 IO）。
    """
    if file_path in iqa_cache:
        return

    start_time = time.time()

    if img_bgr is None:
        img_bgr = cv_imread(file_path)

    image_authentic, image_synthetic = _preprocess_image_from_bgr(img_bgr, color_space="RGB")
    score = infer_iqa(image_authentic, image_synthetic)
    iqa_value = float(score) * 20.0  # 保留原来的 *20 缩放
    iqa_cache[file_path] = iqa_value

    elapsed = time.time() - start_time
    print(f"[ensure_iqa_cached] {file_path} IQA computed in {elapsed:.3f}s")


# ---------------------------------------------------------------------------
# 单对图片：相似度 + IQA
# ---------------------------------------------------------------------------


def compute_similarity_and_IQA(
    file_path: str,
    ref_path: str,
    hist_cache: Dict[str, HSVHist],
    iqa_cache: Dict[str, float],
) -> Tuple[float, float]:
    """
    计算 (file_path, ref_path) 这对图片的相似度 + file_path 的 IQA。

    为减少 IO：
      - 对于未在缓存中的图片，仅调用一次 cv_imread，
        同时用于 HSV 直方图与 IQA 预处理。
    """
    # --- 参考图：只需要 HSV 直方图 ---
    if ref_path in hist_cache:
        img_ref: Optional[np.ndarray] = None
    else:
        img_ref = cv_imread(ref_path)
        ensure_hist_cached(ref_path, hist_cache, img_ref)

    # --- 当前图：可能需要直方图，也可能需要 IQA，可能都需要 ---
    img_curr: Optional[np.ndarray] = None
    need_hist = file_path not in hist_cache
    need_iqa = file_path not in iqa_cache

    if need_hist or need_iqa:
        img_curr = cv_imread(file_path)

    if need_hist:
        ensure_hist_cached(file_path, hist_cache, img_curr)
    if need_iqa:
        ensure_iqa_cached(file_path, iqa_cache, img_curr)

    similarity = calculate_similarity_from_hist(
        hist_cache[file_path],
        hist_cache[ref_path],
    )
    iqa_value = iqa_cache[file_path]

    print(f"[compute_similarity_and_IQA] pair=({file_path}, {ref_path}) similarity={similarity:.4f}, IQA={iqa_value:.4f}")
    return similarity, iqa_value


# ---------------------------------------------------------------------------
# 多线程批处理 + 分组逻辑（基本保持不变，仅调用新的 ensure_*）
# ---------------------------------------------------------------------------


def process_pair_batch(
    worker_id: int,
    pairs: List[Tuple[str, str]],
    cache_data: Dict[Tuple[str, str], Tuple[float, float]],
    hist_cache: Dict[str, HSVHist],
    iqa_cache: Dict[str, float],
    db_path: str,
    update_progress: Callable[[str, int, int, int], Any],
    include_first_self_pair: bool = False,
    first_enabled_file: Optional[str] = None,
) -> None:
    """
    Worker：处理一段 (file, ref_file) pair。

    只负责：
      - 对还未在 cache_data 中的 pair 计算 similarity + IQA；
      - 结果写回 cache_data 和 DB；
      - 不负责分组。
    若 include_first_self_pair=True，则额外确保首个启用图片 first_enabled_file
    的 IQA 一定被计算。
    """
    total_pairs = len(pairs)
    if total_pairs == 0 and not include_first_self_pair:
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 若是“第一段”，且首个启用图片还未计算 IQA，则先补算一次
        if include_first_self_pair and first_enabled_file is not None:
            if first_enabled_file not in iqa_cache:
                print(f"[process_pair_batch] worker {worker_id} pre-computing IQA for first enabled: {first_enabled_file}")
                img_first = cv_imread(first_enabled_file)
                ensure_hist_cached(first_enabled_file, hist_cache, img_first)
                ensure_iqa_cached(first_enabled_file, iqa_cache, img_first)

                # 同步一次 IQA 到 DB（后续 save_cache_to_db 也会再次覆盖一次）
                cursor.execute(
                    "SELECT id FROM present WHERE filePath = ?",
                    (first_enabled_file,),
                )
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        """
                        UPDATE present
                        SET IQA = ?
                        WHERE id = ?
                        """,
                        (iqa_cache[first_enabled_file], row[0]),
                    )
                    conn.commit()

        for idx, (file_path, ref_path) in enumerate(pairs):
            if (file_path, ref_path) in cache_data:
                update_progress("多线程分析中", worker_id, idx + 1, total_pairs)
                continue

            similarity, iqa_value = compute_similarity_and_IQA(
                file_path,
                ref_path,
                hist_cache,
                iqa_cache,
            )

            cache_data[(file_path, ref_path)] = (similarity, iqa_value)

            cursor.execute(
                "SELECT id FROM present WHERE filePath = ?",
                (file_path,),
            )
            row = cursor.fetchone()
            if row:
                cursor.execute(
                    """
                    UPDATE present
                    SET simRefPath = ?, similarity = ?, IQA = ?
                    WHERE id = ?
                    """,
                    (ref_path, similarity, iqa_value, row[0]),
                )

            conn.commit()
            update_progress("多线程分析中", worker_id, idx + 1, total_pairs)
    finally:
        conn.close()


def process_and_group_images(
    db_path: str,
    similarity_threshold: float,
    update_progress: Callable[[str, int, int, int], Any],
    show_disabled_photos: bool,
):
    """
    主流程：读取 DB、计算相似度 & IQA、完成分组并写回 groupId。
    """
    start_time = time.time()

    (
        cache_data,
        image_files,
        enabled_map,
        hist_cache,
        iqa_cache,
    ) = load_cache_from_db(db_path, show_disabled_photos)

    total_images = len(image_files)

    # 启用图片列表
    enabled_files: List[str] = [f for f in image_files if enabled_map.get(f, True)]
    total_enabled = len(enabled_files)

    # 构造 “当前启用图 vs 前一张启用图” 的 pair（如果不在 cache_data 中才计算）
    pairs_to_compute: List[Tuple[str, str]] = []
    prev_enabled: Optional[str] = None
    for file_path in enabled_files:
        if prev_enabled is None:
            prev_enabled = file_path
            continue

        key = (file_path, prev_enabled)
        if key not in cache_data:
            pairs_to_compute.append(key)

        prev_enabled = file_path

    # 多线程计算相似度 & IQA
    num_threads = max(1, os.cpu_count() // 2 or 1)
    total_pairs = len(pairs_to_compute)

    if total_pairs > 0:
        chunk_size = (total_pairs + num_threads - 1) // num_threads
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = []

            # 首个启用图片路径（用于首段强制计算 IQA）
            first_enabled_file: Optional[str] = enabled_files[0] if enabled_files else None

            for worker_id in range(num_threads):
                start_idx = worker_id * chunk_size
                if start_idx >= total_pairs:
                    break
                end_idx = min(total_pairs, start_idx + chunk_size)
                chunk_pairs = pairs_to_compute[start_idx:end_idx]

                include_head = worker_id == 0 and first_enabled_file is not None

                futures.append(
                    executor.submit(
                        process_pair_batch,
                        worker_id,
                        chunk_pairs,
                        cache_data,
                        hist_cache,
                        iqa_cache,
                        db_path,
                        update_progress,
                        include_head,
                        first_enabled_file,
                    )
                )

            for future in as_completed(futures):
                future.result()

    # 兜底：确保首个启用图片一定有 IQA
    if enabled_files:
        first_enabled = enabled_files[0]
        if first_enabled not in iqa_cache:
            print(f"[process_and_group_images] fallback IQA computation for first enabled: {first_enabled}")
            img_first = cv_imread(first_enabled)
            ensure_hist_cached(first_enabled, hist_cache, img_first)
            ensure_iqa_cached(first_enabled, iqa_cache, img_first)

    # 将 per-image 直方图 & IQA 写回 DB
    update_progress("保存缓存数据中", 0, 0, 1)
    save_cache_to_db(db_path, cache_data, hist_cache, iqa_cache)

    # ====== 对启用图片进行分组 ======
    groups: List[List[Tuple[str, float, float]]] = []
    current_group: List[Tuple[str, float, float]] = []
    current_group_id = 0

    for idx, file_path in enumerate(enabled_files):
        if idx == 0:
            # 第一张启用图片没有前驱，相似度视为 1.0
            similarity = 1.0
            iqa_value = iqa_cache.get(file_path, 0.0)
        else:
            prev_file = enabled_files[idx - 1]
            similarity, iqa_value = cache_data.get(
                (file_path, prev_file),
                (0.0, iqa_cache.get(file_path, 0.0)),
            )

            # 相似度低于阈值 -> 开启新组
            if similarity < similarity_threshold:
                if current_group:
                    groups.append(sorted(current_group, key=lambda x: x[2], reverse=True))
                current_group = []
                current_group_id += 1

        current_group.append((file_path, similarity, iqa_value))
        update_group_id_in_db(db_path, file_path, current_group_id)
        update_progress("单线程分组中", 0, idx + 1, max(total_enabled, 1))

    if current_group:
        groups.append(sorted(current_group, key=lambda x: x[2], reverse=True))

    # 建立启用图片 filePath -> groupId 映射
    file_to_group: Dict[str, int] = {}
    for gid, group in enumerate(groups):
        for file_path, _, _ in group:
            file_to_group[file_path] = gid

    # ====== 未启用图片：挂到最近的启用图片组 ======
    index_map: Dict[str, int] = {path: i for i, path in enumerate(image_files)}

    if enabled_files:
        for file_path in image_files:
            # 启用图片已经在上面分组 & 写回 groupId，这里只处理未启用的
            if enabled_map.get(file_path, True):
                continue

            idx = index_map[file_path]

            nearest_group: Optional[int] = None
            nearest_distance: Optional[int] = None

            # 向左找最近启用图片
            for j in range(idx - 1, -1, -1):
                neighbor = image_files[j]
                if enabled_map.get(neighbor, True) and neighbor in file_to_group:
                    nearest_group = file_to_group[neighbor]
                    nearest_distance = idx - j
                    break

            # 向右看是否有更近的启用图片
            for j in range(idx + 1, len(image_files)):
                neighbor = image_files[j]
                if enabled_map.get(neighbor, True) and neighbor in file_to_group:
                    dist = j - idx
                    if nearest_distance is None or dist < nearest_distance:
                        nearest_group = file_to_group[neighbor]
                        nearest_distance = dist
                    break

            # 实在没有启用图片（极端情况） -> 统一挂到组 0
            if nearest_group is None:
                nearest_group = 0

            update_group_id_in_db(db_path, file_path, nearest_group)

            # 未启用图片不强制计算 IQA，只用已有缓存（若无则为 0）
            iqa_value = iqa_cache.get(file_path, 0.0)
            while len(groups) <= nearest_group:
                groups.append([])
            groups[nearest_group].append((file_path, 0.0, iqa_value))
    else:
        # 没有任何启用图片：全部挂到组 0
        if image_files:
            groups = [[]]
            for idx, file_path in enumerate(image_files):
                update_group_id_in_db(db_path, file_path, 0)
                iqa_value = iqa_cache.get(file_path, 0.0)
                groups[0].append((file_path, 0.0, iqa_value))
                update_progress("单线程分组中", 0, idx + 1, total_images)
        else:
            groups = []

    # 每个组内部按 IQA 降序
    groups = [sorted(group, key=lambda x: x[2], reverse=True) for group in groups if group]

    total_time = time.time() - start_time
    average_time_per_image = total_time / total_images if total_images > 0 else 0.0

    print(f"Total Time: {total_time:.2f} seconds")
    print(f"Average Time per Image: {average_time_per_image:.2f} seconds")
    update_progress("已完成分析分组", 0, total_images, max(total_images, 1))

    return groups
