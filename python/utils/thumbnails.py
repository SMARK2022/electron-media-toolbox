from typing import List, Callable
import os
import sys
import threading
import struct
import zlib
import concurrent.futures
import ctypes
import time  # QuickLook 异步超时控制用
import numpy as np
import cv2

from utils.image_compute import cv_imread

# 进度回调类型（可接受任意参数签名以兼容现有调用）
ProgressFn = Callable[..., None]


# 支持中文路径的 OpenCV 函数（与 image_compute.py 中的实现保持一致）
def _cv_imread(file_path: str) -> np.ndarray:
    """支持中文路径的 cv2 读取."""
    return cv_imread(file_path)


def cv_imwrite(file_path: str, img: np.ndarray) -> bool:
    """支持中文路径的 cv2 写入 WEBP."""
    success, buffer = cv2.imencode('.webp', img)
    if not success:
        raise RuntimeError(f"Failed to encode image: {file_path}")
    with open(file_path, 'wb') as f:
        f.write(buffer)
    return True


# ============================ 平台分支 ============================
# Windows：使用 Shell API (IShellItemImageFactory) 获取系统缩略图，
#           可利用 Windows 缩略图缓存（含 EXIF 内嵌缩略图），速度快。
# macOS：使用 ImageIO（CGImageSourceCreateThumbnailAtIndex）+ QuickLook 三级降级，
#           ImageIO 对 JPEG/PNG 比 OpenCV 快 1.5-2x（利用 EXIF 内嵌缩略图），
#           QuickLook 对 WebP 快 15x（系统缓存），OpenCV 兜底。
#           输出与 Windows 版相同的 BMP 编码字节（调用方用 np.frombuffer → cv2.imdecode 解码）。

