import os
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Tuple

import cv2
import numpy as np
import torch
from packages.LAR_IQA.scripts.utils import infer, load_model, preprocess_image
from utils.database import (
    load_cache_from_db,
    save_cache_to_db,
    update_group_id_in_db,
)
from utils.thumbnails import generate_thumbnails, get_thumbnail

device = "cuda" if torch.cuda.is_available() else "cpu"
model = load_model(r".\packages\LAR_IQA\checkpoint_epoch_3.pt", False, device)

HSVHist = Tuple[np.ndarray, np.ndarray, np.ndarray]
BINS = [90, 128, 128]


def cv_imread(file_path: str) -> np.ndarray:
    """Robust cv2 imread that supports non-ASCII paths."""
    data = np.fromfile(file_path, dtype=np.uint8)
    img = cv2.imdecode(data, cv2.IMREAD_COLOR)
    if img is None:
        raise RuntimeError(f"Failed to read image: {file_path}")
    return img


def rgb_channel_to_hsv_channel(
    r: torch.Tensor,
    g: torch.Tensor,
    b: torch.Tensor,
    device: torch.device,
) -> Tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Convert RGB channels to HSV channels (all in [0, 1])."""
    maxc = torch.max(torch.stack([r, g, b], dim=0), dim=0)[0]
    minc = torch.min(torch.stack([r, g, b], dim=0), dim=0)[0]
    diff = maxc - minc

    v = maxc
    s = torch.zeros_like(maxc, device=device)
    nonzero_mask = maxc != 0
    s[nonzero_mask] = diff[nonzero_mask] / maxc[nonzero_mask]

    h = torch.zeros_like(maxc, device=device)
    mask = diff != 0

    idx = (maxc == r) & mask
    h[idx] = ((g[idx] - b[idx]) / diff[idx]) % 6

    idx = (maxc == g) & mask
    h[idx] = ((b[idx] - r[idx]) / diff[idx]) + 2

    idx = (maxc == b) & mask
    h[idx] = ((r[idx] - g[idx]) / diff[idx]) + 4

    h = (h / 6.0) % 1.0
    return h, s, v


def compute_centered_hsv_histogram(
    img: np.ndarray,
    bins: List[int],
    device_str: str,
) -> HSVHist:
    """
    Compute normalized, mean-centered HSV histograms for an image.

    Returns (h_hist_centered, s_hist_centered, v_hist_centered) as numpy.float32
    arrays, which can be cached to the database.
    """
    dev = torch.device(device_str)

    # OpenCV loads BGR; here we just keep channel order consistent with previous code.
    r, g, b = [torch.tensor(img[..., i], dtype=torch.float32, device=dev) / 255.0 for i in range(3)]

    h, s, v = rgb_channel_to_hsv_channel(r, g, b, dev)
    hsv_channels = [h, s, v]

    centered_hists: List[np.ndarray] = []

    # 为每个通道统计归一化直方图并做中心化
    for ch, bin_size in zip(hsv_channels, bins):
        channel_flat = ch.flatten()
        hist = torch.histc(channel_flat, bins=bin_size, min=0.0, max=1.0)
        if hist.sum() > 0:
            hist = hist / hist.sum()

        hist_mean = hist.mean()
        centered = (hist - hist_mean).cpu().numpy().astype(np.float32)
        centered_hists.append(centered)

    # 手动释放中间张量
    del r, g, b, h, s, v, hsv_channels, channel_flat, hist  # type: ignore[name-defined]
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

    return centered_hists[0], centered_hists[1], centered_hists[2]


def calculate_similarity_from_hist(
    hist1: HSVHist,
    hist2: HSVHist,
) -> float:
    """
    Compute similarity between two images from their centered HSV histograms.

    等价于原先的相关系数：
        (Σ (h1-μ1)(h2-μ2)) / sqrt(Σ(h1-μ1)^2 * Σ(h2-μ2)^2)
    这里只是用 dot(centered1, centered2) 的形式实现。
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
) -> None:
    """
    Ensure HSV histogram for an image is present in the in-memory cache.
    Only read the image & compute histogram if it's missing.
    """
    if file_path in hist_cache:
        return

    start_time = time.time()
    img = cv_imread(file_path)
    hist_cache[file_path] = compute_centered_hsv_histogram(img, BINS, device)
    elapsed = time.time() - start_time
    print(f"[ensure_hist_cached] {file_path} histogram computed in {elapsed:.3f}s")


