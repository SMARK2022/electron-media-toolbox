import { create } from "zustand";
import { Photo, PhotoExtend, getPhotosExtendByCriteria, getPhotosExtendByPhotos, initializeDatabase, updatePhotoEnabledStatus } from "@/lib/db";

export type GalleryMode = "group" | "total";

export interface ServerData {
  status: string;
  task_queue_length: number;
  workers: string[];
}

interface PhotoFilterState {
  photos: Photo[][];
  previewPhotos: PhotoExtend[];
  galleryMode: GalleryMode;
  panelTab: "filter" | "preview";
  similarityThreshold: number;
  showDisabled: boolean;
  sortedColumn: string;
  isPreviewEnabled: boolean;
  reloadAlbumFlag: boolean;
  needUpdate: boolean;
  serverStatus: string;
  serverData: ServerData | null;
  leftWidthVw: number;
  previewHeightPercent: number;

  // actions
  init: () => Promise<void>; // 页面初始化时调用：初始化数据库 & 提交时间戳
  setGalleryMode: (mode: GalleryMode) => void;
  setPanelTab: (tab: "filter" | "preview") => void;
  setSimilarityThreshold: (value: number) => void;
  setShowDisabled: (value: boolean) => void;
  setSortedColumn: (value: string) => void;
  setPreviewHeightPercent: (value: number) => void;
  setLeftWidthVw: (value: number) => void;
  setReloadAlbumFlag: (value: boolean) => void;
  setNeedUpdate: (value: boolean) => void;
  setServerStatus: (value: string) => void;
  setServerData: (value: ServerData | null) => void;
  setPreviewEnabled: (value: boolean) => void;

  fetchEnabledPhotos: () => Promise<void>; // 从数据库读取当前 gallery 模式下的启用图片并分组
  fetchServerStatus: (formatStatus: (data: ServerData | null) => string) => Promise<void>; // 轮询后端 /status 并根据状态控制 needUpdate
  selectPhotos: (photos: Photo[]) => Promise<void>; // 从 grid 选中若干图片，刷新右侧 preview 列表
  togglePhotoEnabledFromGrid: (photo: Photo) => Promise<void>; // 在 grid 中点击开关启用/禁用，并同步到预览 & DB
  disableRedundant: () => Promise<void>; // 禁用每组中除第一张外的其他照片
  enableAll: () => Promise<void>; // 启用当前相册中所有照片
  updateFromDetailsPanel: (filePath: string, enabled: boolean) => Promise<void>; // 从详情面板切换启用状态
}

