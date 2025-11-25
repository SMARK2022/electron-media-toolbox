import * as React from "react";
import { useTranslation } from "react-i18next";
import { usePhotoFilterSelectors, type ServerData } from "./usePhotoFilterStore"; // 复用同一领域 store 的 action / state

/**
 * 集中管理与 store 相关的副作用：
 * - 初始化数据库
 * - 相册轮询
 * - 服务端状态轮询
 */
export const usePhotoFilterEffects = () => {
  const { t } = useTranslation();
  const {
    init,
    needUpdate,
    reloadAlbumFlag,
    galleryMode,
    showDisabled,
    fetchEnabledPhotos,
    fetchServerStatus,
    setReloadAlbumFlag,
  } = usePhotoFilterSelectors(); // 只解构副作用真正需要的字段，保持组件层与实现解耦

  // 初始化数据库 & 状态（页面挂载一次即可）
  React.useEffect(() => {
    void init();
  }, [init]);

  // 轮询相册数据：每 4 秒刷新一次，只在 needUpdate 为 true 时执行
  React.useEffect(() => {
    fetchEnabledPhotos();

    const interval_photos = window.setInterval(() => {
      if (needUpdate) {
        fetchEnabledPhotos();
      }
    }, 4000);

    return () => window.clearInterval(interval_photos);
  }, [needUpdate, fetchEnabledPhotos]);

  // 显式触发相册刷新：当 reloadAlbumFlag / showDisabled / galleryMode 变化时强制刷新
  React.useEffect(() => {
    fetchEnabledPhotos();
    if (reloadAlbumFlag) {
      setReloadAlbumFlag(false);
    }
  }, [reloadAlbumFlag, showDisabled, galleryMode, fetchEnabledPhotos, setReloadAlbumFlag]);

  // 轮询服务端状态：每 0.5 秒刷新一次，用 formatStatus 把原始数据映射到 UI 字符串
  React.useEffect(() => {
    const formatStatus = (data: ServerData | null) =>
      t("filterPage.serverStatusPrefix", {
        status:
          data?.status || t("filterPage.serverUnreachable") || "Unknown",
      });

    fetchServerStatus(formatStatus);

    const interval_status = window.setInterval(() => {
      if (needUpdate) {
        fetchServerStatus(formatStatus);
      }
    }, 500);

    return () => window.clearInterval(interval_status);
  }, [needUpdate, fetchServerStatus, t]);
};
