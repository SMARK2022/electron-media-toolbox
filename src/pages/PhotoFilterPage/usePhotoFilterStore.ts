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
  init: () => Promise<void>;
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

  fetchEnabledPhotos: () => Promise<void>;
  fetchServerStatus: (formatStatus: (data: ServerData | null) => string) => Promise<void>;
  selectPhotos: (photos: Photo[]) => Promise<void>;
  togglePhotoEnabledFromGrid: (photo: Photo) => Promise<void>;
  disableRedundant: () => Promise<void>;
  enableAll: () => Promise<void>;
  updateFromDetailsPanel: (filePath: string, enabled: boolean) => Promise<void>;
}

export const usePhotoFilterStore = create<PhotoFilterState>((set, get) => ({
  photos: [],
  previewPhotos: [],
  galleryMode: "group",
  panelTab: "filter",
  similarityThreshold: parseFloat(sessionStorage.getItem("similarityThreshold") || "0.8"),
  showDisabled: false,
  sortedColumn: "IQA",
  isPreviewEnabled: false,
  reloadAlbumFlag: false,
  needUpdate: true,
  serverStatus: "",
  serverData: null,
  leftWidthVw: 65,
  previewHeightPercent: 50,

  init: async () => {
    const currentTime = Date.now();
    sessionStorage.setItem("submitTime", currentTime.toString());
    await initializeDatabase();
  },

  setGalleryMode: (mode) => set({ galleryMode: mode }),
  setPanelTab: (tab) => set({ panelTab: tab }),
  setSimilarityThreshold: (value) => {
    sessionStorage.setItem("similarityThreshold", value.toString());
    set({ similarityThreshold: value });
  },
  setShowDisabled: (value) => set({ showDisabled: value }),
  setSortedColumn: (value) => set({ sortedColumn: value }),
  setPreviewHeightPercent: (value) => set({ previewHeightPercent: value }),
  setLeftWidthVw: (value) => set({ leftWidthVw: value }),
  setReloadAlbumFlag: (value) => set({ reloadAlbumFlag: value }),
  setNeedUpdate: (value) => set({ needUpdate: value }),
  setServerStatus: (value) => set({ serverStatus: value }),
  setServerData: (value) => set({ serverData: value }),
  setPreviewEnabled: (value) => set({ isPreviewEnabled: value }),

  fetchEnabledPhotos: async () => {
    const { galleryMode, sortedColumn, showDisabled } = get();
    try {
      const undefinedGroupPhotos: PhotoExtend[] = await getPhotosExtendByCriteria(
        galleryMode === "group" ? -1 : -2,
        sortedColumn,
        !showDisabled,
      );

      let groupId = 0;
      let skippedGroup = 0;
      const groupedPhotos: { [key: number]: Photo[] } = {};

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
            skippedGroup++;
            continue;
          }
          break;
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

      set({ photos: Object.values(groupedPhotos) });
    } catch (error) {
      console.error("获取启用照片失败:", error);
    }
  },

  fetchServerStatus: async (formatStatus) => {
    const { needUpdate } = get();
    console.log("更新状态标志 needUpdate =", needUpdate);
    try {
      const response = await fetch("http://localhost:8000/status");
      if (response.ok) {
        const data: ServerData = await response.json();
        set({ serverStatus: formatStatus(data), serverData: data });

        const submitTime = sessionStorage.getItem("submitTime");
        if (submitTime) {
          const currentTime = Date.now();
          const timeDifference = (currentTime - parseInt(submitTime)) / 1000;

          if (timeDifference > 2 && data.status === "空闲中") {
            setTimeout(async () => {
              if (data.status === "空闲中") {
                set({ needUpdate: false });
                await get().fetchEnabledPhotos();
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
    const extended = await getPhotosExtendByPhotos(clickPhotos);
    set({ previewPhotos: extended, panelTab: "preview", isPreviewEnabled: extended[0]?.isEnabled ?? false });
  },

  togglePhotoEnabledFromGrid: async (target: Photo) => {
    const { showDisabled } = get();
    const newEnabled = !(target.isEnabled ?? true);
    await updatePhotoEnabledStatus(target.filePath, newEnabled);

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
              .filter((group) => group.length > 0),
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
        photos.flat().map((photo) => updatePhotoEnabledStatus(photo.filePath, true)),
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
    await updatePhotoEnabledStatus(filePath, enabled);
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
