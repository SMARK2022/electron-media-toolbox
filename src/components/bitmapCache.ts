/**
 * ImageBitmap 缓存模块
 * =====================
 * 用 createImageBitmap 替代 <img> 的解码路径，通过 ImageBitmap（GPU 后端句柄）
 * 确定性保持已解码图像在内存中——显式 close() 前不被 Blink MemoryCache 淘汰。
 *
 * 核心不变量：
 * 1. 同一 URL 的并发请求复用同一 in-flight Promise（避免重复解码 + bitmap 泄漏）
 * 2. LRU 访问序：命中时 delete + set 移到末尾，淘汰从头部移除
 * 3. currentDisplaySrc 对应的 bitmap 不被淘汰（用户正在看的图不能被回收）
 * 4. 重复写入同一 key 时 close 旧的 bitmap（防止泄漏）
 *
 * 加载路径：new Image() + img.onload → createImageBitmap(img)
 * 不用 fetch() 是因为 local-resource:// 的 standard:true 会使 fetch 对
 * Windows 盘符路径（如 H:）做严格 URL 校验时失败（port 解析歧义），
 * 根本不触达协议 handler。<img>.src 赋值不做严格 URL 校验即派发请求，
 * 与旧 <img> 元素加载行为一致，能正确触达 protocol.handle。
 */

// ImageBitmap 在 jsdom 中不存在，用接口约束类型；运行时由 Chromium 提供
export interface ImageBitmapLike {
  readonly width: number;
  readonly height: number;
  close(): void;
}

// 每张 5568×3712 解码后 ~79MB BGRA + canvas backing ~82MB。
// 缓存 4 张峰值 ~398MB——用户常在 3-5 张相似照片间反复对比，
// 4 张覆盖一个典型分组的前后切换。main.ts 的 LruBufferCache 可达 8GB，
// --max-old-space-size=16384 已预留充足堆空间
const MAX_BITMAP_CACHE = 4;

const bitmapCache = new Map<string, ImageBitmapLike>();

// in-flight Promise 去重：防止预热与 ImagePreview 同时请求同一 URL 导致重复解码
const inflight = new Map<string, Promise<ImageBitmapLike>>();

// 当前正在显示的 URL——LRU 淘汰时跳过此项，避免用户正在看的图被回收
let currentDisplaySrc = "";

export function setCurrentDisplaySrc(src: string): void {
  currentDisplaySrc = src;
}

export function getCachedBitmap(src: string): ImageBitmapLike | undefined {
  const cached = bitmapCache.get(src);
  if (cached) {
    // LRU 访问序：移到末尾（最近使用）
    bitmapCache.delete(src);
    bitmapCache.set(src, cached);
  }
  return cached;
}

/** 淘汰最旧的 bitmap（跳过 currentDisplaySrc），调用 close() 释放 GPU/CPU 内存 */
function evictOldest(): void {
  for (const key of bitmapCache.keys()) {
    if (key === currentDisplaySrc) continue; // 不淘汰当前正在显示的
    const old = bitmapCache.get(key);
    bitmapCache.delete(key);
    old?.close(); // 显式释放，防止 79MB 泄漏
    return;
  }
}

/**
 * 获取或创建 ImageBitmap。
 * - 缓存命中：零延迟返回（零 fetch、零 decode）
 * - in-flight 命中：复用同一 Promise（去重）
 * - 新请求：new Image() + img.onload 加载（与 <img> 相同的 URL 处理路径）
 *   → createImageBitmap(img) 转为 GPU 后端句柄
 */
export function getOrCreateBitmap(src: string): Promise<ImageBitmapLike> {
  // 1. 缓存命中
  const cached = getCachedBitmap(src);
  if (cached) return Promise.resolve(cached);

  // 2. in-flight 去重：复用正在进行的 Promise，避免重复解码
  const pending = inflight.get(src);
  if (pending) return pending;

  // 3. 新请求：用 <img> 加载（不走 fetch 的标准 URL 解析，正确处理 Windows 盘符路径）
  //    → img.onload 触发后 createImageBitmap(img) 转为 GPU 句柄
  const p = new Promise<ImageBitmapLike>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // createImageBitmap 从已解码的 HTMLImageElement 创建 GPU 后端句柄，
      // 显式 close() 前不被 Blink MemoryCache 淘汰
      createImageBitmap(img)
        .then((bitmap) => {
          // 解绑事件引用让 GC 回收 img 的解码数据——ImageBitmap 已持有独立副本。
          // 不用 img.src="" 因为空 src 会触发无意义的加载请求
          img.onload = null;
          img.onerror = null;
          resolve(bitmap as unknown as ImageBitmapLike);
        })
        .catch(reject);
    };
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  })
    .then((bitmap) => {
      inflight.delete(src);
      // 重复写入保护：若其他路径已缓存同一 URL，close 多余的避免泄漏
      if (!bitmapCache.has(src)) {
        // 淘汰最旧（跳过当前显示的），加防护防止全部被跳过时死循环
        const before = bitmapCache.size;
        while (bitmapCache.size >= MAX_BITMAP_CACHE) {
          evictOldest();
          if (bitmapCache.size === before) break; // 无法淘汰时退出
        }
        bitmapCache.set(src, bitmap);
        return bitmap;
      } else {
        // 已有缓存：close 刚解码的多余 bitmap，返回存活的缓存项
        bitmap.close();
        return bitmapCache.get(src)!;
      }
    })
    .catch((err) => {
      inflight.delete(src);
      throw err;
    });

  inflight.set(src, p);
  return p;
}

/** 测试辅助：重置缓存状态 */
export function resetBitmapCache(): void {
  for (const bm of bitmapCache.values()) bm.close();
  bitmapCache.clear();
  inflight.clear();
  currentDisplaySrc = "";
}

export { bitmapCache };