export const usePhotoFilterStore = create<PhotoFilterState>((set, get) => ({
  photos: [], // 左侧画廊展示用的照片分组（二维数组：group -> photos）
  previewPhotos: [], // 右侧预览面板当前展示的照片（支持多选扩展）
  galleryMode: "group", // 画廊模式：按组显示还是全部平铺
  panelTab: "filter", // 右侧面板当前 Tab：过滤 / 预览
  similarityThreshold: parseFloat(sessionStorage.getItem("similarityThreshold") || "0.8"), // 相似度阈值，持久化在 sessionStorage
  showDisabled: false, // 是否在相册中显示已禁用的图片
  sortedColumn: "IQA", // 排序列：默认按 IQA
  isPreviewEnabled: false, // 当前预览图片是否启用（同步 switch 状态）
  reloadAlbumFlag: false, // 外部触发的刷新标记（如详情面板修改完状态后）
  needUpdate: true, // 是否需要继续轮询服务器 & 相册
  serverStatus: "", // 顶部 Drawer 按钮展示的服务端状态文案
  serverData: null, // 原始服务端状态数据
  leftWidthVw: 65, // 左侧画廊分栏宽度（vw 单位），用于拖拽持久
  previewHeightPercent: 50, // 右侧预览区高度（相对 SidePanel 百分比）

  init: async () => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());
    await initializeDatabase();
  },

  setGalleryMode: (mode) => set({ galleryMode: mode }), // 切换画廊展示模式
  setPanelTab: (tab) => set({ panelTab: tab }), // 切换右侧 Tab
  setSimilarityThreshold: (value) => {
    sessionStorage.setItem("similarityThreshold", value.toString()); // 把阈值写入 sessionStorage，刷新后仍然生效
    set({ similarityThreshold: value });
  },
  setShowDisabled: (value) => set({ showDisabled: value }), // 总开关：是否在左侧展示禁用图片
  setSortedColumn: (value) => set({ sortedColumn: value }), // 调整排序列（如按 IQA / 相似度）
  setPreviewHeightPercent: (value) => set({ previewHeightPercent: value }), // 更新右侧预览高度百分比
  setLeftWidthVw: (value) => set({ leftWidthVw: value }), // 更新左侧分栏宽度
  setReloadAlbumFlag: (value) => set({ reloadAlbumFlag: value }), // 标记需要强制刷新相册
  setNeedUpdate: (value) => set({ needUpdate: value }), // 控制是否继续轮询服务状态
  setServerStatus: (value) => set({ serverStatus: value }), // 直接设置服务端状态文案
  setServerData: (value) => set({ serverData: value }), // 直接设置服务端原始数据
  setPreviewEnabled: (value) => set({ isPreviewEnabled: value }), // 仅更新预览开关，不写 DB

  fetchEnabledPhotos: async () => {
    const { galleryMode, sortedColumn, showDisabled } = get();
    try {
  const undefinedGroupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
        galleryMode === "group" ? -1 : -2,
        sortedColumn,
        !showDisabled,
      );

  let groupId = 0; // 当前有效分组 ID
  let skippedGroup = 0; // 连续跳过的空组计数，用于提前结束循环
  const groupedPhotos: { [key: number]: Photo[] } = {}; // groupId -> Photo 列表

  if (undefinedGroupPhotos.length > 0) {
        groupedPhotos[groupId] = undefinedGroupPhotos.map((photo): Photo => ({
          fileName: photo.fileName,
          fileUrl: photo.fileUrl,
          filePath: photo.filePath,
          info: (photo.IQA ?? 0).toString(),
          isEnabled: photo.isEnabled ?? true,
        }));
        groupId++;
      }

  while (galleryMode === "group") {
        const currentGroupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
          groupId + skippedGroup,
          sortedColumn,
          !showDisabled,
        );

        if (currentGroupPhotos.length === 0) {
          if (skippedGroup < 20) {
            skippedGroup++; // 允许最多跳过 20 个空组，避免稀疏 groupId 时循环过长
            continue;
          }
          break; // 超过阈值后认为没有更多分组，终止
        }

        groupedPhotos[groupId] = currentGroupPhotos.map((photo): Photo => ({
          fileName: photo.fileName,
          fileUrl: photo.fileUrl,
          filePath: photo.filePath,
          info: (photo.IQA ?? 0).toString(),
          isEnabled: photo.isEnabled ?? true,
        }));

        groupId++;
      }

  set({ photos: Object.values(groupedPhotos) }); // 最终转换为二维数组供画廊消费
    } catch (error) {
      console.error("获取启用照片失败:", error);
    }
  },

  fetchServerStatus: async (formatStatus) => {
    const { needUpdate } = get();
    console.log("更新状态标志 needUpdate =", needUpdate);
    try {
  const response = await fetch("http://localhost:8000/status"); // 后端 FastAPI 服务的状态接口
      if (response.ok) {
        const data: ServerData = await response.json();
        set({ serverStatus: formatStatus(data), serverData: data });

  const submitTime = sessionStorage.getItem("submitTime"); // 上次提交任务的时间戳
        if (submitTime) {
          const currentTime = Date.now();
          const timeDifference = (currentTime - parseInt(submitTime)) / 1000; // 秒

          if (timeDifference > 2 && data.status === "空闲中") {
            setTimeout(async () => {
              if (data.status === "空闲中") {
                set({ needUpdate: false });
                await get().fetchEnabledPhotos(); // 检测结束后拉取最新相册
                console.log("[STATUS] Server idle, stopping updates.");
              } else {
                set({ needUpdate: true });
              }
            }, 600);
          } else {
            set({ needUpdate: true });
          }
        }
      } else {
        set({ serverStatus: formatStatus(null) });
      }
    } catch {
      set({ serverStatus: formatStatus(null) });
    }
  },

  selectPhotos: async (clickPhotos: Photo[]) => {
    if (!clickPhotos.length) return;
  const extended = await getPhotosExtendByPhotos(clickPhotos); // 从基础 Photo 拉取扩展信息（IQA 等）
  set({ previewPhotos: extended, panelTab: "preview", isPreviewEnabled: extended[0]?.isEnabled ?? false }); // 自动切到预览 Tab
  },

  togglePhotoEnabledFromGrid: async (target: Photo) => {
    const { showDisabled } = get();
  const newEnabled = !(target.isEnabled ?? true); // 反转启用状态
  await updatePhotoEnabledStatus(target.filePath, newEnabled); // 写入数据库

    set((state) => {
      let nextPhotos: Photo[][];
  if (!newEnabled && !showDisabled) {
        nextPhotos = state.photos
          .map((group) => group.filter((p) => p.filePath !== target.filePath))
          .filter((group) => group.length > 0);
      } else {
        nextPhotos = state.photos.map((group) =>
          group.map((p) =>
            p.filePath === target.filePath ? { ...p, isEnabled: newEnabled } : p,
          ),
        );
      }

  const nextPreview = state.previewPhotos.map((p) =>
        p.filePath === target.filePath ? { ...p, isEnabled: newEnabled } : p,
      );

      return {
        photos: nextPhotos,
        previewPhotos: newEnabled || showDisabled ? nextPreview : [],
        panelTab: newEnabled || showDisabled ? "preview" : "filter",
        isPreviewEnabled: newEnabled,
      };
    });
  },

  disableRedundant: async () => {
    const { photos, showDisabled } = get();
    try {
      await Promise.all(
  photos.map(async (group) => {
          const updates = group
            .slice(1)
            .map((photo) => updatePhotoEnabledStatus(photo.filePath, false));
          await Promise.all(updates);
        }),
      );

  set((state) => {
        if (!showDisabled) {
          return {
            photos: state.photos
              .map((group) => (group.length > 0 ? [group[0]] : []))
              .filter((group) => group.length > 0), // 每组只保留第一张，其余已在上面统一禁用
          } as Partial<PhotoFilterState>;
        }

        return {
          photos: state.photos.map((group) =>
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

  enableAll: async () => {
    const { photos } = get();
    try {
      await Promise.all(
        photos.flat().map((photo) => updatePhotoEnabledStatus(photo.filePath, true)), // 批量启用所有图片
      );

      set((state) => ({
        photos: state.photos.map((group) =>
          group.map((photo) => ({ ...photo, isEnabled: true })),
        ),
      }));
    } catch (error) {
      console.error("启用所有照片失败:", error);
    }
  },

  updateFromDetailsPanel: async (filePath: string, enabled: boolean) => {
    await updatePhotoEnabledStatus(filePath, enabled); // 详情面板开关直接写 DB
    set((state) => ({
      photos: state.photos.map((group) =>
        group.map((p) =>
          p.filePath === filePath ? { ...p, isEnabled: enabled } : p,
        ),
      ),
      previewPhotos: state.previewPhotos.map((p) =>
        p.filePath === filePath ? { ...p, isEnabled: enabled } : p,
      ),
      isPreviewEnabled: enabled,
      reloadAlbumFlag: true,
    }));
  },
}));

export const usePhotoFilterSelectors = () => {
  const state = usePhotoFilterStore((s) => s);
  return state;
};
