import asyncio
import concurrent.futures
import ctypes
import io
import os
# 组合文件头、信息头和图像数据
import struct
import time
import zlib
from concurrent.futures import ThreadPoolExecutor
from ctypes import HRESULT, POINTER, WinError, byref, windll
from ctypes.wintypes import DWORD, LONG, UINT, WORD

import aiofiles
from comtypes import COMMETHOD, GUID, IUnknown
from PIL import Image
from PIL.ExifTags import TAGS

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
    _iid_ = GUID('{bcc18b79-ba16-442f-80c4-8a59c30c463b}')
    _methods_ = [
        COMMETHOD(
            [],
            HRESULT,
            'GetImage',
            (['in'], SIZE, 'size'),
            (['in'], ctypes.c_int, 'flags'),
            (['out'], POINTER(HBITMAP), 'phbm'),
        )
    ]


# 定义 IShellItem 接口
class IShellItem(IUnknown):
    _iid_ = GUID('{43826D1E-E718-42EE-BC55-A1E261C37BFE}')
    _methods_ = []


def get_thumbnail(file_path, width, height):
    from comtypes import CoInitialize, CoUninitialize

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
            ('bmType', LONG),
            ('bmWidth', LONG),
            ('bmHeight', LONG),
            ('bmWidthBytes', LONG),
            ('bmPlanes', WORD),
            ('bmBitsPixel', WORD),
            ('bmBits', ctypes.c_void_p),
        ]

    bitmap = BITMAP()
    res = windll.gdi32.GetObjectW(hbitmap, ctypes.sizeof(BITMAP), byref(bitmap))
    if res == 0:
        raise WinError()

    # 获取位图数据
    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ('biSize', DWORD),
            ('biWidth', LONG),
            ('biHeight', LONG),
            ('biPlanes', WORD),
            ('biBitCount', WORD),
            ('biCompression', DWORD),
            ('biSizeImage', DWORD),
            ('biXPelsPerMeter', LONG),
            ('biYPelsPerMeter', LONG),
            ('biClrUsed', DWORD),
            ('biClrImportant', DWORD),
        ]

    class BITMAPINFO(ctypes.Structure):
        _fields_ = [
            ('bmiHeader', BITMAPINFOHEADER),
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
            ('bfType', WORD),
            ('bfSize', DWORD),
            ('bfReserved1', WORD),
            ('bfReserved2', WORD),
            ('bfOffBits', DWORD),
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
    bmp_data.extend(
        struct.pack(
            '<HIHHI', bmfh.bfType, bmfh.bfSize, bmfh.bfReserved1, bmfh.bfReserved2, bmfh.bfOffBits
        )
    )
    bmp_data.extend(bytearray(bytes(bmi.bmiHeader)))
    bmp_data.extend(image_buffer)

    CoUninitialize()

    return bmp_data


def get_image_capture_time(image_path):
    """获取图片的拍摄时间，如果没有则使用文件的创建时间"""
    image = Image.open(image_path)
    exif_data = image._getexif()
    if exif_data:
        for tag, value in exif_data.items():
            tag_name = TAGS.get(tag, tag)
            if tag_name == 'DateTimeOriginal':
                return value
    # 如果没有拍摄时间，返回文件的创建时间
    creation_time = time.strftime('%Y:%m:%d %H:%M:%S', time.localtime(os.path.getctime(image_path)))
    return creation_time


def generate_thumbnails(folder_path, thumbs_path, width, height):
    """生成缩略图并保存为WEBP，同时修改文件时间"""
    os.makedirs(thumbs_path, exist_ok=True)

    image_files = [
        os.path.join(folder_path, f)
        for f in os.listdir(folder_path)
        if f.lower().endswith(('.jpg', '.png'))
    ]

    if not image_files:
        print("No image files found in the specified directory.")
        return

    start_time = time.time()

    def process_image(image_file):
        bmp_data = get_thumbnail(image_file, width, height)
        image = Image.open(io.BytesIO(bmp_data))
        normalized_path = image_file.replace("\\", "/").lower()
        crc32_hash = zlib.crc32(normalized_path.encode('utf-8'))
        crc32_hex = f"{crc32_hash:08x}"
        output_file = os.path.join(thumbs_path, f"{crc32_hex}.webp")
        image.save(output_file, "WEBP")
        capture_time = get_image_capture_time(image_file)
        time_struct = time.strptime(capture_time, "%Y:%m:%d %H:%M:%S")
        timestamp = time.mktime(time_struct)
        os.utime(output_file, (timestamp, timestamp))

    with concurrent.futures.ThreadPoolExecutor() as executor:
        executor.map(process_image, image_files)

    end_time = time.time()
    avg_time = (end_time - start_time) / len(image_files)
    print(f"Average loading time per image: {avg_time:.4f} seconds")


if __name__ == "__main__":

    # 示例使用
    file_path = (
        r"G:\图谱\23.08.12双彩虹\Z30_2126-NEF_DxO_DeepPRIMEXD.jpg"  # 请将此路径替换为您的文件路径
    )

    # 获取缩略图数据
    bmp_data = get_thumbnail(file_path, 96, 96)  # 96x96 尺寸
