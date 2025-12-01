/**
 * PhotoService - 统一的照片服务层
 * ================================
 * 管理整个应用生命周期内的：
 * - 数据库初始化
 * - 服务端状态轮询
 * - 照片数据同步
 * - 任务提交与进度追踪
 * - 导入任务（缩略图 + EXIF）后台处理
 *
 * 服务在 App 级别初始化，所有页面共享同一实例
 */

import { initializeDatabase, getPhotos, getPhotosExtendByCriteria, addPhotosExtend, clearPhotos, updatePhotoExtendByPath, Photo, PhotoExtend } from "@/helpers/ipc/database/db";
import { usePhotoFilterStore, type ServerData } from "@/helpers/store/usePhotoFilterStore";

// ============================================================================
// 服务配置常量
// ============================================================================
const SERVER_BASE_URL = "http://localhost:8000";
const SERVER_STATUS_INTERVAL = 500; // 服务端状态轮询间隔（ms）
const PHOTOS_REFRESH_INTERVAL = 4000; // 照片刷新间隔（ms）
const IDLE_DETECT_THRESHOLD = 2000; // 空闲检测阈值（ms）- 距离上次检测空闲满2秒后暂停
const EXIF_BATCH_SIZE = 5; // EXIF 批量读取大小（每批并发数）
const EXIF_BATCH_DELAY = 100; // EXIF 批次间隔（ms）
const EXIF_DB_BATCH_SIZE = 20; // 每 20 条 EXIF 记录批量写入数据库一次

// 路径规范化工具函数
const normalizePath = (p: string) => p.replace(/\\/g, "/");

// ============================================================================
// 服务状态类型
// ============================================================================
interface ServiceState {
  isInitialized: boolean;
  isPolling: boolean;
  lastStatusTime: number;
  lastPhotosTime: number;
  lastIdleDetectTime: number | null; // 上次检测到空闲的时间
}

// 导入任务状态
interface ImportTaskState {
  isRunning: boolean; // 是否正在执行导入任务
  isComplete: boolean; // 任务是否完成
  totalFiles: number; // 总文件数
  processedFiles: number; // 已处理文件数
  thumbnailProgress: number; // 缩略图进度 (0-100)
  exifProgress: number; // EXIF 读取进度 (0-100)
  currentFile?: string; // 当前处理文件名
}

// ============================================================================
// PhotoService 单例
// ============================================================================
class PhotoServiceImpl {
  private state: ServiceState = {
    isInitialized: false,
    isPolling: false,
    lastStatusTime: 0,
    lastPhotosTime: 0,
    lastIdleDetectTime: null,
  };

  private importTask: ImportTaskState = {
    isRunning: false,
    isComplete: false,
    totalFiles: 0,
    processedFiles: 0,
    thumbnailProgress: 0,
    exifProgress: 0,
  };

  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private photosTimer: ReturnType<typeof setInterval> | null = null;
  private importProgressTimer: ReturnType<typeof setInterval> | null = null; // 导入进度轮询定时器
  private importTaskSubscribers: ((state: ImportTaskState) => void)[] = []; // 导入任务订阅列表
  private currentImportTaskId: number = 0; // 当前导入任务 ID（递增，用于区分不同任务）
  private formatStatusFn: ((data: ServerData | null) => string) | null = null;

  // ========== 生命周期 ==========

  /** 初始化服务（应在 App 挂载时调用一次） */
  async initialize(): Promise<void> {
    if (this.state.isInitialized) {
      console.log("[PhotoService] Already initialized, skipping...");
      return;
    }

    console.log("[PhotoService] Initializing...");

    try {
      // 初始化数据库
      await initializeDatabase();

      // 加载初始照片数据
      await this.loadPhotos();

      // 启动轮询
      this.startPolling();

      this.state.isInitialized = true;
      console.log("[PhotoService] Initialized successfully");
    } catch (error) {
      console.error("[PhotoService] Initialization failed:", error);
      throw error;
    }
  }

  /** 销毁服务（应在 App 卸载时调用） */
  destroy(): void {
    console.log("[PhotoService] Destroying...");
    this.stopPolling();
    this.state.isInitialized = false;
  }

