import { create } from "zustand";
import {
  Photo,
  PhotoExtend,
  getPhotosExtendByPhotos,
  updatePhotoEnabledStatus,
  deletePhotoByPath,
} from "@/helpers/ipc/database/db";

export type GalleryMode = "group" | "total";

export type PhotoPage = "import" | "filter" | "export";

export interface ServerData {
  status: string;
  task_queue_length: number;
  workers: string[];
}

// ============================================================================
// 眨眼状态阈值常量 & 工具函数（统一管理，避免多处硬编码）
// ============================================================================
/** 闭眼阈值：eye_open < 此值 判定为闭眼 */
export const EYE_THRESHOLD_CLOSED = 0.35;
/** 疑似闭眼阈值：eye_open <= 此值 且 >= CLOSED 判定为疑似 */
export const EYE_THRESHOLD_SUSPICIOUS = 0.6;

/** 眼睛状态枚举 */
export type EyeState = "open" | "suspicious" | "closed";

/** 根据 eye_open 值判断眼睛状态 */
export function getEyeState(eyeOpen: number | undefined): EyeState {
  const v = eyeOpen ?? 1.0;
  if (v < EYE_THRESHOLD_CLOSED) return "closed";
  if (v <= EYE_THRESHOLD_SUSPICIOUS) return "suspicious";
  return "open";
}

/** 根据 faces 数组统计各状态数量 */
export function countEyeStates(faces: { eye_open?: number }[]): {
  closed: number;
  suspicious: number;
  open: number;
} {
  let closed = 0,
    suspicious = 0,
    open = 0;
  for (const f of faces) {
    const state = getEyeState(f.eye_open);
    if (state === "closed") closed++;
    else if (state === "suspicious") suspicious++;
    else open++;
  }
  return { closed, suspicious, open };
}

// 弹窗眨眼统计信息（每张图片的眼睛状态统计）
export interface EyeStatistics {
  filePath: string; // 弹窗图片路径，作为唯一标识
  closedEyesCount: number; // 弹窗闭眼人脸数
  suspiciousCount: number; // 弹窗疑似闭眼
  openEyesCount: number; // 弹窗正常睁眼
}

// ============================================================================
// 保留策略纯函数（右侧"弃用冗余"执行与预览摘要共享，保证所见即所执行）
// ============================================================================
/** 保留依据：IQA 画质优先 / 睁眼优先（闭眼风险少者先保留） */
export type RetentionCriteria = "iqa" | "eye";

export interface RetentionPolicy {
  criteria: RetentionCriteria;
  keepCount: number; // 每组保留数量，<1 时由 computeRetentionPolicy 钳制为 1
}

/**
 * 解析 photo.info 为 IQA 数值。
 * info 字段由 PhotoService.toPhoto 写入 (p.IQA ?? 0).toString()，
 * 与 PhotoGrid 缩略图配色共享同一契约；非数字/空时退化为 0，避免污染排序。
 */
export const parseIQA = (info?: string | null): number => {
  if (info == null || info === "") return 0;
  const n = parseFloat(info);
  // 后端可能写入非数字 info（如旧数据/空串），排序时须退化为最低分而非 NaN
  return Number.isNaN(n) ? 0 : n;
};

/** 取闭眼风险数：闭眼 + 疑似闭眼。eyeStats 缺项视为 0（无人脸或未就绪）。 */
const badEyeCount = (
  filePath: string,
  eyeStats: Map<string, EyeStatistics>,
): number => {
  const s = eyeStats.get(filePath);
  return s ? s.closedEyesCount + s.suspiciousCount : 0;
};

/**
 * 按保留策略对每组排序并切分为 keep / disable。
 * - iqa：按 IQA(info) 降序
 * - eye：闭眼风险数升序，再按 IQA 降序 tiebreak
 *
 * 不变量：eyeStats 为空时 badEyeCount 恒为 0，eye 策略自动退化为 iqa 排序，
 * 保证启动瞬间数据未就绪时不会乱序弃用。
 * keepCount 钳制为 >=1，防止误输入 0/负数清空整组。
 */
