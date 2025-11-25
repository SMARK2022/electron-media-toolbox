import { create } from "zustand";
import { Photo, PhotoExtend, getPhotosExtendByCriteria, getPhotosExtendByPhotos, initializeDatabase, updatePhotoEnabledStatus } from "@/helpers/db/db";

export type GalleryMode = "group" | "total";

export interface ServerData {
  status: string;
  task_queue_length: number;
  workers: string[];
}

interface PhotoFilterState {
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

  fnFetchEnabledPhotos: () => Promise<void>; // 从数据库读取当前 gallery 模式下的启用图片并分组
  fnFetchServerStatus: (formatStatus: (data: ServerData | null) => string) => Promise<void>; // 轮询后端 /status 并根据状态控制 needUpdate
  fnSelectPreviewPhotos: (photos: Photo[]) => Promise<void>; // 从 grid 选中若干图片，刷新右侧 preview 列表
  fnTogglePhotoEnabledFromGrid: (photo: Photo) => Promise<void>; // 在 grid 中点击开关启用/禁用，并同步到预览 & DB
  fnDisableRedundantInGroups: () => Promise<void>; // 禁用每组中除第一张外的其他照片
  fnEnableAllPhotos: () => Promise<void>; // 启用当前相册中所有照片
  fnUpdateFromDetailsPanel: (filePath: string, enabled: boolean) => Promise<void>; // 从详情面板切换启用状态
}

export const usePhotoFilterStore = create<PhotoFilterState>((set, get) => ({
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

  fnInitPage: async () => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());
    await initializeDatabase();
  },

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

  if (undefinedGroupPhotos.length > 0) {
        mapGroupedPhotosById[numCurrentGroupId] = undefinedGroupPhotos.map((photo): Photo => ({
          fileName: photo.fileName,
          fileUrl: photo.fileUrl,
          filePath: photo.filePath,
          info: (photo.IQA ?? 0).toString(),
          isEnabled: photo.isEnabled ?? true,
        }));
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

        numCurrentGroupId++;
      }

  set({ lstGalleryGroupedPhotos: Object.values(mapGroupedPhotosById) }); // 最终转换为二维数组供画廊消费
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
    const { boolShowDisabledPhotos } = get();
  const newEnabled = !(target.isEnabled ?? true); // 反转启用状态
  await updatePhotoEnabledStatus(target.filePath, newEnabled); // 写入数据库

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
}));

export const usePhotoFilterSelectors = () => {
  const state = usePhotoFilterStore((s) => s);
  return state;
};
