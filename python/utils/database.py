import os
import sqlite3
from typing import Dict, Tuple, List

import json
import numpy as np

# Histogram bin configuration must match image_compute.py
BINS = [90, 128, 128]
HSVHist = Tuple[np.ndarray, np.ndarray, np.ndarray]


def _connect(db_path: str) -> sqlite3.Connection:
    """
    打开数据库连接，统一设置 WAL 模式与 busy_timeout。

    WAL 模式持久化在 DB 文件头，此处幂等设置以消除 Electron/Python 启动顺序依赖——
    无论哪侧先打开 DB，都能确保进入 WAL 模式。
    check_same_thread=False 允许 DBManager 的持久连接被 ThreadPoolExecutor 工作线程共享
    （访问已由 DBManager._lock 串行化，同一时刻仅一个线程操作连接，单写者安全）。
    busy_timeout=10000ms 给跨进程写锁争用足够的等待时间。
    """
    conn = sqlite3.connect(db_path, timeout=10.0, check_same_thread=False)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def load_cache_from_db(db_path: str, show_disabled_photos: bool):
    """
    Load all images and cached similarity/IQA/HSV histograms from the database.

    Returns
    -------
    cache_data : Dict[(filePath, simRefPath), (similarity, IQA)]
        Pair-level cache for adjacency similarity (mainly for enabled images).
    image_files : List[str]
        All image file paths in a deterministic order.
    enabled_map : Dict[str, bool]
        Mapping from filePath -> isEnabled flag from DB.
    hist_cache : Dict[str, HSVHist]
        Per-image centered HSV histograms, if already cached in DB.
    iqa_cache : Dict[str, float]
        Per-image IQA score, if already cached in DB.
    """
    conn = _connect(db_path)
    cursor = conn.cursor()

    # 始终读取所有照片（启用/未启用），后续再根据 isEnabled 控制参与计算与否
    cursor.execute(
        """
    SELECT filePath, simRefPath, similarity, IQA, isEnabled, histH, histS, histV, faceData
        FROM present
        ORDER BY id ASC
        """
    )
    rows = cursor.fetchall()
    conn.close()

    cache_data: Dict[Tuple[str, str], Tuple[float, float]] = {}
    image_files: List[str] = []
    enabled_map: Dict[str, bool] = {}
    hist_cache: Dict[str, HSVHist] = {}
    iqa_cache: Dict[str, float] = {}
    face_cache: Dict[str, dict] = {}

    for row in rows:
        (
            file_path,
            sim_ref_path,
            similarity,
            iqa_value,
            is_enabled,
            hist_h,
            hist_s,
            hist_v,
            face_data,
        ) = row

        if file_path not in image_files:
            image_files.append(file_path)

        enabled_map[file_path] = bool(is_enabled) if is_enabled is not None else True

        if sim_ref_path:
            cache_data[(file_path, sim_ref_path)] = (
                float(similarity) if similarity is not None else 0.0,
                float(iqa_value) if iqa_value is not None else 0.0,
            )

        if iqa_value is not None:
            iqa_cache[file_path] = float(iqa_value)

        # faceData JSON
        if face_data is not None:
            try:
                face_cache[file_path] = json.loads(face_data)
            except Exception:
                # 如果解析失败，则忽略，后续重新计算
                pass

        # Histogram blobs -> numpy arrays
        if hist_h is not None and hist_s is not None and hist_v is not None:
            try:
                h = np.frombuffer(hist_h, dtype=np.float32, count=BINS[0])
                s = np.frombuffer(hist_s, dtype=np.float32, count=BINS[1])
                v = np.frombuffer(hist_v, dtype=np.float32, count=BINS[2])
                hist_cache[file_path] = (h, s, v)
            except Exception:
                # 如果解码失败，则忽略，后续重新计算
                pass

    return cache_data, image_files, enabled_map, hist_cache, iqa_cache, face_cache


def save_cache_to_db(
    db_path: str,
    cache_data,  # 保留参数以兼容旧接口，这里不直接使用
    hist_cache: Dict[str, HSVHist],
    iqa_cache: Dict[str, float],
    face_cache: Dict[str, dict],
) -> None:
    """
    Persist per-image HSV histograms and IQA scores into the database.

    Pair-level similarity / simRefPath are already written during computation
    (process_pair_batch 中已更新 present 表)，
    这里主要确保 per-image 的 hist 与 IQA 同步回 DB。
    """
    conn = _connect(db_path)
    cursor = conn.cursor()

    # 对所有有 histogram、IQA 或人脸数据的图片进行更新
    all_files = set(hist_cache.keys()) | set(iqa_cache.keys()) | set(face_cache.keys())

    for file_path in all_files:
        h_blob = s_blob = v_blob = None

        if file_path in hist_cache:
            h, s, v = hist_cache[file_path]
            h_blob = h.astype(np.float32).tobytes()
            s_blob = s.astype(np.float32).tobytes()
            v_blob = v.astype(np.float32).tobytes()

        iqa_value = iqa_cache.get(file_path, None)
        face_json: str | None = None
        if file_path in face_cache:
            try:
                face_json = json.dumps(face_cache[file_path], ensure_ascii=False)
            except Exception:
                face_json = None

        cursor.execute(
            "SELECT id FROM present WHERE filePath = ?",
            (file_path,),
        )
        row = cursor.fetchone()

        if row:
            row_id = row[0]

            if h_blob is not None and iqa_value is not None and face_json is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET histH = ?, histS = ?, histV = ?, IQA = ?, faceData = ?
                    WHERE id = ?
                    """,
                    (h_blob, s_blob, v_blob, float(iqa_value), face_json, row_id),
                )
            elif h_blob is not None and iqa_value is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET histH = ?, histS = ?, histV = ?, IQA = ?
                    WHERE id = ?
                    """,
                    (h_blob, s_blob, v_blob, float(iqa_value), row_id),
                )
            elif h_blob is not None and face_json is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET histH = ?, histS = ?, histV = ?, faceData = ?
                    WHERE id = ?
                    """,
                    (h_blob, s_blob, v_blob, face_json, row_id),
                )
            elif h_blob is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET histH = ?, histS = ?, histV = ?
                    WHERE id = ?
                    """,
                    (h_blob, s_blob, v_blob, row_id),
                )
            elif iqa_value is not None and face_json is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET IQA = ?, faceData = ?
                    WHERE id = ?
                    """,
                    (float(iqa_value), face_json, row_id),
                )
            elif iqa_value is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET IQA = ?
                    WHERE id = ?
                    """,
                    (float(iqa_value), row_id),
                )
            elif face_json is not None:
                cursor.execute(
                    """
                    UPDATE present
                    SET faceData = ?
                    WHERE id = ?
                    """,
                    (face_json, row_id),
                )
        else:
            # 该 file_path 目前在 present 中不存在，插入一条最小信息记录
            cursor.execute(
                """
                INSERT INTO present (
                    fileName,
                    fileUrl,
                    filePath,
                    info,
                    date,
                    groupId,
                    isEnabled,
                    simRefPath,
                    similarity,
                    IQA,
                    histH,
                    histS,
                    histV,
                    faceData
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    os.path.basename(file_path),
                    "",
                    file_path,
                    "",
                    "",
                    0,
                    1,
                    None,
                    0.0,
                    float(iqa_value) if iqa_value is not None else 0.0,
                    h_blob,
                    s_blob,
                    v_blob,
                    face_json,
                ),
            )

    conn.commit()
    conn.close()