export const computeRetentionPolicy = (
  groups: Photo[][],
  policy: RetentionPolicy,
  eyeStats: Map<string, EyeStatistics>,
): { keep: Photo[]; disable: Photo[]; groupCount: number } => {
  const keep: Photo[] = [];
  const disable: Photo[] = [];
  const n = Math.max(1, Math.floor(policy.keepCount)); // 至少保留 1 张

  for (const group of groups) {
    const ranked = [...group].sort((a, b) => {
      if (policy.criteria === "eye") {
        // 闭眼风险少者优先（升序）；eyeStats 缺失时两边均为 0，自然落入 IQA tiebreak
        const diff =
          badEyeCount(a.filePath, eyeStats) - badEyeCount(b.filePath, eyeStats);
        if (diff !== 0) return diff;
      }
      // IQA 降序：作为 iqa 主依据，或 eye 策略的 tiebreak
      return parseIQA(b.info) - parseIQA(a.info);
    });
    keep.push(...ranked.slice(0, n));
    disable.push(...ranked.slice(n));
  }

  return { keep, disable, groupCount: groups.length };
};

interface PhotoFilterState {
  // ===== 通用照片状态（3 个页面复用）=====
  lstAllPhotos: Photo[]; // 当前相册中所有照片（扁平列表，import/filter 页面）
  lstExportPhotos: Photo[]; // 导出页面专用照片列表（仅启用的照片，避免污染 lstAllPhotos）
  currentPage: PhotoPage; // 当前所在页面
  focusedPhotoFilePath: string | null; // 当前焦点照片路径（统一 focus/highlight/preview）
  highlightedPhotoFilePaths: Set<string>; // 高亮照片集合（跟随焦点自动更新）

  lstGalleryGroupedPhotos: Photo[][];
  lstPreviewPhotoDetails: PhotoExtend[];
  modeGalleryView: GalleryMode;
  tabRightPanel: "filter" | "preview";
  numSimilarityThreshold: number;
  boolShowDisabledPhotos: boolean;
  // 弹窗保留策略：弃用冗余时按何依据、每组保留几张（右侧面板配置）
  strRetainCriteria: RetentionCriteria;
  numRetainKeepCount: number;
  strSortedColumnKey: string;
  boolCurrentPreviewEnabled: boolean;
  boolReloadAlbumRequested: boolean;
  boolServerPollingNeeded: boolean;
  strServerStatusText: string;
  objServerStatusData: ServerData | null;
  numLeftPaneWidthVw: number;
  numPreviewHeightPercent: number;

  // 弹窗眨眼统计数据（自动从 faceData 计算）
  lstPhotosEyeStats: Map<string, EyeStatistics>; // 弹窗filePath -> EyeStatistics，用于快速查询某张图片的眨眼统计

  // 弹窗磁盘删除确认对话框状态
  boolShowDeleteConfirm: boolean; // 弹窗是否展示“删除文件”确认弹窗
  boolSkipDeleteConfirm: boolean; // 弹窗是否不再提醒（谨慎选择）
  objPendingDeletePhoto: Photo | null; // 弹窗当前等待确认删除的照片

  // 弹窗元数据详情弹窗状态
  boolShowInfoDialog: boolean;
  objInfoPhoto: Photo | null;
  objInfoMetadata: Record<string, unknown> | null;

  // 弹窗EXIF 元数据缓存（filePath -> metadata）
  mapExifMetadataCache: Map<string, Record<string, unknown>>;

  // 弹窗右键菜单配置与行为?
  contextMenuGroups: {
    id: string;
    label: string;
    items: {
      id: string;
      label: string;
      /** i18n key，前端可用 t(key, label) 渲染，方便后续统一管理 */
      i18nKey?: string;
      icon?: string; // 弹窗前端根据 id 自行渲染具体 icon
    }[];
  }[];

  // ===== Actions - 通用 =====
  fnSetAllPhotos: (photos: Photo[]) => void;
  fnSetExportPhotos: (photos: Photo[]) => void; // 导出页面专用：设置仅启用照片列表，避免污染 lstAllPhotos
  fnSetCurrentPage: (page: PhotoPage) => void;
  fnSelectPhoto: (photo: Photo | null) => Promise<void>; // 统一选择：同步 focus/highlight/preview
  fnSetGalleryGroupedPhotos: (groups: Photo[][]) => void;
  fnSetGalleryMode: (mode: GalleryMode) => void;
  fnSetRightPanelTab: (tab: "filter" | "preview") => void;
  fnSetSimilarityThreshold: (value: number) => void;
  fnSetRetainCriteria: (criteria: RetentionCriteria) => void;
  fnSetRetainKeepCount: (count: number) => void;
  fnSetShowDisabledPhotos: (value: boolean) => void;
  fnSetSortedColumnKey: (value: string) => void;
  fnSetPreviewHeightPercent: (value: number) => void;
  fnSetLeftPaneWidthVw: (value: number) => void;
  fnSetReloadAlbumRequested: (value: boolean) => void;
  fnSetServerPollingNeeded: (value: boolean) => void;
  fnSetServerStatusText: (value: string) => void;
  fnSetServerStatusData: (value: ServerData | null) => void;
  fnSetCurrentPreviewEnabled: (value: boolean) => void;

