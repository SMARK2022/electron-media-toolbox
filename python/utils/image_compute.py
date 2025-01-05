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
from packages.LAR_IQA.scripts.utils import infer, load_model, preprocess_image
from utils.thumbnails import generate_thumbnails, get_thumbnail
from utils.database import load_cache_from_db, save_cache_to_db, update_group_id_in_db

device = "cuda" if torch.cuda.is_available() else "cpu"
model = load_model(".\packages\LAR_IQA\checkpoint_epoch_3.pt", False, device)

def cv_imread(file_path):
    return cv2.imdecode(np.fromfile(file_path, dtype=np.uint8), cv2.IMREAD_COLOR)

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
            hist_img1 /= hist_img1.sum()
            hist_img2 /= hist_img2.sum()

            hist1_mean = hist_img1.mean()
            hist2_mean = hist_img2.mean()
            numerator = ((hist_img1 - hist1_mean) * (hist_img2 - hist2_mean)).sum()
            denominator = torch.sqrt(
                ((hist_img1 - hist1_mean) ** 2).sum() * ((hist_img2 - hist2_mean) ** 2).sum()
            )
            similarity = (numerator / (denominator + 1e-6)).item()
            similarities.append(similarity)

        return sum(similarities) / len(similarities)

    def hsv_similarity(img1, img2, bins, device):
        r1, g1, b1 = [
            torch.tensor(img1[..., i], dtype=torch.float32, device=device) / 255.0 for i in range(3)
        ]
        r2, g2, b2 = [
            torch.tensor(img2[..., i], dtype=torch.float32, device=device) / 255.0 for i in range(3)
        ]

        h1, s1, v1 = rgb_channel_to_hsv_channel(r1, g1, b1, device)
        h2, s2, v2 = rgb_channel_to_hsv_channel(r2, g2, b2, device)

        hsv_img1 = [h1, s1, v1]
        hsv_img2 = [h2, s2, v2]

        del r1, g1, b1, r2, g2, b2

        similarity = calculate_histogram_similarity(hsv_img1, hsv_img2, bins, device)

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

def process_image_batch(worker_id, image_files, cache_data, db_path, update_progress, update_status):
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
        conn.commit()
        conn.close()

        previous_image = (file, img)
        update_progress(worker_id, idx + 1, total_images)

    return cache_data

def process_and_group_images(db_path, similarity_threshold, update_progress, update_status, show_disabled_photos):
    start_time = time.time()
    cache_data = load_cache_from_db(db_path, show_disabled_photos)
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
                    update_progress,
                    update_status
                )
            )
        similarity_data = {}
        for future in as_completed(futures):
            similarity_data.update(future.result())

    update_status("空闲中")
    save_cache_to_db(db_path, cache_data)

    groups = []
    current_group = []

    for i in range(total_images):
        file1 = image_files[i]
        file2 = image_files[max(0, i - 1)]
        similarity = cache_data.get((file1, file2), (0, 0))[0]

        if i > 0 and similarity < similarity_threshold:
            groups.append(sorted(current_group, key=lambda x: x[2], reverse=True))
            current_group = []

        current_group.append((file1, similarity, cache_data.get((file1, file2), (0, 0))[1]))

        update_group_id_in_db(db_path, file1, len(groups))

        update_progress(0, i + 1, total_images)

    if current_group:
        groups.append(sorted(current_group, key=lambda x: x[2], reverse=True))

    total_time = time.time() - start_time
    average_time_per_image = total_time / total_images if total_images > 0 else 0

    print(f"Total Time: {total_time:.2f} seconds")
    print(f"Average Time per Image: {average_time_per_image:.2f} seconds")

    return groups