  /** 设置状态格式化函数（由组件提供 i18n 翻译） */
  setStatusFormatter(fn: (data: ServerData | null) => string): void {
    this.formatStatusFn = fn;
  }

  // ========== 导入任务订阅 ==========

  /** 订阅导入任务状态变化 */
  subscribeImportTask(listener: (state: ImportTaskState) => void): () => void {
    this.importTaskSubscribers.push(listener);
    listener({ ...this.importTask }); // 立即回调当前状态
    return () => {
      this.importTaskSubscribers = this.importTaskSubscribers.filter(
        (l) => l !== listener
      );
    };
  }

  /** 通知所有订阅者导入任务状态更新 */
  private notifyImportTaskSubscribers(): void {
    const state = { ...this.importTask };
    this.importTaskSubscribers.forEach((listener) => listener(state));
  }

  /** 取消导入任务 */
  cancelImportTask(): void {
    if (!this.importTask.isRunning) return;
    console.log("[PhotoService] Cancelling import task, invalidating taskId:", this.currentImportTaskId);
    // 递增任务 ID，使所有旧任务的更新操作失效
    this.currentImportTaskId++;
    this.importTask = {
      isRunning: false,
      isComplete: false,
      totalFiles: 0,
      processedFiles: 0,
      thumbnailProgress: 0,
      exifProgress: 0,
    };
    this.notifyImportTaskSubscribers();
    if (this.importProgressTimer) {
      clearInterval(this.importProgressTimer);
      this.importProgressTimer = null;
    }
  }

  /** 关闭导入 Toast（重置完成状态） */
  dismissImportToast(): void {
    this.importTask = {
      isRunning: false,
      isComplete: false,
      totalFiles: 0,
      processedFiles: 0,
      thumbnailProgress: 0,
      exifProgress: 0,
    };
    this.notifyImportTaskSubscribers();
  }

  // ========== 数据加载 ==========

  /** 加载初始照片数据到 Store */
  private async loadPhotos(): Promise<void> {
    try {
      const savedPhotos = await getPhotos();
      const store = usePhotoFilterStore.getState();

      if (Array.isArray(savedPhotos) && savedPhotos.length > 0) {
        store.fnSetAllPhotos(savedPhotos);
        console.log(`[PhotoService] Loaded ${savedPhotos.length} photos from DB`);
      } else {
        store.fnSetAllPhotos([]);
      }
    } catch (error) {
      console.error("[PhotoService] Failed to load initial photos:", error);
      usePhotoFilterStore.getState().fnSetAllPhotos([]);
    }
  }