def ensure_iqa_cached(
    file_path: str,
    iqa_cache: Dict[str, float],
) -> None:
    """
    Ensure IQA score for an image is present in the in-memory cache.
    Only run the IQA model if it's missing.
    """
    if file_path in iqa_cache:
        return

    start_time = time.time()
    image_authentic, image_synthetic = preprocess_image(file_path, "RGB", device)
    score = infer(model, image_authentic, image_synthetic)
    iqa_value = float(score) * 20.0
    iqa_cache[file_path] = iqa_value

    elapsed = time.time() - start_time
    print(f"[ensure_iqa_cached] {file_path} IQA computed in {elapsed:.3f}s")

    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def compute_similarity_and_IQA(
    file_path: str,
    ref_path: str,
    hist_cache: Dict[str, HSVHist],
    iqa_cache: Dict[str, float],
) -> Tuple[float, float]:
    """
    Compute similarity between file_path and ref_path (from cached HSV hist)
    and IQA for file_path (per-image IQA).
    """
    ensure_hist_cached(ref_path, hist_cache)
    ensure_hist_cached(file_path, hist_cache)

    similarity = calculate_similarity_from_hist(
        hist_cache[file_path],
        hist_cache[ref_path],
    )

    ensure_iqa_cached(file_path, iqa_cache)
    iqa_value = iqa_cache[file_path]

    print(f"[compute_similarity_and_IQA] pair=({file_path}, {ref_path}) similarity={similarity:.4f}, IQA={iqa_value:.4f}")
    return similarity, iqa_value


