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
const IDLE_DETECT_DELAY = 600; // 空闲检测延迟（ms）

// ============================================================================
// 服务状态类型
// ============================================================================
interface ServiceState {
  isInitialized: boolean;
  isPolling: boolean;
  lastStatusTime: number;
  lastPhotosTime: number;
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
      const photos: PhotoExtend[] = await getPhotosExtendByCriteria(
        modeGalleryView === "group" ? -1 : -2,
        strSortedColumnKey,
        !boolShowDisabledPhotos,
      );

      let currentGroupId = 0;
      let skippedCount = 0;
      const groupedMap: { [key: number]: Photo[] } = {};
      const allExtends: PhotoExtend[] = [];

      // 处理未分组照片
      if (photos.length > 0) {
        groupedMap[currentGroupId] = photos.map((p): Photo => ({
          fileName: p.fileName,
          fileUrl: p.fileUrl,
          filePath: p.filePath,
          info: (p.IQA ?? 0).toString(),
          isEnabled: p.isEnabled ?? true,
        }));
        allExtends.push(...photos);
        currentGroupId++;
      }

      // 分组模式下继续加载各分组
      while (modeGalleryView === "group") {
        const groupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
          currentGroupId + skippedCount,
          strSortedColumnKey,
          !boolShowDisabledPhotos,
        );

        if (groupPhotos.length === 0) {
          if (skippedCount < 20) {
            skippedCount++;
            continue;
          }
          break;
        }

        groupedMap[currentGroupId] = groupPhotos.map((p): Photo => ({
          fileName: p.fileName,
          fileUrl: p.fileUrl,
          filePath: p.filePath,
          info: (p.IQA ?? 0).toString(),
          isEnabled: p.isEnabled ?? true,
        }));
        allExtends.push(...groupPhotos);
        currentGroupId++;
      }

      // 更新 Store
      store.fnSetGalleryGroupedPhotos(Object.values(groupedMap));
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
      const store = usePhotoFilterStore.getState();
      if (store.boolServerPollingNeeded) {
        this.pollServerStatus();
      }
    }, SERVER_STATUS_INTERVAL);

    // 照片刷新轮询
    this.photosTimer = setInterval(() => {
      const store = usePhotoFilterStore.getState();
      if (store.boolServerPollingNeeded) {
        this.refreshPhotos();
      }
    }, PHOTOS_REFRESH_INTERVAL);
  }

  /** 停止所有轮询 */
  stopPolling(): void {
    console.log("[PhotoService] Stopping polling...");
    this.state.isPolling = false;

    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.photosTimer) {
      clearInterval(this.photosTimer);
      this.photosTimer = null;
    }
  }

  /** 请求立即刷新照片数据 */
  requestRefresh(): void {
    // 直接异步刷新，不通过轮询循环
    this.refreshPhotos();
  }

  /** 启用/禁用服务端轮询 */
  setPollingEnabled(enabled: boolean): void {
    usePhotoFilterStore.getState().fnSetServerPollingNeeded(enabled);
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

  /** 检测服务端空闲状态 */
  private async checkIdleState(data: ServerData): Promise<void> {
    const submitTime = sessionStorage.getItem("submitTime");
    if (!submitTime) return;

    const elapsed = (Date.now() - parseInt(submitTime)) / 1000;

    if (elapsed > 2 && data.status === "空闲中") {
      // 延迟确认空闲状态
      await new Promise(resolve => setTimeout(resolve, IDLE_DETECT_DELAY));

      const currentData = usePhotoFilterStore.getState().objServerStatusData;
      if (currentData?.status === "空闲中") {
        console.log("[PhotoService] Server idle, stopping auto-polling");
        usePhotoFilterStore.getState().fnSetServerPollingNeeded(false);
        await this.refreshPhotos();
      }
    } else {
      usePhotoFilterStore.getState().fnSetServerPollingNeeded(true);
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
      sessionStorage.setItem("submitTime", Date.now().toString());

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
        this.setPollingEnabled(true);
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
      sessionStorage.setItem("submitTime", Date.now().toString());

      // 获取缩略图缓存目录
      let thumbsPath = options.thumbsPath || "../.cache/.thumbs";
      try {
        const electronAPI = (window as any)?.ElectronAPI;
        if (electronAPI?.getThumbsCacheDir) {
          thumbsPath = await electronAPI.getThumbsCacheDir();
        }
      } catch (error) {
        console.warn("[PhotoService] getThumbsCacheDir failed:", error);
      }

      // Fire-and-forget
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

      this.setPollingEnabled(true);
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