  /** 刷新照片数据（支持分组/全部模式） */
  async refreshPhotos(): Promise<void> {
    const store = usePhotoFilterStore.getState();
    const { modeGalleryView, strSortedColumnKey, boolShowDisabledPhotos } = store;

    try {
      await this.loadPhotos(); // 先加载最新照片列表
      // 总览模式：使用 -2 获取所有照片；分组模式：使用 -1 获取未分组照片
      const photos: PhotoExtend[] = await getPhotosExtendByCriteria(
        modeGalleryView === "group" ? -1 : -2,
        strSortedColumnKey,
        !boolShowDisabledPhotos,
      );

      const groupedPhotos: Photo[][] = []; // 使用数组而非 Map，保证顺序稳定
      const allExtends: PhotoExtend[] = [];

      // 将照片转换为 Photo 格式的辅助函数
      const toPhoto = (p: PhotoExtend): Photo => ({
        fileName: p.fileName,
        fileUrl: p.fileUrl,
        filePath: p.filePath,
        info: (p.IQA ?? 0).toString(),
        isEnabled: p.isEnabled ?? true,
      });

      // 总览模式：直接将所有照片放入一个分组
      if (modeGalleryView === "total") {
        if (photos.length > 0) {
          groupedPhotos.push(photos.map(toPhoto));
          allExtends.push(...photos);
        }
      } else {
        // 分组模式：先处理未分组照片（groupId = -1），再加载各分组
        if (photos.length > 0) {
          groupedPhotos.push(photos.map(toPhoto));
          allExtends.push(...photos);
        }

        // 继续加载各分组（groupId = 0, 1, 2, ...）
        let currentGroupId = 0;
        let consecutiveEmpty = 0; // 连续空分组计数，用于提前终止
        const MAX_EMPTY_GROUPS = 20; // 最大连续空分组数

        while (consecutiveEmpty < MAX_EMPTY_GROUPS) {
          const groupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
            currentGroupId,
            strSortedColumnKey,
            !boolShowDisabledPhotos,
          );

          if (groupPhotos.length === 0) {
            consecutiveEmpty++;
            currentGroupId++;
            continue;
          }

          // 找到有效分组，重置空计数
          consecutiveEmpty = 0;
          groupedPhotos.push(groupPhotos.map(toPhoto));
          allExtends.push(...groupPhotos);
          currentGroupId++;
        }
      }

      // 更新 Store（即使 groupedPhotos 为空也要更新，确保清空旧数据）
      store.fnSetGalleryGroupedPhotos(groupedPhotos);
      store.fnCalculateEyeStats(allExtends);

      this.state.lastPhotosTime = Date.now();
    } catch (error) {
      console.error("[PhotoService] Failed to refresh photos:", error);
    }
  }

  // ========== 轮询管理 ==========

  /** 启动所有轮询 */
  startPolling(): void {
    if (this.state.isPolling) return;

    console.log("[PhotoService] Starting polling...");
    this.state.isPolling = true;

    // 立即执行一次
    this.pollServerStatus();
    this.refreshPhotos();

    // 服务状态轮询
    this.statusTimer = setInterval(() => {
      if (usePhotoFilterStore.getState().boolServerPollingNeeded) {
        this.pollServerStatus();
      }
    }, SERVER_STATUS_INTERVAL);

    // 照片刷新轮询
    this.photosTimer = setInterval(() => {
      if (usePhotoFilterStore.getState().boolServerPollingNeeded) {
        this.refreshPhotos();
      }
    }, PHOTOS_REFRESH_INTERVAL);
  }

  /** 停止所有轮询 */
  stopPolling(): void {
    console.log("[PhotoService] Stopping polling...");
    this.state.isPolling = false;

    if (this.statusTimer) clearInterval(this.statusTimer);
    if (this.photosTimer) clearInterval(this.photosTimer);

    this.statusTimer = null;
    this.photosTimer = null;
  }

  // ========== 服务端通信 ==========

  /** 轮询服务端状态 */
  private async pollServerStatus(): Promise<void> {
    const store = usePhotoFilterStore.getState();

    try {
      const response = await fetch(`${SERVER_BASE_URL}/status`);
      if (!response.ok) {
        this.updateStatusText(null);
        return;
      }

      const data: ServerData = await response.json();
      this.updateStatusText(data);
      store.fnSetServerStatusData(data);

      // 检测空闲状态
      await this.checkIdleState(data);

      this.state.lastStatusTime = Date.now();
    } catch {
      this.updateStatusText(null);
    }
  }

  /** 检测并处理服务端空闲状态 */
  private async checkIdleState(data: ServerData): Promise<void> {
    const store = usePhotoFilterStore.getState();

    if (data.status !== "空闲中") {
      // 服务非空闲，启用轮询并重置空闲检测时间
      store.fnSetServerPollingNeeded(true);
      this.state.lastIdleDetectTime = null;
      return;
    }

    // 首次检测到空闲
    if (this.state.lastIdleDetectTime === null) {
      this.state.lastIdleDetectTime = Date.now();
      store.fnSetServerPollingNeeded(true);
      return;
    }

    // 检查距离上次空闲检测是否超过阈值
    const timeSinceLastIdle = Date.now() - this.state.lastIdleDetectTime;
    if (timeSinceLastIdle >= IDLE_DETECT_THRESHOLD) {
      console.log("[PhotoService] Server idle detected, stopping auto-polling");
      store.fnSetServerPollingNeeded(false);
      this.state.lastIdleDetectTime = null; // 重置以便下次任务重新计时
      await this.refreshPhotos();
    }
  }

  /** 更新状态文本 */
  private updateStatusText(data: ServerData | null): void {
    const text = this.formatStatusFn
      ? this.formatStatusFn(data)
      : data?.status ?? "Unknown";
    usePhotoFilterStore.getState().fnSetServerStatusText(text);
  }

  // ========== 任务提交 ==========

  /** 提交检测任务 */
  async submitDetectionTask(options: {
    similarityThreshold: number;
    showDisabledPhotos: boolean;
  }): Promise<boolean> {
    try {
      const dbPath = await (window as any).ElectronDB?.getDbPath?.();
      if (!dbPath) {
        console.error("[PhotoService] Failed to get DB path");
        return false;
      }

      const response = await fetch(`${SERVER_BASE_URL}/detect_images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          similarity_threshold: options.similarityThreshold,
          db_path: dbPath,
          show_disabled_photos: options.showDisabledPhotos,
        }),
      });

      if (response.ok) {
        console.log("[PhotoService] Detection task submitted");
        usePhotoFilterStore.getState().fnSetServerPollingNeeded(true);
        return true;
      }

      console.error("[PhotoService] Failed to submit detection task");
      return false;
    } catch (error) {
      console.error("[PhotoService] Submit detection task error:", error);
      return false;
    }
  }

  /**
   * 提交导入任务（整合缩略图生成 + EXIF 读取）
   * 立即将照片添加到列表，后台异步处理缩略图和 EXIF
   * 新导入时自动取消之前的任务
   */
  async submitImportTask(options: {
    filePaths: string[];
    onComplete?: () => void;
  }): Promise<boolean> {
    const { filePaths, onComplete } = options;
    if (!filePaths.length) return false;

    // 1. 如果已有导入任务运行中，先取消它（递增 taskId 使旧任务失效）
    if (this.importTask.isRunning) {
      console.log("[PhotoService] Cancelling previous import task");
      this.currentImportTaskId++;
    }

    // 2. 递增并捕获当前任务 ID
    this.currentImportTaskId++;
    const taskId = this.currentImportTaskId;
    console.log(`[PhotoService] Starting import task with ID: ${taskId}`);

    // 3. 路径去重与规范化
    const uniquePaths = [...new Set(filePaths.map(normalizePath))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    const total = uniquePaths.length;
    console.log(`[PhotoService] Starting import task for ${total} files`);

    // 4. 初始化导入任务状态
    this.importTask = {
      isRunning: true,
      isComplete: false,
      totalFiles: total,
      processedFiles: 0,
      thumbnailProgress: 0,
      exifProgress: 0,
    };
    this.notifyImportTaskSubscribers();

    // 5. 立即构建占位照片列表并写入 DB + Store
    const placeholderPhotos: PhotoExtend[] = uniquePaths.map((absPath) => ({
      fileName: absPath.split("/").pop() || "",
      fileUrl: `thumbnail-resource://${absPath}`,
      filePath: absPath,
      isEnabled: true,
    }));
    clearPhotos();
    initializeDatabase();
    addPhotosExtend(placeholderPhotos);
    const store = usePhotoFilterStore.getState();
    store.fnSetAllPhotos(
      placeholderPhotos.map((p) => ({
        fileName: p.fileName,
        fileUrl: p.fileUrl,
        filePath: p.filePath,
        info: "",
        isEnabled: true,
      }))
    );

    // 6. 启动缩略图生成（后台，传入 taskId）
    this.startThumbnailGeneration(uniquePaths, taskId).catch(console.error);

    // 7. 启动 EXIF 读取（后台，带进度更新，传入 taskId）
    this.startExifExtraction(uniquePaths, taskId)
      .then(() => {
        // 检查任务是否仍然有效
        if (taskId !== this.currentImportTaskId) {
          console.log(`[PhotoService] Import task ${taskId} was superseded, skipping completion`);
          return;
        }
        this.finishImportTask(taskId);
        onComplete?.();
      })
      .catch((err) => {
        if (taskId !== this.currentImportTaskId) {
          console.log(`[PhotoService] Import task ${taskId} was superseded, ignoring error`);
          return;
        }
        console.error("[PhotoService] EXIF extraction error:", err);
        this.finishImportTask(taskId);
      });

    // 8. 启动进度轮询（定期更新状态）
    this.startImportProgressPolling();

    return true;
  }

  /** 生成进度文本 */
  private getImportProgressText(): string {
    const { thumbnailProgress, exifProgress, processedFiles, totalFiles } = this.importTask;
    const avgProgress = Math.round((thumbnailProgress + exifProgress) / 2);
    return `缩略图: ${Math.round(thumbnailProgress)}% | EXIF: ${Math.round(exifProgress)}% | 总进度: ${avgProgress}% (${processedFiles}/${totalFiles} 张)`;
  }

  /** 启动缩略图生成任务 */
  private async startThumbnailGeneration(filePaths: string[], taskId: number): Promise<void> {
    try {
      // 检查任务是否仍然有效
      if (taskId !== this.currentImportTaskId) {
        console.log(`[PhotoService] Thumbnail task ${taskId} superseded, skipping`);
        return;
      }

      let thumbsPath = "../.cache/.thumbs";
      try {
        const electronAPI = (window as any)?.ElectronAPI;
        if (electronAPI?.getThumbsCacheDir) thumbsPath = await electronAPI.getThumbsCacheDir();
      } catch (e) { /* ignore */ }

      await fetch(`${SERVER_BASE_URL}/generate_thumbnails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_paths: filePaths, thumbs_path: thumbsPath, width: 128, height: 128 }),
      });

      // 检查任务是否仍然有效
      if (taskId !== this.currentImportTaskId) {
        console.log(`[PhotoService] Thumbnail task ${taskId} superseded after fetch, skipping store update`);
        return;
      }

      usePhotoFilterStore.getState().fnSetServerPollingNeeded(true);
    } catch (error) {
      console.error("[PhotoService] Thumbnail generation error:", error);
    }
  }

  /** 启动 EXIF 读取任务（分批处理，带进度更新，更新 DB 和 Store） */
  private async startExifExtraction(filePaths: string[], taskId: number): Promise<void> {
    const total = filePaths.length;
    let completed = 0;
    const exifBatch: Array<{ path: string; updates: { date?: string; fileSize?: number; info?: string } }> = []; // 缓存要写入的 EXIF 数据

    for (let i = 0; i < total; i += EXIF_BATCH_SIZE) {
      // 检查任务是否仍然有效
      if (taskId !== this.currentImportTaskId) {
        console.log(`[PhotoService] EXIF task ${taskId} superseded at batch ${i}, stopping`);
        return;
      }

      const batch = filePaths.slice(i, i + EXIF_BATCH_SIZE);
      await Promise.all(
        batch.map(async (absPath) => {
          // 在处理每个文件前检查任务是否仍然有效
          if (taskId !== this.currentImportTaskId) return;

          try {
            const store = usePhotoFilterStore.getState(); // 每次获取最新 store
            const metadata = await store.fnGetPhotoMetadata(absPath);

            // 异步操作后再次检查任务是否仍然有效
            if (taskId !== this.currentImportTaskId) return;

            const exifData = metadata?.exif ?? null;

            // 解析 EXIF 数据
            const captureTime = exifData?.captureTime
              ? new Date(exifData.captureTime * 1000).toLocaleString()
              : undefined;
            const fileSize = exifData?.fileSize ?? undefined;
            const infoStr =
              exifData?.ExposureTime && exifData?.LensModel
                ? `1/${Math.round(1 / exifData.ExposureTime)} ${exifData.LensModel}`
                : undefined;

            // 收集 EXIF 数据到缓存，而不是立即写入
            exifBatch.push({ path: absPath, updates: { date: captureTime, fileSize, info: infoStr } });

            // 检查任务是否仍然有效，然后才更新 Store
            if (taskId !== this.currentImportTaskId) return;

            // 实时更新 Store 中的照片信息（UI 实时反馈）
            const currentStore = usePhotoFilterStore.getState();
            currentStore.fnSetAllPhotos(
              currentStore.lstAllPhotos.map((p) =>
                p.filePath === absPath
                  ? { ...p, info: captureTime || "" }
                  : p
              )
            );
          } catch (e) {
            console.warn(
              `[PhotoService] EXIF extraction failed for ${absPath}:`,
              e
            );
          }

          // 更新进度前检查任务是否仍然有效
          if (taskId !== this.currentImportTaskId) return;

          completed++;
          this.importTask.processedFiles = completed; // 更新已处理文件数
          this.importTask.exifProgress = (completed / total) * 100;
          this.notifyImportTaskSubscribers();

          // 缓存满 EXIF_DB_BATCH_SIZE 条或最后一条时，批量写入数据库
          if (exifBatch.length >= EXIF_DB_BATCH_SIZE || completed === total) {
            // 写入数据库前检查任务是否仍然有效
            if (taskId !== this.currentImportTaskId) return;
            await this.writeExifBatchToDb(exifBatch);
            exifBatch.length = 0; // 清空缓存
          }
        })
      );

      // 批次间延迟前检查任务是否仍然有效
      if (taskId !== this.currentImportTaskId) {
        console.log(`[PhotoService] EXIF task ${taskId} superseded after batch, stopping`);
        return;
      }

      if (i + EXIF_BATCH_SIZE < total) {
        await new Promise((r) => setTimeout(r, EXIF_BATCH_DELAY));
      }
    }

    // 最后确保所有剩余数据都写入数据库
    if (taskId === this.currentImportTaskId && exifBatch.length > 0) {
      await this.writeExifBatchToDb(exifBatch);
    }
  }

  /** 批量将 EXIF 数据写入数据库 */
  private async writeExifBatchToDb(
    batch: Array<{ path: string; updates: { date?: string; fileSize?: number; info?: string } }>
  ): Promise<void> {
    if (batch.length === 0) return;
    try {
      // 顺序执行数据库更新，保持事务的原子性和一致性
      for (const item of batch) {
        await updatePhotoExtendByPath(item.path, item.updates);
      }
      console.log(`[PhotoService] Wrote ${batch.length} EXIF records to DB`);
    } catch (e) {
      console.error("[PhotoService] Error writing EXIF batch to DB:", e);
    }
  }

  /** 启动导入进度轮询 */
  private startImportProgressPolling(): void {
    if (this.importProgressTimer) clearInterval(this.importProgressTimer);
    this.importProgressTimer = setInterval(() => {
      this.updateImportProgress();
    }, SERVER_STATUS_INTERVAL);
  }

  /** 更新导入进度（从服务端获取缩略图进度，通知订阅者） */
  private async updateImportProgress(): Promise<void> {
    if (!this.importTask.isRunning) return;
    try {
      const response = await fetch(`${SERVER_BASE_URL}/status`);
      if (response.ok) {
        const data: ServerData = await response.json();
        // 从 workers 中提取进度（假设 worker0 格式为 "缩略图: 50/100"）
        const worker0 = data.workers?.[0] || "";
        const match = worker0.match(/(\d+)\/(\d+)/);
        if (match) {
          const [, done, total] = match.map(Number);
          this.importTask.thumbnailProgress =
            total > 0 ? (done / total) * 100 : 0;
        } else if (data.status === "空闲中") {
          this.importTask.thumbnailProgress = 100; // 服务空闲说明缩略图已完成
        }
        this.notifyImportTaskSubscribers();
      }
    } catch {
      /* ignore */
    }
  }

  /** 完成导入任务 */
  private finishImportTask(taskId: number): void {
    // 检查任务是否仍然有效
    if (taskId !== this.currentImportTaskId) {
      console.log(`[PhotoService] Import task ${taskId} superseded, skipping finish`);
      return;
    }

    if (this.importProgressTimer) {
      clearInterval(this.importProgressTimer);
      this.importProgressTimer = null;
    }
    // 标记为完成，Toast 组件会自动 1s 后退出
    this.importTask.isRunning = false;
    this.importTask.isComplete = true;
    this.notifyImportTaskSubscribers();
    console.log(`[PhotoService] Import task ${taskId} completed`);
  }

  /** 获取导入任务是否正在运行 */
  get isImportRunning(): boolean {
    return this.importTask.isRunning;
  }

  // ========== 状态查询 ==========

  /** 获取服务是否已初始化 */
  get isInitialized(): boolean {
    return this.state.isInitialized;
  }

  /** 获取当前是否正在轮询 */
  get isPolling(): boolean {
    return this.state.isPolling;
  }
}

// 导出单例
export const PhotoService = new PhotoServiceImpl();

// ============================================================================
// React Hook - 用于组件中访问服务
// ============================================================================
export function usePhotoService() {
  return PhotoService;
}
