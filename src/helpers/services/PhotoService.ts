/**
 * PhotoService - 统一的照片服务层
 * ================================
 * 管理整个应用生命周期内的：
 * - 数据库初始化
 * - 服务端状态轮询
 * - 照片数据同步
 * - 任务提交与进度追踪
 *
 * 服务在 App 级别初始化，所有页面共享同一实例
 */

import { initializeDatabase, getPhotos, getPhotosExtendByCriteria, Photo, PhotoExtend } from "@/helpers/ipc/database/db";
import { usePhotoFilterStore, type ServerData } from "@/helpers/store/usePhotoFilterStore";

// ============================================================================
// 服务配置常量
// ============================================================================
const SERVER_BASE_URL = "http://localhost:8000";
const SERVER_STATUS_INTERVAL = 500; // 服务端状态轮询间隔（ms）
const PHOTOS_REFRESH_INTERVAL = 4000; // 照片刷新间隔（ms）
const IDLE_DETECT_THRESHOLD = 2000; // 空闲检测阈值（ms）- 距离上次检测空闲满2秒后暂停

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

  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private photosTimer: ReturnType<typeof setInterval> | null = null;
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
      await this.loadInitialPhotos();

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

  // ========== 数据加载 ==========

  /** 加载初始照片数据到 Store */
  private async loadInitialPhotos(): Promise<void> {
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

  /** 提交缩略图生成任务 */
  async submitThumbnailTask(options: {
    filePaths: string[];
    thumbsPath?: string;
    width?: number;
    height?: number;
  }): Promise<boolean> {
    try {
      let thumbsPath = options.thumbsPath || "../.cache/.thumbs";
      try {
        const electronAPI = (window as any)?.ElectronAPI;
        if (electronAPI?.getThumbsCacheDir) {
          thumbsPath = await electronAPI.getThumbsCacheDir();
        }
      } catch (error) {
        console.warn("[PhotoService] getThumbsCacheDir failed:", error);
      }

      fetch(`${SERVER_BASE_URL}/generate_thumbnails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          file_paths: options.filePaths,
          thumbs_path: thumbsPath,
          width: options.width ?? 128,
          height: options.height ?? 128,
        }),
      }).catch(error => console.error("[PhotoService] Thumbnail task error:", error));

      usePhotoFilterStore.getState().fnSetServerPollingNeeded(true);
      return true;
    } catch (error) {
      console.error("[PhotoService] Submit thumbnail task error:", error);
      return false;
    }
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