def process_pair_batch(
    worker_id: int,
    pairs: List[Tuple[str, str]],
    cache_data: Dict[Tuple[str, str], Tuple[float, float]],
    hist_cache: Dict[str, HSVHist],
    iqa_cache: Dict[str, float],
    db_path: str,
    update_progress,
    include_first_self_pair: bool = False,
    first_enabled_file: str | None = None,
) -> None:
    """
    Worker to process a batch of (file, ref_file) pairs in parallel.

    只负责：
      - 对还未在 cache_data 中的 pair 计算 similarity + IQA；
      - 结果写回 cache_data 和 DB；
      - 不负责分组。
    若 include_first_self_pair=True，则额外确保首个启用图片 first_enabled_file
    的 IQA 一定被计算（以自身作为 ref），避免“首张图 IQA 缺失”的情况。
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
                # 直方图 / IQA 都缓存一份
                ensure_hist_cached(first_enabled_file, hist_cache)
                ensure_iqa_cached(first_enabled_file, iqa_cache)

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
    update_progress,
    show_disabled_photos: bool,
):
    """
    Process images, compute similarity & IQA, then group them.

    - 所有图片（启用 / 未启用）都从 DB 读出；
    - 相似度 & IQA 计算仅在启用图片上进行（按启用图片顺序：与前一张启用图片成对）；
    - 启用图片根据 similarity_threshold 分组，并写回 groupId；
    - 未启用图片不做相似度/IQA 计算，只根据“文件顺序上最近的启用图片”继承其组号。
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

    # 只保留启用图片的顺序列表
    enabled_files: List[str] = [f for f in image_files if enabled_map.get(f, True)]
    total_enabled = len(enabled_files)

    # 构造“当前启用图 vs 前一张启用图”的 pair 列表（只对缺失的 pair 计算）
    pairs_to_compute: List[Tuple[str, str]] = []
    prev_enabled: str | None = None
    for file_path in enabled_files:
        if prev_enabled is None:
            prev_enabled = file_path
            continue

        key = (file_path, prev_enabled)
        if key not in cache_data:
            pairs_to_compute.append(key)

        prev_enabled = file_path

    # 多线程计算相似度 & IQA
    num_threads = 4
    total_pairs = len(pairs_to_compute)

    if total_pairs > 0:
        chunk_size = (total_pairs + num_threads - 1) // num_threads
        with ThreadPoolExecutor(max_workers=num_threads) as executor:
            futures = []

            # 首个启用图片路径（用于首段强制计算 IQA）
            first_enabled_file: str | None = enabled_files[0] if enabled_files else None

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

    # === 兜底：确保首个启用图片一定有 IQA（覆盖“只有一张启用图片”或其它极端情况） ===
    if enabled_files:
        first_enabled = enabled_files[0]
        if first_enabled not in iqa_cache:
            print(f"[process_and_group_images] fallback IQA computation for first enabled: {first_enabled}")
            # 可以顺带把直方图也缓存下来
            ensure_hist_cached(first_enabled, hist_cache)
            ensure_iqa_cached(first_enabled, iqa_cache)

    # 将 per-image 直方图 & IQA 写回 DB
    update_progress("保存缓存数据中", 0, 0, 1)
    save_cache_to_db(db_path, cache_data, hist_cache, iqa_cache)

    # ====== 对启用图片进行分组 ======
    groups: List[List[Tuple[str, float, float]]] = []
    current_group: List[Tuple[str, float, float]] = []
    current_group_id = 0

    for idx, file_path in enumerate(enabled_files):
        if idx == 0:
            # 第一张启用图片没有前驱，相似度可视为 1.0
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

    # 建立启用图片 filePath -> groupId 的映射
    file_to_group: Dict[str, int] = {}
    for gid, group in enumerate(groups):
        for file_path, _, _ in group:
            file_to_group[file_path] = gid

    # ====== 未启用图片：挂载到最近的启用图片的组 ======
    index_map: Dict[str, int] = {path: i for i, path in enumerate(image_files)}

    if enabled_files:
        for file_path in image_files:
            # 启用图片已经在上面分组 & 写回 groupId，这里只处理未启用的
            if enabled_map.get(file_path, True):
                continue

            idx = index_map[file_path]

            nearest_group: int | None = None
            nearest_distance: int | None = None

            # 向左寻找最近的启用图片
            for j in range(idx - 1, -1, -1):
                neighbor = image_files[j]
                if enabled_map.get(neighbor, True) and neighbor in file_to_group:
                    nearest_group = file_to_group[neighbor]
                    nearest_distance = idx - j
                    break

            # 向右寻找是否有更近的启用图片
            for j in range(idx + 1, len(image_files)):
                neighbor = image_files[j]
                if enabled_map.get(neighbor, True) and neighbor in file_to_group:
                    dist = j - idx
                    if nearest_distance is None or dist < nearest_distance:
                        nearest_group = file_to_group[neighbor]
                        nearest_distance = dist
                    break

            # 若实在没有启用图片（极端情况），统一挂到 0 组
            if nearest_group is None:
                nearest_group = 0

            update_group_id_in_db(db_path, file_path, nearest_group)

            # 未启用图片不强制计算 IQA，只使用已有缓存（若无则为 0）
            iqa_value = iqa_cache.get(file_path, 0.0)
            while len(groups) <= nearest_group:
                groups.append([])
            groups[nearest_group].append((file_path, 0.0, iqa_value))
    else:
        # 没有任何启用图片：把所有图片都放到组 0
        if image_files:
            groups = [[]]
            for idx, file_path in enumerate(image_files):
                update_group_id_in_db(db_path, file_path, 0)
                iqa_value = iqa_cache.get(file_path, 0.0)
                groups[0].append((file_path, 0.0, iqa_value))
                update_progress("单线程分组中", 0, idx + 1, total_images)
        else:
            groups = []

    # 最后保证每个组内部按 IQA 降序
    groups = [sorted(group, key=lambda x: x[2], reverse=True) for group in groups if group]

    total_time = time.time() - start_time
    average_time_per_image = total_time / total_images if total_images > 0 else 0.0

    print(f"Total Time: {total_time:.2f} seconds")
    print(f"Average Time per Image: {average_time_per_image:.2f} seconds")
    update_progress("已完成分析分组", 0, total_images, max(total_images, 1))

    return groups