if sys.platform == "win32":
    # ---- Windows-only 导入：ctypes.wintypes / comtypes 仅在 Windows 存在 ----
    from ctypes import HRESULT, POINTER, WinError, byref, windll
    from ctypes.wintypes import DWORD, LONG, WORD
    from comtypes import COMMETHOD, GUID, IUnknown

    # 手动定义缺少的类型
    LPCWSTR = ctypes.c_wchar_p
    HDC = ctypes.c_void_p

    # 定义 HBITMAP 为一个新的类型
    class HBITMAP(ctypes.c_void_p):
        pass

    # 定义 SIZE 结构
    class SIZE(ctypes.Structure):
        _fields_ = [("cx", ctypes.c_long), ("cy", ctypes.c_long)]

    # 定义 SIIGBF 枚举
    class SIIGBF:
        SIIGBF_RESIZETOFIT = 0
        SIIGBF_BIGGERSIZEOK = 0x00000001
        SIIGBF_MEMORYONLY = 0x00000002
        SIIGBF_ICONONLY = 0x00000004
        SIIGBF_THUMBNAILONLY = 0x00000008
        SIIGBF_INCACHEONLY = 0x00000010

    # 手动定义 IShellItemImageFactory 接口
    class IShellItemImageFactory(IUnknown):
        _iid_ = GUID("{bcc18b79-ba16-442f-80c4-8a59c30c463b}")
        _methods_ = [
            COMMETHOD(
                [],
                HRESULT,
                "GetImage",
                (["in"], SIZE, "size"),
                (["in"], ctypes.c_int, "flags"),
                (["out"], POINTER(HBITMAP), "phbm"),
            )
        ]

    # 定义 IShellItem 接口
    class IShellItem(IUnknown):
        _iid_ = GUID("{43826D1E-E718-42EE-BC55-A1E261C37BFE}")
        _methods_ = []

    def get_thumbnail(file_path, width, height):
        """Windows 实现：通过 IShellItemImageFactory 获取系统缩略图，返回 BMP 字节."""
        from comtypes import CoInitialize, CoUninitialize

        # Windows Shell API 需要反斜杠路径
        file_path = file_path.replace("/", "\\")

        CoInitialize()

        # 创建 IShellItem
        SHCreateItemFromParsingName = windll.shell32.SHCreateItemFromParsingName
        SHCreateItemFromParsingName.argtypes = [
            LPCWSTR,
            ctypes.c_void_p,
            POINTER(GUID),
            POINTER(ctypes.c_void_p),
        ]
        SHCreateItemFromParsingName.restype = HRESULT

        shell_item = ctypes.POINTER(IShellItem)()
        hr = SHCreateItemFromParsingName(file_path, None, byref(IShellItem._iid_), byref(shell_item))
        if hr != 0:
            raise WinError(hr)

        # 获取 IShellItemImageFactory 接口
        factory = shell_item.QueryInterface(IShellItemImageFactory)

        # 获取缩略图图像
        size = SIZE(width, height)
        flags = SIIGBF.SIIGBF_BIGGERSIZEOK

        hbitmap = HBITMAP()
        hbitmap = factory.GetImage(size, flags)

        if not hbitmap:
            raise WinError("无法获取缩略图")

        # 将 HBITMAP 转换为字节数据
        class BITMAP(ctypes.Structure):
            _fields_ = [
                ("bmType", LONG),
                ("bmWidth", LONG),
                ("bmHeight", LONG),
                ("bmWidthBytes", LONG),
                ("bmPlanes", WORD),
                ("bmBitsPixel", WORD),
                ("bmBits", ctypes.c_void_p),
            ]

        bitmap = BITMAP()
        res = windll.gdi32.GetObjectW(hbitmap, ctypes.sizeof(BITMAP), byref(bitmap))
        if res == 0:
            raise WinError()

        # 获取位图数据
        class BITMAPINFOHEADER(ctypes.Structure):
            _fields_ = [
                ("biSize", DWORD),
                ("biWidth", LONG),
                ("biHeight", LONG),
                ("biPlanes", WORD),
                ("biBitCount", WORD),
                ("biCompression", DWORD),
                ("biSizeImage", DWORD),
                ("biXPelsPerMeter", LONG),
                ("biYPelsPerMeter", LONG),
                ("biClrUsed", DWORD),
                ("biClrImportant", DWORD),
            ]

        class BITMAPINFO(ctypes.Structure):
            _fields_ = [
                ("bmiHeader", BITMAPINFOHEADER),
            ]

        bmi = BITMAPINFO()
        bmi.bmiHeader.biSize = ctypes.sizeof(BITMAPINFOHEADER)
        bmi.bmiHeader.biWidth = bitmap.bmWidth
        bmi.bmiHeader.biHeight = bitmap.bmHeight
        bmi.bmiHeader.biPlanes = 1
        bmi.bmiHeader.biBitCount = bitmap.bmBitsPixel
        bmi.bmiHeader.biCompression = 0  # BI_RGB

        # 计算图像数据大小
        image_size = ((bitmap.bmWidth * bitmap.bmBitsPixel + 31) // 32) * 4 * bitmap.bmHeight
        image_buffer = (ctypes.c_byte * image_size)()

        hdc = windll.gdi32.CreateCompatibleDC(0)
        res = windll.gdi32.GetDIBits(hdc, hbitmap, 0, bitmap.bmHeight, image_buffer, byref(bmi), 0)
        if res == 0:
            raise WinError()

        windll.gdi32.DeleteDC(hdc)
        windll.gdi32.DeleteObject(hbitmap)

        # 构建位图文件头
        class BITMAPFILEHEADER(ctypes.Structure):
            _pack_ = 1
            _fields_ = [
                ("bfType", WORD),
                ("bfSize", DWORD),
                ("bfReserved1", WORD),
                ("bfReserved2", WORD),
                ("bfOffBits", DWORD),
            ]

        file_header_size = ctypes.sizeof(BITMAPFILEHEADER)
        info_header_size = ctypes.sizeof(BITMAPINFOHEADER)
        file_size = file_header_size + info_header_size + image_size

        bmfh = BITMAPFILEHEADER()
        bmfh.bfType = 0x4D42  # 'BM' 的 ASCII 码
        bmfh.bfSize = file_size
        bmfh.bfReserved1 = 0
        bmfh.bfReserved2 = 0
        bmfh.bfOffBits = file_header_size + info_header_size

        bmp_data = bytearray()
        bmp_data.extend(struct.pack("<HIHHI", bmfh.bfType, bmfh.bfSize, bmfh.bfReserved1, bmfh.bfReserved2, bmfh.bfOffBits))
        bmp_data.extend(bytearray(bytes(bmi.bmiHeader)))
        bmp_data.extend(image_buffer)

        CoUninitialize()

        return bmp_data

else:
    # ---- macOS 原生缩略图：ImageIO/QuickLook + OpenCV 三级降级 ----
    # 延迟导入 PyObjC：未安装时 _HAS_* 为 False，直接降级到 OpenCV，
    # 保证非 macOS 环境或无 PyObjC 的 conda 环境不会 import 失败
    _HAS_IMAGEIO = False
    _HAS_QUICKLOOK = False
    try:
        from Foundation import NSURL, NSMakeSize, NSRunLoop, NSDate
        import objc
        import Quartz
        _HAS_IMAGEIO = True
        try:
            import QuickLookThumbnailing as QLT
            _HAS_QUICKLOOK = True
        except ImportError:
            pass
    except ImportError:
        pass

    def _cgimage_to_bgr(cg_image):
        """CGImageRef → BGR ndarray（ImageIO 和 QuickLook 共用）。

        通过 CGBitmapContextCreate 将 CGImage 渲染到 RGBA buffer，
        再转换为 OpenCV BGR 格式。使用 kCGImageAlphaPremultipliedLast
        以避免 alpha 预乘对像素值的影响。
        """
        w = Quartz.CGImageGetWidth(cg_image)
        h = Quartz.CGImageGetHeight(cg_image)
        bpr = w * 4  # 每像素 4 字节（RGBA）
        buf = bytearray(h * bpr)
        ctx = Quartz.CGBitmapContextCreate(
            buf, w, h, 8, bpr,
            Quartz.CGColorSpaceCreateDeviceRGB(),
            Quartz.kCGImageAlphaPremultipliedLast | Quartz.kCGBitmapByteOrder32Big,
        )
        if ctx is None:
            raise RuntimeError("CGBitmapContextCreate failed")
        Quartz.CGContextDrawImage(ctx, Quartz.CGRectMake(0, 0, w, h), cg_image)
        # buf 是 RGBA 大端字节，reshape 后取前 3 通道并反转为 BGR
        arr = np.frombuffer(bytes(buf), dtype=np.uint8).reshape(h, bpr)
        bgr = arr[:, :w * 4].reshape(h, w, 4)[:, :, :3][:, :, ::-1].copy()
        del ctx  # 释放 CGBitmapContext，防止 worker 线程内存泄漏
        return bgr

    def _bgr_to_bmp_bytes(img):
        """BGR ndarray → BMP 字节（与 Windows 版 get_thumbnail 返回契约一致）。"""
        success, buffer = cv2.imencode('.bmp', img)
        if not success:
            raise RuntimeError("Failed to encode BMP")
        return bytearray(buffer.tobytes())

    def get_thumbnail(file_path, width, height):
        """macOS 实现：ImageIO/QuickLook 原生缩略图 + OpenCV 兜底，返回 BMP 字节。

        三级降级链（与 inference_onnx.py 的 _DummyIqaSession 兜底模式一致）：
        1. WebP → QuickLook（系统缓存，29ms 固定；OpenCV/ImageIO 对 WebP 需 449ms）
        2. JPEG/PNG → ImageIO（EXIF 内嵌缩略图 + 下采样，比 OpenCV 快 1.5-2x）
        3. 兜底 → OpenCV imread + resize（保证非 PyObjC 环境可用）

        返回 BMP 编码字节，调用方用 np.frombuffer → cv2.imdecode 解码。
        """
        max_px = max(width, height)
        ext = os.path.splitext(file_path)[1].lower()

        # --- 1. WebP 优先 QuickLook（OpenCV/ImageIO 的 WebP 解码器慢 15x）---
        if ext == '.webp' and _HAS_QUICKLOOK:
            try:
                with objc.autorelease_pool():
                    url = NSURL.fileURLWithPath_(file_path)
                    # 请求 LowQuality | Thumbnail，接受任何 representation
                    # （系统通常先返回 LowQuality rtype=2，质量已足够）
                    rep_types = (
                        QLT.QLThumbnailGenerationRequestRepresentationTypeLowQualityThumbnail
                        | QLT.QLThumbnailGenerationRequestRepresentationTypeThumbnail
                    )
                    request = QLT.QLThumbnailGenerationRequest.alloc() \
                        .initWithFileAtURL_size_scale_representationTypes_(
                            url, NSMakeSize(float(max_px), float(max_px)), 1.0, rep_types)
                    request.setIconMode_(False)

                    event = threading.Event()
                    result = {}

                    def _handler(thumbnail, rtype, error):
                        # 异步回调：拿到第一个 thumbnail 即 set，不等 rtype=4
                        if error is not None:
                            result["error"] = error
                            event.set()
                        elif thumbnail is not None and "thumbnail" not in result:
                            result["thumbnail"] = thumbnail
                            event.set()

                    gen = QLT.QLThumbnailGenerator.sharedGenerator()
                    gen.generateRepresentationsForRequest_updateHandler_(request, _handler)
                    # QuickLook 异步回调依赖 NSRunLoop，子线程需手动驱动
                    deadline = time.time() + 10.0
                    while not event.is_set() and time.time() < deadline:
                        NSRunLoop.currentRunLoop().runUntilDate_(
                            NSDate.dateWithTimeIntervalSinceNow_(0.02))
                    if not event.is_set():
                        # 超时取消请求，防止系统 daemon 无响应时永久阻塞
                        try:
                            gen.cancelRequest_(request)
                        except Exception:
                            pass
                        raise TimeoutError(f"QuickLook timeout: {file_path}")

                    thumb = result.get("thumbnail")
                    if thumb is None:
                        raise RuntimeError(f"QuickLook no thumbnail: {file_path}")
                    cg = thumb.CGImage()
                    if cg is None:
                        raise RuntimeError(f"QuickLook CGImage None: {file_path}")
                    img = _cgimage_to_bgr(cg)
                # BMP 编码在 autorelease_pool 外执行（不涉及 Objective-C 对象）
                return _bgr_to_bmp_bytes(img)
            except Exception:
                pass  # 降级到 ImageIO

        # --- 2. JPEG/PNG 用 ImageIO（比 OpenCV 快 1.5-2x）---
        if _HAS_IMAGEIO:
            try:
                with objc.autorelease_pool():
                    url = NSURL.fileURLWithPath_(file_path)
                    source = Quartz.CGImageSourceCreateWithURL(
                        url, {Quartz.kCGImageSourceShouldCache: False})
                    if source is None:
                        raise RuntimeError(f"CGImageSourceCreateWithURL failed: {file_path}")
                    # IfAbsent=true：优先用 EXIF 内嵌缩略图，无则下采样原图
                    # （不完全解码，比 OpenCV imread 快 1.5-2x）
                    opts = {
                        Quartz.kCGImageSourceThumbnailMaxPixelSize: max_px,
                        Quartz.kCGImageSourceCreateThumbnailWithTransform: True,
                        Quartz.kCGImageSourceShouldCacheImmediately: True,
                        Quartz.kCGImageSourceCreateThumbnailFromImageIfAbsent: True,
                    }
                    cg = Quartz.CGImageSourceCreateThumbnailAtIndex(source, 0, opts)
                    if cg is None:
                        raise RuntimeError(f"CGImageSourceCreateThumbnailAtIndex failed: {file_path}")
                    img = _cgimage_to_bgr(cg)
                return _bgr_to_bmp_bytes(img)
            except Exception:
                pass  # 降级到 OpenCV

        # --- 3. 兜底：OpenCV imread + resize ---
        # 按 max_px 等比缩放（与 ImageIO/QuickLook 保持宽高比的行为一致，
        # 而非旧代码的 cv2.resize(img, (width, height)) 强制拉伸）
        img = _cv_imread(file_path)
        h, w = img.shape[:2]
        scale = min(1.0, float(max_px) / float(max(h, w)))
        if scale < 1.0:
            img = cv2.resize(img, (max(1, int(round(w * scale))), max(1, int(round(h * scale)))),
                             interpolation=cv2.INTER_AREA)
        return _bgr_to_bmp_bytes(img)


def generate_thumbnails(
    file_paths: List[str],
    thumbs_path: str,
    width: int,
    height: int,
    update_progress_fn,
) -> None:
    """
    生成给定文件列表的缩略图并保存为 WEBP，同时根据 EXIF 修改文件时间。

    :param file_paths: 需要处理的图片绝对路径列表
    :param thumbs_path: 缩略图输出目录
    :param width: 缩略图宽度
    :param height: 缩略图高度
    :param update_progress_fn: 用于更新进度的回调函数，
                               形如 update_progress_fn(message, worker_id, value, total)
    """
    os.makedirs(thumbs_path, exist_ok=True)

    # 过滤出真实存在、扩展名合法的文件
    image_files: List[str] = []
    for p in file_paths:
        if not isinstance(p, str):
            continue
        abs_path = p
        if not os.path.isabs(abs_path):
            abs_path = os.path.abspath(abs_path)
        if not os.path.isfile(abs_path):
            continue
        if not abs_path.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        image_files.append(abs_path)

    if not image_files:
        print("No valid image files to process.")
        return

    completed_count = 0
    count_lock = threading.Lock()
    total_files = len(image_files)

    update_progress_fn(
        "缩略图生成中",
    )

    def process_image(image_file: str) -> None:
        """
        单张图片的处理逻辑：
        1. 调用 get_thumbnail 生成缩略图
        2. 以归一化路径的 CRC32 命名 .webp 文件
        3. 根据 EXIF 拍摄时间设置缩略图文件的 mtime/atime
        4. 通过 update_progress_fn 上报进度
        """
        nonlocal completed_count

        # 生成缩略图（BMP 数据）
        bmp_data = get_thumbnail(image_file, width, height)

        # 使用 OpenCV 处理 BMP 数据
        img_array = np.frombuffer(bmp_data, dtype=np.uint8)
        image = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

        if image is None:
            raise RuntimeError(f"Failed to decode thumbnail for {image_file}")

        # 使用归一化路径 (lower + '/') 生成 CRC32 作为文件名
        normalized_path = image_file.replace("\\", "/").lower()
        crc32_hash = zlib.crc32(normalized_path.encode("utf-8"))
        crc32_hex = f"{crc32_hash:08x}"
        output_file = os.path.join(thumbs_path, f"{crc32_hex}.webp")

        # 保存为 WEBP（使用支持中文路径的函数）
        cv_imwrite(output_file, image)

        # 更新进度
        with count_lock:
            completed_count += 1
            try:
                update_progress_fn(
                    "缩略图生成中",
                    worker_id=0,
                    value=completed_count,
                    total=total_files,
                )
            except Exception as e:
                print(f"update_progress_fn error: {e}")

    # 使用线程池并行处理图片
    with concurrent.futures.ThreadPoolExecutor() as executor:
        executor.map(process_image, image_files)

    try:
        update_progress_fn(
            "空闲中",
            worker_id=0,
            value=total_files,
            total=total_files,
        )
    except Exception as e:
        print(f"update_progress_fn error (final): {e}")


if __name__ == "__main__":
    # 示例使用
    file_path = r"G:\图谱\23.08.12双彩虹\Z30_2126-NEF_DxO_DeepPRIMEXD.jpg"  # 请将此路径替换为您的文件路径

    # 获取缩略图数据
    bmp_data = get_thumbnail(file_path, 96, 96)  # 96x96 尺寸
