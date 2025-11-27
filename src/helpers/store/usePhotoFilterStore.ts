import { create } from "zustand";
import {
  Photo,
  PhotoExtend,
  getPhotosExtendByCriteria,
  getPhotosExtendByPhotos,
  initializeDatabase,
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
export function countEyeStates(faces: { eye_open?: number }[]): { closed: number; suspicious: number; open: number } {
  let closed = 0, suspicious = 0, open = 0;
  for (const f of faces) {
    const state = getEyeState(f.eye_open);
    if (state === "closed") closed++;
    else if (state === "suspicious") suspicious++;
    else open++;
  }
  return { closed, suspicious, open };
}

// 眨眼统计信息（每张图片的眼睛状态统计）
export interface EyeStatistics {
  filePath: string; // 图片路径，作为唯一标识
  closedEyesCount: number; // 闭眼人脸数
  suspiciousCount: number; // 疑似闭眼
  openEyesCount: number; // 正常睁眼
}

interface PhotoFilterState {
  // 通用照片状态（3 个页面复用）
  lstAllPhotos: Photo[]; // 当前相册中所有照片（扁平列表）
  currentPage: PhotoPage; // 当前所在页面（可用于差异化行为）
  currentSelectedPhoto: Photo | null; // 最近一次在任意页面选中的照片

  lstGalleryGroupedPhotos: Photo[][];
  lstPreviewPhotoDetails: PhotoExtend[];
  modeGalleryView: GalleryMode;
  tabRightPanel: "filter" | "preview";
  numSimilarityThreshold: number;
  boolShowDisabledPhotos: boolean;
  strSortedColumnKey: string;
  boolCurrentPreviewEnabled: boolean;
  boolReloadAlbumRequested: boolean;
  boolServerPollingNeeded: boolean;
  strServerStatusText: string;
  objServerStatusData: ServerData | null;
  numLeftPaneWidthVw: number;
  numPreviewHeightPercent: number;

  // 眨眼统计数据（自动从 faceData 计算）
  lstPhotosEyeStats: Map<string, EyeStatistics>; // filePath -> EyeStatistics，用于快速查询某张图片的眨眼统计

  // 磁盘删除确认对话框状态
  boolShowDeleteConfirm: boolean; // 是否展示“删除文件”确认弹窗
  boolSkipDeleteConfirm: boolean; // 是否不再提醒（谨慎选择）
  objPendingDeletePhoto: Photo | null; // 当前等待确认删除的照片

  // 元数据详情弹窗状态
  boolShowInfoDialog: boolean;
  objInfoPhoto: Photo | null;
  objInfoMetadata: Record<string, any> | null;

  // 右键菜单配置与行为
  contextMenuGroups: {
    id: string;
    label: string;
    items: {
      id: string;
      label: string;
      /** i18n key，前端可用 t(key, label) 渲染，方便后续统一管理 */
      i18nKey?: string;
      icon?: string; // 前端根据 id 自行渲染具体 icon
    }[];
  }[];

  // actions - 通用
  fnSetAllPhotos: (photos: Photo[]) => void;
  fnSetCurrentPage: (page: PhotoPage) => void;
  fnSetCurrentSelectedPhoto: (photo: Photo | null) => void;

  // actions
  fnInitPage: () => Promise<void>; // 页面初始化时调用：初始化数据库 & 提交时间戳
  fnSetGalleryMode: (mode: GalleryMode) => void;
  fnSetRightPanelTab: (tab: "filter" | "preview") => void;
  fnSetSimilarityThreshold: (value: number) => void;
  fnSetShowDisabledPhotos: (value: boolean) => void;
  fnSetSortedColumnKey: (value: string) => void;
  fnSetPreviewHeightPercent: (value: number) => void;
  fnSetLeftPaneWidthVw: (value: number) => void;
  fnSetReloadAlbumRequested: (value: boolean) => void;
  fnSetServerPollingNeeded: (value: boolean) => void;
  fnSetServerStatusText: (value: string) => void;
  fnSetServerStatusData: (value: ServerData | null) => void;
  fnSetCurrentPreviewEnabled: (value: boolean) => void;

  // 眨眼统计计算 action
  fnCalculateEyeStats: (photos: PhotoExtend[]) => void; // 根据 photos 的 faceData 字段计算眨眼统计并更新 store

  // 删除确认弹窗相关 actions
  fnOpenDeleteConfirm: (photo: Photo) => void;
  fnCloseDeleteConfirm: () => void;
  fnSetSkipDeleteConfirm: (skip: boolean) => void;

  // 详情弹窗相关 actions
  fnOpenInfoDialog: (photo: Photo, metadata: Record<string, any>) => void;
  fnCloseInfoDialog: () => void;

  fnFetchEnabledPhotos: () => Promise<void>; // 从数据库读取当前 gallery 模式下的启用图片并分组
  fnFetchServerStatus: (formatStatus: (data: ServerData | null) => string) => Promise<void>; // 轮询后端 /status 并根据状态控制 needUpdate
  fnSelectPreviewPhotos: (photos: Photo[]) => Promise<void>; // 从 grid 选中若干图片，刷新右侧 preview 列表
  fnTogglePhotoEnabledFromGrid: (photo: Photo) => Promise<void>; // 在 grid 中点击开关启用/禁用，并同步到预览 & DB
  fnDisableRedundantInGroups: () => Promise<void>; // 禁用每组中除第一张外的其他照片
  fnEnableAllPhotos: () => Promise<void>; // 启用当前相册中所有照片
  fnUpdateFromDetailsPanel: (filePath: string, enabled: boolean) => Promise<void>; // 从详情面板切换启用状态

  // 右键菜单行为（由 PhotoGridEnhance 调用）
  fnHandleContextMenuAction: (
    actionId: string,
    photo: Photo,
    page: PhotoPage,
  ) => Promise<void>;
}

export const usePhotoFilterStore = create<PhotoFilterState>((set, get) => ({
  // ===== 通用照片状态 =====
  lstAllPhotos: [],
  currentPage: "filter",
  currentSelectedPhoto: null,
  lstGalleryGroupedPhotos: [], // 左侧画廊展示用的照片分组（二维数组：group -> photos）
  lstPreviewPhotoDetails: [], // 右侧预览面板当前展示的照片（支持多选扩展）
  modeGalleryView: "group", // 画廊模式：按组显示还是全部平铺
  tabRightPanel: "filter", // 右侧面板当前 Tab：过滤 / 预览
  numSimilarityThreshold: parseFloat(sessionStorage.getItem("similarityThreshold") || "0.8"), // 相似度阈值，持久化在 sessionStorage
  boolShowDisabledPhotos: false, // 是否在相册中显示已禁用的图片
  strSortedColumnKey: "IQA", // 排序列：默认按 IQA
  boolCurrentPreviewEnabled: false, // 当前预览图片是否启用（同步 switch 状态）
  boolReloadAlbumRequested: false, // 外部触发的刷新标记（如详情面板修改完状态后）
  boolServerPollingNeeded: true, // 是否需要继续轮询服务器 & 相册
  strServerStatusText: "", // 顶部 Drawer 按钮展示的服务端状态文案
  objServerStatusData: null, // 原始服务端状态数据
  numLeftPaneWidthVw: 65, // 左侧画廊分栏宽度（vw 单位），用于拖拽持久
  numPreviewHeightPercent: 50, // 右侧预览区高度（相对 SidePanel 百分比）

  // 眨眼统计数据初始化
  lstPhotosEyeStats: new Map(),

  // 删除文件确认弹窗初始状态
  boolShowDeleteConfirm: false,
  boolSkipDeleteConfirm: false,
  objPendingDeletePhoto: null,

  // 元数据详情弹窗初始状态
  boolShowInfoDialog: false,
  objInfoPhoto: null,
  objInfoMetadata: null,

  // 默认右键菜单配置（3 个页面共用，必要时可根据 currentPage 差异化渲染）
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

  fnInitPage: async () => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());
    await initializeDatabase();
  },

  fnSetAllPhotos: (photos) => set({ lstAllPhotos: photos }),
  fnSetCurrentPage: (page) => set({ currentPage: page }),
  fnSetCurrentSelectedPhoto: (photo) => set({ currentSelectedPhoto: photo }),

  fnSetGalleryMode: (mode) => set({ modeGalleryView: mode }), // 切换画廊展示模式
  fnSetRightPanelTab: (tab) => set({ tabRightPanel: tab }), // 切换右侧 Tab
  fnSetSimilarityThreshold: (value) => {
    sessionStorage.setItem("similarityThreshold", value.toString()); // 把阈值写入 sessionStorage，刷新后仍然生效
    set({ numSimilarityThreshold: value });
  },
  fnSetShowDisabledPhotos: (value) => set({ boolShowDisabledPhotos: value }), // 总开关：是否在左侧展示禁用图片
  fnSetSortedColumnKey: (value) => set({ strSortedColumnKey: value }), // 调整排序列（如按 IQA / 相似度）
  fnSetPreviewHeightPercent: (value) => set({ numPreviewHeightPercent: value }), // 更新右侧预览高度百分比
  fnSetLeftPaneWidthVw: (value) => set({ numLeftPaneWidthVw: value }), // 更新左侧分栏宽度
  fnSetReloadAlbumRequested: (value) => set({ boolReloadAlbumRequested: value }), // 标记需要强制刷新相册
  fnSetServerPollingNeeded: (value) => set({ boolServerPollingNeeded: value }), // 控制是否继续轮询服务状态
  fnSetServerStatusText: (value) => set({ strServerStatusText: value }), // 直接设置服务端状态文案
  fnSetServerStatusData: (value) => set({ objServerStatusData: value }), // 直接设置服务端原始数据
  fnSetCurrentPreviewEnabled: (value) => set({ boolCurrentPreviewEnabled: value }), // 仅更新预览开关，不写 DB

  // 计算眨眼统计：根据 photos 的 faceData 字段计算每张图片的眨眼统计
  fnCalculateEyeStats: (photos: PhotoExtend[]) => {
    const newStatsMap = new Map<string, EyeStatistics>();

    photos.forEach((photo) => {
      try {
        const faceData = photo.faceData ? JSON.parse(photo.faceData) : { faces: [] };
        const faces = faceData.faces || [];
        const { closed, suspicious, open } = countEyeStates(faces);

        newStatsMap.set(photo.filePath, {
          filePath: photo.filePath,
          closedEyesCount: closed,
          suspiciousCount: suspicious,
          openEyesCount: open,
        });
      } catch (error) {
        console.error(`计算 ${photo.filePath} 的眨眼统计失败:`, error);
        newStatsMap.set(photo.filePath, { filePath: photo.filePath, closedEyesCount: 0, suspiciousCount: 0, openEyesCount: 0 });
      }
    });

    set({ lstPhotosEyeStats: newStatsMap });
  },

  // 打开"删除文件"确认弹窗，并记录待删除的照片
  fnOpenDeleteConfirm: (photo) =>
    set({ boolShowDeleteConfirm: true, objPendingDeletePhoto: photo }),

  // 关闭“删除文件”确认弹窗并清除待删除记录
  fnCloseDeleteConfirm: () =>
    set({ boolShowDeleteConfirm: false, objPendingDeletePhoto: null }),

  // 设置是否跳过删除确认（谨慎使用，可在对话框中勾选）
  fnSetSkipDeleteConfirm: (skip) => set({ boolSkipDeleteConfirm: skip }),

  // 打开详情弹窗并记录元数据
  fnOpenInfoDialog: (photo, metadata) =>
    set({
      boolShowInfoDialog: true,
      objInfoPhoto: photo,
      objInfoMetadata: metadata,
    }),

  // 关闭详情弹窗
  fnCloseInfoDialog: () =>
    set({ boolShowInfoDialog: false, objInfoPhoto: null, objInfoMetadata: null }),

  fnFetchEnabledPhotos: async () => {
    const { modeGalleryView, strSortedColumnKey, boolShowDisabledPhotos } = get();
    try {
      const undefinedGroupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
        modeGalleryView === "group" ? -1 : -2,
        strSortedColumnKey,
        !boolShowDisabledPhotos,
      );

      let numCurrentGroupId = 0; // 当前有效分组 ID
      let numSkippedGroupCount = 0; // 连续跳过的空组计数，用于提前结束循环
      const mapGroupedPhotosById: { [key: number]: Photo[] } = {}; // groupId -> Photo 列表
      const allPhotoExtends: PhotoExtend[] = []; // 收集所有的 PhotoExtend，用于计算眨眼统计

      if (undefinedGroupPhotos.length > 0) {
        mapGroupedPhotosById[numCurrentGroupId] = undefinedGroupPhotos.map((photo): Photo => ({
          fileName: photo.fileName,
          fileUrl: photo.fileUrl,
          filePath: photo.filePath,
          info: (photo.IQA ?? 0).toString(),
          isEnabled: photo.isEnabled ?? true,
        }));
        allPhotoExtends.push(...undefinedGroupPhotos);
        numCurrentGroupId++;
      }

      while (modeGalleryView === "group") {
        const currentGroupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
          numCurrentGroupId + numSkippedGroupCount,
          strSortedColumnKey,
          !boolShowDisabledPhotos,
        );

        if (currentGroupPhotos.length === 0) {
          if (numSkippedGroupCount < 20) {
            numSkippedGroupCount++; // 允许最多跳过 20 个空组，避免稀疏 groupId 时循环过长
            continue;
          }
          break; // 超过阈值后认为没有更多分组，终止
        }

        mapGroupedPhotosById[numCurrentGroupId] = currentGroupPhotos.map((photo): Photo => ({
          fileName: photo.fileName,
          fileUrl: photo.fileUrl,
          filePath: photo.filePath,
          info: (photo.IQA ?? 0).toString(),
          isEnabled: photo.isEnabled ?? true,
        }));
        allPhotoExtends.push(...currentGroupPhotos);
        numCurrentGroupId++;
      }

      set({ lstGalleryGroupedPhotos: Object.values(mapGroupedPhotosById) }); // 最终转换为二维数组供画廊消费

      // 计算眨眼统计
      get().fnCalculateEyeStats(allPhotoExtends);
    } catch (error) {
      console.error("获取启用照片失败:", error);
    }
  },

  fnFetchServerStatus: async (formatStatus) => {
    const { boolServerPollingNeeded } = get();
    console.log("更新状态标志 boolServerPollingNeeded =", boolServerPollingNeeded);
    try {
  const response = await fetch("http://localhost:8000/status"); // 后端 FastAPI 服务的状态接口
      if (response.ok) {
        const data: ServerData = await response.json();
        set({ strServerStatusText: formatStatus(data), objServerStatusData: data });

  const submitTime = sessionStorage.getItem("submitTime"); // 上次提交任务的时间戳
        if (submitTime) {
          const currentTime = Date.now();
          const timeDifference = (currentTime - parseInt(submitTime)) / 1000; // 秒

          if (timeDifference > 2 && data.status === "空闲中") {
            setTimeout(async () => {
              if (data.status === "空闲中") {
                set({ boolServerPollingNeeded: false });
                await get().fnFetchEnabledPhotos(); // 检测结束后拉取最新相册
                console.log("[STATUS] Server idle, stopping updates.");
              } else {
                set({ boolServerPollingNeeded: true });
              }
            }, 600);
          } else {
            set({ boolServerPollingNeeded: true });
          }
        }
      } else {
        set({ strServerStatusText: formatStatus(null) });
      }
    } catch {
      set({ strServerStatusText: formatStatus(null) });
    }
  },

  fnSelectPreviewPhotos: async (clickPhotos: Photo[]) => {
    if (!clickPhotos.length) return;
  const extended = await getPhotosExtendByPhotos(clickPhotos); // 从基础 Photo 拉取扩展信息（IQA 等）
  set({ lstPreviewPhotoDetails: extended, tabRightPanel: "preview", boolCurrentPreviewEnabled: extended[0]?.isEnabled ?? false }); // 自动切到预览 Tab
  },

  fnTogglePhotoEnabledFromGrid: async (target: Photo) => {
    const { boolShowDisabledPhotos, lstGalleryGroupedPhotos } = get();
  const newEnabled = !(target.isEnabled ?? true); // 反转启用状态
  await updatePhotoEnabledStatus(target.filePath, newEnabled); // 写入数据库

    // 禁用图片时，需要找到下一张（或上一张）图片作为新的预览焦点
    let nextPreviewPhoto: Photo | null = null;
    let nextPreviewExtended: PhotoExtend[] = [];

    if (!newEnabled && !boolShowDisabledPhotos) {
      // 在所有分组中找到当前图片的位置，并选择相邻的图片
      const flatPhotos = lstGalleryGroupedPhotos.flat();
      const currentIndex = flatPhotos.findIndex((p) => p.filePath === target.filePath);

      if (currentIndex !== -1) {
        // 优先选择下一张，如果没有则选择上一张
        if (currentIndex < flatPhotos.length - 1) {
          nextPreviewPhoto = flatPhotos[currentIndex + 1];
        } else if (currentIndex > 0) {
          nextPreviewPhoto = flatPhotos[currentIndex - 1];
        }
      }

      // 预先获取下一张图片的扩展信息，避免中间状态
      if (nextPreviewPhoto) {
        try {
          nextPreviewExtended = await getPhotosExtendByPhotos([nextPreviewPhoto]);
        } catch (error) {
          console.error("获取下一张预览图片失败:", error);
        }
      }
    }

    set((state) => {
      let nextPhotos: Photo[][];
  if (!newEnabled && !boolShowDisabledPhotos) {
        nextPhotos = state.lstGalleryGroupedPhotos
          .map((group) => group.filter((p) => p.filePath !== target.filePath))
          .filter((group) => group.length > 0);
      } else {
        nextPhotos = state.lstGalleryGroupedPhotos.map((group) =>
          group.map((p) =>
            p.filePath === target.filePath ? { ...p, isEnabled: newEnabled } : p,
          ),
        );
      }

  const nextPreview = state.lstPreviewPhotoDetails.map((p) =>
        p.filePath === target.filePath ? { ...p, isEnabled: newEnabled } : p,
      );

      // 如果禁用图片且有下一张预览图，直接切换（避免中间空状态）
      if (!newEnabled && !boolShowDisabledPhotos && nextPreviewExtended.length > 0) {
        return {
          lstGalleryGroupedPhotos: nextPhotos,
          lstPreviewPhotoDetails: nextPreviewExtended,
          tabRightPanel: "preview",
          boolCurrentPreviewEnabled: nextPreviewExtended[0]?.isEnabled ?? false,
        };
      }

      return {
        lstGalleryGroupedPhotos: nextPhotos,
        lstPreviewPhotoDetails: newEnabled || boolShowDisabledPhotos ? nextPreview : [],
        tabRightPanel: newEnabled || boolShowDisabledPhotos ? "preview" : "filter",
        boolCurrentPreviewEnabled: newEnabled,
      };
    });
  },

  fnDisableRedundantInGroups: async () => {
    const { lstGalleryGroupedPhotos, boolShowDisabledPhotos } = get();
    try {
      await Promise.all(
  lstGalleryGroupedPhotos.map(async (group) => {
          const updates = group
            .slice(1)
            .map((photo) => updatePhotoEnabledStatus(photo.filePath, false));
          await Promise.all(updates);
        }),
      );

  set((state) => {
        if (!boolShowDisabledPhotos) {
          return {
            lstGalleryGroupedPhotos: state.lstGalleryGroupedPhotos
              .map((group) => (group.length > 0 ? [group[0]] : []))
              .filter((group) => group.length > 0), // 每组只保留第一张，其余已在上面统一禁用
          } as Partial<PhotoFilterState>;
        }

        return {
          lstGalleryGroupedPhotos: state.lstGalleryGroupedPhotos.map((group) =>
            group.map((photo, idx) =>
              idx === 0 ? photo : { ...photo, isEnabled: false },
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
        lstGalleryGroupedPhotos.flat().map((photo) => updatePhotoEnabledStatus(photo.filePath, true)), // 批量启用所有图片
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

  fnUpdateFromDetailsPanel: async (filePath: string, enabled: boolean) => {
    await updatePhotoEnabledStatus(filePath, enabled); // 详情面板开关直接写 DB
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
      boolReloadAlbumRequested: true,
    }));
  },

  // ===== 右键菜单行为统一入口 =====
  fnHandleContextMenuAction: async (actionId, photo, page) => {
    set({ currentSelectedPhoto: photo, currentPage: page });

    const state = get();

    switch (actionId) {
      case "open-default": {
        try {
          const rawPath = photo.filePath;
          if (!rawPath) return;

          const anyWindow = window as any;

          // 1. 如果 preload 暴露了专门的 openPath，则优先直接用 shell.openPath 打开本地文件
          if (anyWindow?.ElectronAPI?.openPath) {
            await anyWindow.ElectronAPI.openPath(rawPath);
            break;
          }

          // 2. 否则退回到 file:/// URL + openExternal 的方案
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
          await (window as any)?.ElectronAPI?.revealInFolder?.(photo.filePath);
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
        const { boolSkipDeleteConfirm } = state;

        // 如果用户未勾选“跳过确认”，则先弹出确认对话框，由 UI 组件统一处理真正删除动作
        if (!boolSkipDeleteConfirm) {
          set({ boolShowDeleteConfirm: true, objPendingDeletePhoto: photo });
          break;
        }

        // 否则直接执行删除逻辑（与对话框点击确认后的逻辑保持一致）
        try {
          const res = await (window as any)?.ElectronAPI?.deleteFile?.(
            photo.filePath,
          );
          if (res && res.success) {
            try {
              await deletePhotoByPath(photo.filePath);
            } catch (error) {
              console.warn(
                "[contextMenu] delete-file -> delete-db warn:",
                error,
              );
            }
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
          } else {
            console.error("[contextMenu] delete-file failed:", res);
          }
        } catch (error) {
          console.error("[contextMenu] delete-file failed:", error);
        }
        break;
      }
      case "show-info": {
        // 为避免阻塞渲染进程，这里不直接 await 元数据加载，而是
        // 让元数据加载逻辑在一个微任务/下一个事件循环中异步执行，
        // 并在数据返回后再通过 store 打开详情弹窗。
        // 这样右键菜单点击后会立刻返回，不会拖慢 Grid 的交互。

        // 1. 先关闭右键菜单（由调用方完成），这里只负责异步拉取数据
        // 2. 使用 Promise.resolve().then(...) 将耗时操作放到后续调度
        void Promise.resolve().then(async () => {
          try {
            const api = (window as any)?.ElectronAPI;
            if (!api?.getPhotoMetadata) {
              console.error(
                "[contextMenu] show-info failed: ElectronAPI.getPhotoMetadata is not available",
              );
              return;
            }

            const res = await api.getPhotoMetadata(photo.filePath);
            if (res && res.success) {
              // 再次从 store 里拿最新的 photo 引用，避免潜在的引用过期
              const latestState = get();
              const latestPhoto =
                latestState.lstAllPhotos.find(
                  (p) => p.filePath === photo.filePath,
                ) || photo;

              latestState.fnOpenInfoDialog(latestPhoto, res.data ?? {});
            } else {
              console.error("[contextMenu] show-info failed:", res);
            }
          } catch (error) {
            console.error("[contextMenu] show-info failed:", error);
          }
        });
        break;
      }
      default:
        console.warn("[contextMenu] unknown actionId", actionId, photo, page);
    }
  },
}));

export const usePhotoFilterSelectors = () => {
  const state = usePhotoFilterStore((s) => s);
  return state;
};