  // 弹窗眨眼统计
  fnCalculateEyeStats: (photos: PhotoExtend[]) => void;

  // 弹窗对话框
  fnOpenDeleteConfirm: (photo: Photo) => void;
  fnCloseDeleteConfirm: () => void;
  fnSetSkipDeleteConfirm: (skip: boolean) => void;
  fnExecuteDeleteFile: (photo: Photo) => Promise<boolean>; // 弹窗实际执行删除（不弹窗确认）
  fnOpenInfoDialog: (photo: Photo, metadata: Record<string, unknown>) => void;
  fnCloseInfoDialog: () => void;

  // 弹窗EXIF 元数据获取（带缓存）
  fnGetPhotoMetadata: (
    filePath: string,
  ) => Promise<Record<string, unknown> | null>;
  fnClearMetadataCache: () => void;

  // 弹窗业务操作
  fnSelectPreviewPhotos: (photos: Photo[]) => Promise<void>;
  fnTogglePhotoEnabledFromGrid: (photo: Photo) => Promise<void>;
  fnDisableRedundantInGroups: (disablePaths: string[]) => Promise<void>;
  fnEnableAllPhotos: () => Promise<void>;
  fnUpdateFromDetailsPanel: (
    filePath: string,
    enabled: boolean,
  ) => Promise<void>;
  fnHandleContextMenuAction: (
    actionId: string,
    photo: Photo,
    page: PhotoPage,
  ) => Promise<void>;
}

