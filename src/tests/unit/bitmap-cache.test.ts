/**
 * ImageBitmap 缓存逻辑单元测试
 * ===============================
 * 验证 getOrCreateBitmap 的三个核心不变量：
 * 1. in-flight 去重：同一 URL 并发调用返回同一 Promise，不重复 fetch/decode
 * 2. LRU 访问序：命中时移到末尾，淘汰时从头部移除
 * 3. 防淘汰当前页：currentDisplaySrc 对应的 bitmap 不被淘汰
 *
 * 这些不变量是 ImagePreview 切换照片零延迟的前提——
 * 若去重失效会导致重复解码 + ImageBitmap 泄漏（每张 79MB），
 * 若淘汰顺序错误会导致用户刚看过的照片被重新解码。
 */
import { vi } from "vitest";

// Mock createImageBitmap 和 fetch——jsdom 环境下两者均不存在
// ImageBitmap 是 GPU 后端句柄，测试中用普通对象模拟
const mockBitmap = (w: number, h: number): ImageBitmapLike => ({
  width: w,
  height: h,
  close: vi.fn(),
});

interface ImageBitmapLike {
  readonly width: number;
  readonly height: number;
  close(): void;
}

// 在模块加载前注入全局 mock，确保被测代码能访问
const bitmapStore = new Map<string, ImageBitmapLike>();
const mockCreateImageBitmap = vi.fn(
  async (blob: Blob): Promise<ImageBitmapLike> => {
    // 从 blob.text() 提取 URL 作为 key，模拟不同 URL 产生不同 bitmap
    const url = await blob.text();
    let bm = bitmapStore.get(url);
    if (!bm) {
      bm = mockBitmap(5568, 3712);
      bitmapStore.set(url, bm);
    }
    return bm;
  },
);
(
  globalThis as unknown as { createImageBitmap: typeof mockCreateImageBitmap }
).createImageBitmap = mockCreateImageBitmap;

const mockFetch = vi.fn(async (url: string) => ({
  blob: async () => ({
    text: async () => url,
    type: "image/jpeg",
  }),
}));
(globalThis as unknown as { fetch: typeof mockFetch }).fetch = mockFetch;

// 使用 path alias 导入（与 vitest.config.ts 的 alias 配置一致）
import {
  getOrCreateBitmap,
  bitmapCache,
  setCurrentDisplaySrc,
  resetBitmapCache,
} from "@/components/bitmapCache";

describe("ImageBitmap 缓存", () => {
  beforeEach(() => {
    resetBitmapCache();
    bitmapStore.clear();
    mockFetch.mockClear();
    vi.mocked(createImageBitmap).mockClear();
  });

  test("in-flight 去重：同一 URL 并发调用返回同一 Promise", async () => {
    const url = "local-resource:///test/A.jpg";
    // 并发发起两个请求
    const p1 = getOrCreateBitmap(url);
    const p2 = getOrCreateBitmap(url);
    // 应返回同一 Promise 实例——避免重复 fetch + createImageBitmap
    expect(p1).toBe(p2);
    const [bm1, bm2] = await Promise.all([p1, p2]);
    expect(bm1).toBe(bm2);
    // fetch 只调用一次（去重生效）
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  test("LRU 访问序：命中时移到末尾，淘汰时从头部移除", async () => {
    // 填满缓存（MAX_BITMAP_CACHE = 4），用 5 个 URL 验证淘汰
    const urls = ["A", "B", "C", "D", "E"].map(
      (n) => `local-resource:///test/${n}.jpg`,
    );
    // 填入 4 张
    for (let i = 0; i < 4; i++) await getOrCreateBitmap(urls[i]);
    // 访问 A（移到末尾，B 变成最旧）
    await getOrCreateBitmap(urls[0]);
    // 插入 E（应淘汰 B，而非 A）
    await getOrCreateBitmap(urls[4]);
    expect(bitmapCache.has(urls[0])).toBe(true); // A 保留（刚访问过）
    expect(bitmapCache.has(urls[1])).toBe(false); // B 被淘汰（最旧）
    expect(bitmapCache.has(urls[4])).toBe(true); // E 新插入
  });

  test("防淘汰当前页：currentDisplaySrc 不被 LRU 淘汰", async () => {
    const urls = ["A", "B", "C", "D", "E"].map(
      (n) => `local-resource:///test/${n}.jpg`,
    );
    // 填满缓存（MAX_BITMAP_CACHE = 4）
    for (let i = 0; i < 4; i++) await getOrCreateBitmap(urls[i]);
    // 设置 A 为当前显示——即使它是 LRU 最旧的也不应被淘汰
    setCurrentDisplaySrc(urls[0]);
    await getOrCreateBitmap(urls[4]); // 插入 E，需淘汰一个
    expect(bitmapCache.has(urls[0])).toBe(true); // 当前页保留
    expect(bitmapCache.has(urls[1])).toBe(false); // B 被淘汰（次旧）
    expect(bitmapCache.has(urls[4])).toBe(true);
  });

  test("缓存命中时零 fetch 零 decode", async () => {
    const url = "local-resource:///test/cached.jpg";
    await getOrCreateBitmap(url); // 首次：fetch + decode
    mockFetch.mockClear();
    mockCreateImageBitmap.mockClear();
    // 第二次：应直接从缓存返回，不触发 fetch/decode
    const bm = await getOrCreateBitmap(url);
    expect(bm).toBeDefined();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCreateImageBitmap).not.toHaveBeenCalled();
  });
});
