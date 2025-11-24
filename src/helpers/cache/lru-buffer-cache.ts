export interface CacheEntry {
  data: Buffer;
  mimeType: string;
  size: number; // bytes
}

/**
 * 简单的基于 Map 的 LRU 缓存，按总字节数做容量控制。
 */
export class LruBufferCache {
  private maxSize: number;
  private currentSize = 0;
  private map = new Map<string, CacheEntry>();

  constructor(maxSizeBytes: number) {
    this.maxSize = maxSizeBytes;
  }

  get sizeBytes() {
    return this.currentSize;
  }

  get capacityBytes() {
    return this.maxSize;
  }

  get(key: string): CacheEntry | undefined {
    const value = this.map.get(key);
    if (!value) return undefined;

    // 更新最近使用：删除后重新插入
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, entry: CacheEntry) {
    const { size } = entry;

    // 单个文件超过容量上限，直接不缓存
    if (size > this.maxSize) return;

    // 覆盖旧值时先减掉旧的空间
    const existing = this.map.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      this.map.delete(key);
    }

    // 腾出空间
    while (this.currentSize + size > this.maxSize && this.map.size > 0) {
      const oldestKey = this.map.keys().next().value as string;
      const oldest = this.map.get(oldestKey)!;
      this.currentSize -= oldest.size;
      this.map.delete(oldestKey);
    }

    this.map.set(key, entry);
    this.currentSize += size;
  }

  clear() {
    this.map.clear();
    this.currentSize = 0;
  }
}