export const usePhotoFilterStore = create<PhotoFilterState>((set, get) => ({
  // ===== 通用照片状态初始化 =====
  lstAllPhotos: [], // import/filter 页面的完整照片列表
  lstExportPhotos: [], // export 页面的启用照片列表（独立维护，避免污染 lstAllPhotos）
  currentPage: "filter",
  focusedPhotoFilePath: null,
  highlightedPhotoFilePaths: new Set(),
  lstGalleryGroupedPhotos: [], // 弹窗左侧画廊展示用的照片分组（二维数组：group -> photos）
  lstPreviewPhotoDetails: [], // 弹窗右侧预览面板当前展示的照片（支持多选扩展）
  modeGalleryView: "group", // 弹窗画廊模式：按组显示还是全部平铺
  tabRightPanel: "filter", // 弹窗右侧面板当前 Tab：过滤 / 预览
  numSimilarityThreshold: parseFloat(
    sessionStorage.getItem("similarityThreshold") || "0.8",
  ), // 弹窗相似度阈值，持久化在 sessionStorage
  boolShowDisabledPhotos: false, // 弹窗是否在相册中显示已禁用的图片
  strRetainCriteria: "iqa", // 弹窗保留依据默认 IQA（睁眼优先需 eyeStats 就绪）
  numRetainKeepCount: 1, // 弹窗默认每组保留 1 张（与历史行为一致）
  strSortedColumnKey: "IQA", // 弹窗排序列：默认按 IQA
  boolCurrentPreviewEnabled: false, // 弹窗当前预览图片是否启用（同步 switch 状态）
  boolReloadAlbumRequested: false, // 弹窗外部触发的刷新标记（如详情面板修改完状态后）
  boolServerPollingNeeded: true, // 弹窗是否需要继续轮询服务器 & 相册
  strServerStatusText: "", // 弹窗顶部 Drawer 按钮展示的服务端状态文案
  objServerStatusData: null, // 弹窗原始服务端状态数据
  numLeftPaneWidthVw: 65, // 弹窗左侧画廊分栏宽度（vw 单位），用于拖拽持久
  numPreviewHeightPercent: 50, // 弹窗右侧预览区高度（相对 SidePanel 百分比）

  // 弹窗眨眼统计数据初始化
  lstPhotosEyeStats: new Map(),

  // 弹窗删除文件确认弹窗初始状态
  boolShowDeleteConfirm: false,
  boolSkipDeleteConfirm: false,
  objPendingDeletePhoto: null,

  // 弹窗元数据详情弹窗初始状态
  boolShowInfoDialog: false,
  objInfoPhoto: null,
  objInfoMetadata: null,

  // 弹窗EXIF 元数据缓存初始化
  mapExifMetadataCache: new Map(),

  // 弹窗默认右键菜单配置（多个页面共用，必要时可根据 currentPage 差异化渲染）
  contextMenuGroups: [
    {
      id: "open",
      label: "Open",
      items: [
        {
          id: "open-default",
          label: "Open",
          i18nKey: "photoContext.menu.openDefault",
          icon: "open",
        },
        {
          id: "reveal-in-folder",
          label: "Show in folder",
          i18nKey: "photoContext.menu.revealInFolder",
          icon: "folder",
        },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        {
          id: "toggle-enabled",
          label: "Enable / Disable",
          i18nKey: "photoContext.menu.toggleEnabled.baseLabel",
          icon: "toggle",
        },
        {
          id: "delete-db",
          label: "Remove (DB only)",
          i18nKey: "photoContext.menu.deleteDb",
          icon: "delete-db",
        },
        {
          id: "delete-file",
          label: "Delete file",
          i18nKey: "photoContext.menu.deleteFile",
          icon: "delete-file",
        },
      ],
    },
    {
      id: "info",
      label: "Info",
      items: [
        {
          id: "show-info",
          label: "Details",
          i18nKey: "photoContext.menu.showInfo",
          icon: "info",
        },
      ],
    },
  ],

  // ===== Actions 实现 =====
  fnSetAllPhotos: (photos) => set({ lstAllPhotos: photos }), // import/filter 页面的完整列表
  fnSetExportPhotos: (photos) => set({ lstExportPhotos: photos }), // export 页面的启用列表（独立维护）
  fnSetCurrentPage: (page) => set({ currentPage: page }),

  // 统一选择函数：同步更新 focus/highlight，异步更新 preview（不阻塞键盘导航）
  fnSelectPhoto: async (photo) => {
    if (!photo) {
      set({
        focusedPhotoFilePath: null,
        highlightedPhotoFilePaths: new Set(),
        lstPreviewPhotoDetails: [],
      });
      return;
    }
    // 同步更新 focus + highlight（立即生效，不阻塞）
    set({
      focusedPhotoFilePath: photo.filePath,
      highlightedPhotoFilePaths: new Set([photo.filePath]),
      tabRightPanel: "preview",
    });
    // 异步更新 preview 详情（较慢，不阻塞用户操作）
    getPhotosExtendByPhotos([photo])
      .then((extended) => {
        // 只有当前焦点未变化时才更新预览（避免覆盖新选择）
        if (get().focusedPhotoFilePath === photo.filePath) {
          set({
            lstPreviewPhotoDetails: extended,
            boolCurrentPreviewEnabled: extended[0]?.isEnabled ?? false,
          });
        }
      })
      .catch(console.error);
  },

  fnSetGalleryGroupedPhotos: (groups) =>
    set({ lstGalleryGroupedPhotos: groups }),

  fnSetGalleryMode: (mode) => set({ modeGalleryView: mode }), // 弹窗切换画廊展示模式
  fnSetRightPanelTab: (tab) => set({ tabRightPanel: tab }), // 弹窗切换右侧 Tab
  fnSetSimilarityThreshold: (value) => {
    sessionStorage.setItem("similarityThreshold", value.toString()); // 弹窗把阈值写入 sessionStorage，刷新后仍然生效
    set({ numSimilarityThreshold: value });
  },
  fnSetRetainCriteria: (criteria) => set({ strRetainCriteria: criteria }), // 弹窗切换保留依据（IQA / 睁眼）
  fnSetRetainKeepCount: (count) =>
    set({ numRetainKeepCount: Math.max(1, Math.floor(count)) }), // 弹窗每组保留数量，钳制 >=1 防误清空
  fnSetShowDisabledPhotos: (value) => set({ boolShowDisabledPhotos: value }), // 弹窗总开关：是否在左侧展示禁用图片
  fnSetSortedColumnKey: (value) => set({ strSortedColumnKey: value }), // 弹窗调整排序列（如按 IQA / 相似度）
  fnSetPreviewHeightPercent: (value) => set({ numPreviewHeightPercent: value }), // 弹窗更新右侧预览高度百分比
  fnSetLeftPaneWidthVw: (value) => set({ numLeftPaneWidthVw: value }), // 弹窗更新左侧分栏宽度
  fnSetReloadAlbumRequested: (value) =>
    set({ boolReloadAlbumRequested: value }), // 弹窗标记需要强制刷新相册
  fnSetServerPollingNeeded: (value) => set({ boolServerPollingNeeded: value }), // 弹窗控制是否继续轮询服务状态
  fnSetServerStatusText: (value) => set({ strServerStatusText: value }), // 弹窗直接设置服务端状态文案
  fnSetServerStatusData: (value) => set({ objServerStatusData: value }), // 弹窗直接设置服务端原始数据
  fnSetCurrentPreviewEnabled: (value) =>
    set({ boolCurrentPreviewEnabled: value }), // 弹窗仅更新预览开关，不写 DB

  // 增量更新眨眼统计：只更新变化的条目，保持未变化条目的引用不变，避免全 Grid 重渲染
  fnCalculateEyeStats: (photos: PhotoExtend[]) => {
    set((state) => {
      const map = state.lstPhotosEyeStats;
      let hasAnyChange = false;

      for (const photo of photos) {
        try {
          const faceData = photo.faceData
            ? JSON.parse(photo.faceData)
            : { faces: [] };
          const faces = faceData.faces || [];
          const { closed, suspicious, open } = countEyeStates(faces);
          const prev = map.get(photo.filePath);

          // 比较前后值，只有真正变化才更新（保持引用稳定）
          if (
            prev &&
            prev.closedEyesCount === closed &&
            prev.suspiciousCount === suspicious &&
            prev.openEyesCount === open
          ) {
            continue;
          }

          map.set(photo.filePath, {
            filePath: photo.filePath,
            closedEyesCount: closed,
            suspiciousCount: suspicious,
            openEyesCount: open,
          });
          hasAnyChange = true;
        } catch (error) {
          console.error(`计算 ${photo.filePath} 的眨眼统计失败`, error);
          const prev = map.get(photo.filePath);
          if (
            !prev ||
            prev.closedEyesCount !== 0 ||
            prev.suspiciousCount !== 0 ||
            prev.openEyesCount !== 0
          ) {
            map.set(photo.filePath, {
              filePath: photo.filePath,
              closedEyesCount: 0,
              suspiciousCount: 0,
              openEyesCount: 0,
            });
            hasAnyChange = true;
          }
        }
      }

      // 没有变化则返回空对象，不触发订阅更新
      return hasAnyChange ? { lstPhotosEyeStats: map } : {};
    });
  },

  // 弹窗打开"删除文件"确认弹窗，并记录待删除的照片
  fnOpenDeleteConfirm: (photo) =>
    set({ boolShowDeleteConfirm: true, objPendingDeletePhoto: photo }),

  // 弹窗关闭"删除文件"确认弹窗（仅关闭，不清除 photo，供确认后使用）
  fnCloseDeleteConfirm: () => set({ boolShowDeleteConfirm: false }),

  fnSetSkipDeleteConfirm: (skip) => set({ boolSkipDeleteConfirm: skip }),

  // 弹窗实际执行删除文件操作（不弹窗，供对话框确认后调用）
  fnExecuteDeleteFile: async (photo) => {
    const filePath = photo.filePath.replace(/\\/g, "/"); // 弹窗统一斜杠格式
    try {
      // 弹窗通过 ElectronAPI.deleteFile 删除磁盘文件
      const res = await (
        window as {
          ElectronAPI?: {
            deleteFile?: (p: string) => Promise<{ success: boolean }>;
          };
        }
      )?.ElectronAPI?.deleteFile?.(filePath);
      if (res?.success) {
        await deletePhotoByPath(filePath).catch(() => {}); // 弹窗静默删除数据库记录
        set((s) => ({
          lstAllPhotos: s.lstAllPhotos.filter(
            (p) => p.filePath !== photo.filePath,
          ),
          lstGalleryGroupedPhotos: s.lstGalleryGroupedPhotos
            .map((g) => g.filter((p) => p.filePath !== photo.filePath))
            .filter((g) => g.length > 0),
          lstPreviewPhotoDetails: s.lstPreviewPhotoDetails.filter(
            (p) => p.filePath !== photo.filePath,
          ),
          objPendingDeletePhoto: null, // 弹窗删除成功后清除待删除记录
        }));
        return true;
      }
      console.error("[deleteFile] failed:", res);
      return false;
    } catch (err) {
      console.error("[deleteFile] error:", err);
      return false;
    }
  },

  fnOpenInfoDialog: (photo, metadata) =>
    set({
      boolShowInfoDialog: true,
      objInfoPhoto: photo,
      objInfoMetadata: metadata,
    }),

  fnCloseInfoDialog: () =>
    set({
      boolShowInfoDialog: false,
      objInfoPhoto: null,
      objInfoMetadata: null,
    }),

  // 弹窗获取照片 EXIF 元数据（优先从缓存读取，未命中则调用 IPC 并缓存结果，解决并发竞态问题）
  fnGetPhotoMetadata: async (filePath: string) => {
    filePath = filePath.replace(/\\/g, "/");

    const { mapExifMetadataCache } = get();
    const cached = mapExifMetadataCache.get(filePath); // 弹窗缓存命中直接返回
    if (cached) return cached;

    try {
      const api = window as {
        ElectronAPI?: { getPhotoMetadata?: (p: string) => Promise<unknown> };
      };
      if (!api.ElectronAPI?.getPhotoMetadata) return null; // 弹窗API 不可用

      const res = (await api.ElectronAPI?.getPhotoMetadata(filePath)) as
        | { success?: boolean; data?: Record<string, unknown> }
        | undefined;
      if (res?.success && res.data) {
        const data = res.data; // 提取到闭包外，确保 set 回调内类型不丢失
        // 弹窗使用 set 的状态更新函数确保原子化操作，避免并发竞态条件
        set((state) => {
          const newCache = new Map(state.mapExifMetadataCache);
          newCache.set(filePath, data);
          return { mapExifMetadataCache: newCache };
        });
        return data;
      }
      return null;
    } catch (err) {
      console.error("[fnGetPhotoMetadata] error:", err);
      return null;
    }
  },

  // 清空元数据缓存（如相册重载时调用）
  fnClearMetadataCache: () => set({ mapExifMetadataCache: new Map() }),

  // 保持兼容性的包装函数（内部直接调用 fnSelectPhoto）
  fnSelectPreviewPhotos: async (clickPhotos: Photo[]) => {
    if (clickPhotos.length > 0) await get().fnSelectPhoto(clickPhotos[0]);
  },

  // 切换照片启用状态，禁用时自动切换焦点到下一张
  fnTogglePhotoEnabledFromGrid: async (target: Photo) => {
    const { boolShowDisabledPhotos, lstGalleryGroupedPhotos, fnSelectPhoto } =
      get();
    const newEnabled = !(target.isEnabled ?? true); // 反转状态
    await updatePhotoEnabledStatus(target.filePath, newEnabled);

    // 计算下一张焦点照片（禁用且隐藏时需要）
    let nextPhoto: Photo | null = null;
    if (!newEnabled && !boolShowDisabledPhotos) {
      const flatPhotos = lstGalleryGroupedPhotos.flat();
      const idx = flatPhotos.findIndex((p) => p.filePath === target.filePath);
      if (idx !== -1)
        nextPhoto = flatPhotos[idx + 1] ?? flatPhotos[idx - 1] ?? null;
    }

    // 更新画廊分组状态
    set((state) => {
      const nextGroups =
        !newEnabled && !boolShowDisabledPhotos
          ? state.lstGalleryGroupedPhotos
              .map((g) => g.filter((p) => p.filePath !== target.filePath))
              .filter((g) => g.length > 0)
          : state.lstGalleryGroupedPhotos.map((g) =>
              g.map((p) =>
                p.filePath === target.filePath
                  ? { ...p, isEnabled: newEnabled }
                  : p,
              ),
            );

      const nextPreview = state.lstPreviewPhotoDetails.map((p) =>
        p.filePath === target.filePath ? { ...p, isEnabled: newEnabled } : p,
      );

      return {
        lstGalleryGroupedPhotos: nextGroups,
        lstPreviewPhotoDetails:
          newEnabled || boolShowDisabledPhotos ? nextPreview : [],
        boolCurrentPreviewEnabled: newEnabled,
      };
    });

    // 自动切换焦点到下一张（统一通过 fnSelectPhoto 处理 focus/highlight/preview 同步）
    if (nextPhoto) await fnSelectPhoto(nextPhoto);
  },

  fnDisableRedundantInGroups: async (disablePaths: string[]) => {
    // disablePaths 由调用方（右侧预览）用 computeRetentionPolicy 快照计算得出，
    // 这里只负责落库 + 同步画廊，不再重算——保证"预览所见 = 实际弃用"。
    const { boolShowDisabledPhotos } = get();
    const disableSet = new Set(disablePaths);
    try {
      await Promise.all(
        disablePaths.map((p) => updatePhotoEnabledStatus(p, false)),
      );

      set((state) => {
        if (!boolShowDisabledPhotos) {
          // 隐藏禁用项时：从画廊移除被弃用照片（保持历史"隐藏即移除"语义）
          return {
            lstGalleryGroupedPhotos: state.lstGalleryGroupedPhotos
              .map((group) => group.filter((p) => !disableSet.has(p.filePath)))
              .filter((group) => group.length > 0),
          } as Partial<PhotoFilterState>;
        }

        // 显示禁用项时：保留在画廊但标记 isEnabled=false
        return {
          lstGalleryGroupedPhotos: state.lstGalleryGroupedPhotos.map((group) =>
            group.map((photo) =>
              disableSet.has(photo.filePath)
                ? { ...photo, isEnabled: false }
                : photo,
            ),
          ),
        } as Partial<PhotoFilterState>;
      });
    } catch (error) {
      console.error("禁用冗余照片失败:", error);
    }
  },

  fnEnableAllPhotos: async () => {
    const { lstGalleryGroupedPhotos } = get();
    try {
      await Promise.all(
        lstGalleryGroupedPhotos
          .flat()
          .map((photo) => updatePhotoEnabledStatus(photo.filePath, true)), // 弹窗批量启用所有图片
      );

      set((state) => ({
        lstGalleryGroupedPhotos: state.lstGalleryGroupedPhotos.map((group) =>
          group.map((photo) => ({ ...photo, isEnabled: true })),
        ),
      }));
    } catch (error) {
      console.error("启用所有照片失败:", error);
    }
  },
  //TODO
  fnUpdateFromDetailsPanel: async (filePath: string, enabled: boolean) => {
    await updatePhotoEnabledStatus(filePath, enabled); // 弹窗详情面板开关直接写 DB
    set((state) => ({
      lstGalleryGroupedPhotos: state.lstGalleryGroupedPhotos.map((group) =>
        group.map((p) =>
          p.filePath === filePath ? { ...p, isEnabled: enabled } : p,
        ),
      ),
      lstPreviewPhotoDetails: state.lstPreviewPhotoDetails.map((p) =>
        p.filePath === filePath ? { ...p, isEnabled: enabled } : p,
      ),
      boolCurrentPreviewEnabled: enabled,
    }));
  },

  // ===== 右键菜单行为统一入口 =====
  fnHandleContextMenuAction: async (actionId, photo, page) => {
    set({ focusedPhotoFilePath: photo.filePath, currentPage: page });

    const state = get();

    switch (actionId) {
      case "open-default": {
        try {
          const rawPath = photo.filePath;
          if (!rawPath) return;

          // 弹窗通过 ElectronAPI 打开本地文件或外部 URL
          const anyWindow = window as {
            ElectronAPI?: {
              openPath?: (p: string) => Promise<void>;
              openExternal?: (url: string) => Promise<void>;
            };
          };

          // 弹窗1. 如果 preload 暴露了专门的 openPath，则优先直接使用 ElectronAPI.openPath 打开本地文件
          if (anyWindow?.ElectronAPI?.openPath) {
            await anyWindow.ElectronAPI.openPath(rawPath);
            break;
          }

          // 弹窗2. 否则退回到 file:/// 弹窗URL + openExternal 的方案
          const normalizedPath = rawPath.replace(/\\/g, "/");
          const fileUrl = `file:///${encodeURI(normalizedPath)}`;
          await anyWindow?.ElectronAPI?.openExternal?.(fileUrl);
        } catch (error) {
          console.error("[contextMenu] open-default failed:", error);
        }
        break;
      }
      case "reveal-in-folder": {
        try {
          await (
            window as {
              ElectronAPI?: { revealInFolder?: (p: string) => Promise<void> };
            }
          )?.ElectronAPI?.revealInFolder?.(photo.filePath);
        } catch (error) {
          console.error("[contextMenu] reveal-in-folder failed:", error);
        }
        break;
      }
      case "toggle-enabled": {
        await get().fnTogglePhotoEnabledFromGrid(photo);
        break;
      }
      case "delete-db": {
        try {
          await deletePhotoByPath(photo.filePath);
          set((s) => ({
            lstAllPhotos: s.lstAllPhotos.filter(
              (p) => p.filePath !== photo.filePath,
            ),
            lstGalleryGroupedPhotos: s.lstGalleryGroupedPhotos
              .map((group) =>
                group.filter((p) => p.filePath !== photo.filePath),
              )
              .filter((group) => group.length > 0),
            lstPreviewPhotoDetails: s.lstPreviewPhotoDetails.filter(
              (p) => p.filePath !== photo.filePath,
            ),
          }));
        } catch (error) {
          console.error("[contextMenu] delete-db failed:", error);
        }
        break;
      }
      case "delete-file": {
        // 如果用户未勾选“跳过确认”，则先弹出确认对话框，由 UI 组件统一处理真正删除动作
        if (state.boolSkipDeleteConfirm) {
          await get().fnExecuteDeleteFile(photo); // 弹窗直接执行删除
        } else {
          set({ boolShowDeleteConfirm: true, objPendingDeletePhoto: photo }); // 弹窗显示确认对话框
        }
        break;
      }
      case "show-info": {
        // 弹窗异步获取元数据（带缓存），避免阻塞 UI
        void Promise.resolve().then(async () => {
          const metadata = await get().fnGetPhotoMetadata(photo.filePath);
          if (metadata) {
            const latestPhoto =
              get().lstAllPhotos.find((p) => p.filePath === photo.filePath) ||
              photo;
            get().fnOpenInfoDialog(latestPhoto, metadata);
          } else {
            console.error("[contextMenu] show-info: failed to get metadata");
          }
        });
        break;
      }
      default:
        console.warn("[contextMenu] unknown actionId", actionId, photo, page);
    }
  },
}));

