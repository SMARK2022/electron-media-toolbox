/**
 * LRU 缓存单元测试
 * =================
 * 锁定 LruBufferCache 的淘汰语义：Map 插入顺序 = LRU 顺序，
 * get 会将条目移到最新位置，单条超容量时静默丢弃。
 */
import {
  LruBufferCache,
  type CacheEntry,
} from "@/helpers/cache/lru-buffer-cache";

// 构造 Buffer 条目的辅助函数，保持测试简洁
function makeEntry(data: string, mimeType = "image/jpeg"): CacheEntry {
  return { data: Buffer.from(data), mimeType, size: Buffer.byteLength(data) };
}

// ============================================================================
// 基本读写
// ============================================================================
describe("LruBufferCache 基本读写", () => {
  test("set 后 get 返回相同条目", () => {
    const cache = new LruBufferCache(1024);
    const entry = makeEntry("hello");
    cache.set("key1", entry);

    const result = cache.get("key1");
    expect(result).toBeDefined();
    expect(result!.data.toString()).toBe("hello");
  });

  test("get 不存在的 key 返回 undefined", () => {
    const cache = new LruBufferCache(1024);
    expect(cache.get("missing")).toBeUndefined();
  });

  test("sizeBytes 反映当前缓存总字节数", () => {
    const cache = new LruBufferCache(1024);
    cache.set("a", makeEntry("aaa")); // 3 bytes
    cache.set("b", makeEntry("bb")); // 2 bytes
    expect(cache.sizeBytes).toBe(5);
  });

  test("capacityBytes 返回构造时设定的最大容量", () => {
    const cache = new LruBufferCache(2048);
    expect(cache.capacityBytes).toBe(2048);
  });
});

// ============================================================================
// LRU 淘汰策略
// ============================================================================
describe("LRU 淘汰顺序", () => {
  test("容量不足时淘汰最久未使用的条目", () => {
    // 容量 5 bytes，放入 a(3) + b(2) = 5，再加 c(3) 需淘汰 a
    const cache = new LruBufferCache(5);
    cache.set("a", makeEntry("aaa")); // 3
    cache.set("b", makeEntry("bb")); // 2，满了
    cache.set("c", makeEntry("ccc")); // 3，需淘汰 a（最旧）

    expect(cache.get("a")).toBeUndefined(); // a 被淘汰
    expect(cache.get("b")).toBeDefined(); // b 保留
    expect(cache.get("c")).toBeDefined(); // c 保留
  });

  test("get 会将条目移到最新位置，影响后续淘汰顺序", () => {
    // 容量 6：a(3) + b(3) = 6 满了；get(a) 后 a 变最新，b 变最旧
    // 再加 c(3) 需淘汰 b（3 bytes），腾出空间后 a(3)+c(3)=6 刚好
    const cache = new LruBufferCache(6);
    cache.set("a", makeEntry("aaa"));
    cache.set("b", makeEntry("bbb"));

    cache.get("a"); // a 移到最新位置，b 变最旧

    cache.set("c", makeEntry("ccc")); // 淘汰 b（最旧），a 因 get 保留
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined(); // a 因 get 而保留
  });

  test("连续淘汰多条直到腾出足够空间", () => {
    // 容量 10：a(3)+b(3)+c(3)=9，加 d(8) 需淘汰 a+b+c 全部
    const cache = new LruBufferCache(10);
    cache.set("a", makeEntry("aaa"));
    cache.set("b", makeEntry("bbb"));
    cache.set("c", makeEntry("ccc"));
    cache.set("d", makeEntry("dddddddd")); // 8 bytes

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
    expect(cache.get("d")).toBeDefined();
    expect(cache.sizeBytes).toBe(8);
  });
});

// ============================================================================
// 覆盖旧值
// ============================================================================
describe("覆盖已存在的 key", () => {
  test("覆盖时先扣除旧条目大小再加入新条目", () => {
    const cache = new LruBufferCache(10);
    cache.set("key", makeEntry("aaa")); // 3 bytes
    expect(cache.sizeBytes).toBe(3);

    cache.set("key", makeEntry("bbbbb")); // 5 bytes，覆盖旧值
    expect(cache.sizeBytes).toBe(5); // 不是 3+5=8，而是 5
    expect(cache.get("key")!.data.toString()).toBe("bbbbb");
  });

  test("覆盖后条目移到最新位置", () => {
    // 容量 6：a(3) + b(3) = 6 满；覆盖 a 为 2 bytes → b(3)+a(2)=5
    // 再加 c(3) 需淘汰 b（最旧），a 因覆盖移到最新而保留
    const cache = new LruBufferCache(6);
    cache.set("a", makeEntry("aaa")); // 3
    cache.set("b", makeEntry("bbb")); // 3

    cache.set("a", makeEntry("aa")); // 覆盖 a：扣旧 3，加新 2，a 移到最新

    cache.set("c", makeEntry("ccc")); // 3，淘汰 b（最旧）
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBeDefined(); // a 因覆盖而保留
  });
});

// ============================================================================
// 单条超容量
// ============================================================================
describe("单条超过最大容量", () => {
  test("单个条目大小超过 maxSize 时静默丢弃，不抛异常", () => {
    // 主进程缓存图片缩略图时，单张超大图不应导致缓存崩溃
    const cache = new LruBufferCache(5);
    cache.set("big", makeEntry("dddddddddd")); // 10 bytes > 5 bytes

    expect(cache.get("big")).toBeUndefined();
    expect(cache.sizeBytes).toBe(0); // 未加入缓存
  });

  test("超限条目不影响已有缓存内容", () => {
    const cache = new LruBufferCache(5);
    cache.set("a", makeEntry("aaa")); // 3 bytes
    cache.set("big", makeEntry("dddddddddd")); // 超限，丢弃

    expect(cache.get("a")).toBeDefined();
    expect(cache.sizeBytes).toBe(3);
  });
});

// ============================================================================
// clear 重置
// ============================================================================
describe("clear 重置", () => {
  test("清空后所有条目消失，sizeBytes 归零", () => {
    const cache = new LruBufferCache(1024);
    cache.set("a", makeEntry("aaa"));
    cache.set("b", makeEntry("bbb"));

    cache.clear();

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.sizeBytes).toBe(0);
  });

  test("clear 后 capacityBytes 不变", () => {
    const cache = new LruBufferCache(2048);
    cache.set("a", makeEntry("aaa"));
    cache.clear();

    expect(cache.capacityBytes).toBe(2048);
  });
});