/**
 * usePhotoFilterSelectors: 返回整个 store（慎用，会导致任意状态变化触发重渲染）
 * 推荐使用下方精细化的 selector hooks
 */
export const usePhotoFilterSelectors = () => usePhotoFilterStore((s) => s);

// ============================================================================
// 精细化 Selector Hooks（按组件职责拆分，避免无关状态变化触发重渲染）
// ============================================================================

/** SidePanel 专用 selector：只订阅右侧面板需要的状态 */
export const useSidePanelSelectors = () => ({
  tabRightPanel: usePhotoFilterStore((s) => s.tabRightPanel),
  fnSetRightPanelTab: usePhotoFilterStore((s) => s.fnSetRightPanelTab),
  numSimilarityThreshold: usePhotoFilterStore((s) => s.numSimilarityThreshold),
  fnSetSimilarityThreshold: usePhotoFilterStore(
    (s) => s.fnSetSimilarityThreshold,
  ),
  strRetainCriteria: usePhotoFilterStore((s) => s.strRetainCriteria),
  numRetainKeepCount: usePhotoFilterStore((s) => s.numRetainKeepCount),
  fnSetRetainCriteria: usePhotoFilterStore((s) => s.fnSetRetainCriteria),
  fnSetRetainKeepCount: usePhotoFilterStore((s) => s.fnSetRetainKeepCount),
  fnDisableRedundantInGroups: usePhotoFilterStore(
    (s) => s.fnDisableRedundantInGroups,
  ),
  fnEnableAllPhotos: usePhotoFilterStore((s) => s.fnEnableAllPhotos),
});

/** PhotoDetailsTable 专用 selector：只订阅预览详情需要的状态 */
export const usePreviewDetailsSelectors = () => ({
  lstPreviewPhotoDetails: usePhotoFilterStore((s) => s.lstPreviewPhotoDetails),
  boolCurrentPreviewEnabled: usePhotoFilterStore(
    (s) => s.boolCurrentPreviewEnabled,
  ),
  fnUpdateFromDetailsPanel: usePhotoFilterStore(
    (s) => s.fnUpdateFromDetailsPanel,
  ),
  fnSetCurrentPreviewEnabled: usePhotoFilterStore(
    (s) => s.fnSetCurrentPreviewEnabled,
  ),
});

/** GalleryPanel 专用 selector：只订阅画廊展示需要的状态 */
export const useGallerySelectors = () => ({
  lstGalleryGroupedPhotos: usePhotoFilterStore(
    (s) => s.lstGalleryGroupedPhotos,
  ),
  modeGalleryView: usePhotoFilterStore((s) => s.modeGalleryView),
  fnSetGalleryMode: usePhotoFilterStore((s) => s.fnSetGalleryMode),
  highlightedPhotoFilePaths: usePhotoFilterStore(
    (s) => s.highlightedPhotoFilePaths,
  ),
  focusedPhotoFilePath: usePhotoFilterStore((s) => s.focusedPhotoFilePath), // 当前焦点照片
  fnSelectPhoto: usePhotoFilterStore((s) => s.fnSelectPhoto), // 统一选择函数
});
