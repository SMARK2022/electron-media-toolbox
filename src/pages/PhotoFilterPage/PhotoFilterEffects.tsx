import * as React from "react";
import { useTranslation } from "react-i18next";
import { usePhotoFilterSelectors, type ServerData } from "../../helpers/store/usePhotoFilterStore"; // 复用同一领域 store 的 action / state

/**
 * 集中管理与 store 相关的副作用：
 * - 初始化数据库
 * - 相册轮询
 * - 服务端状态轮询
 */
export const usePhotoFilterEffects = () => {
  const { t } = useTranslation();
  const {
    fnInitPage,
    boolServerPollingNeeded,
    boolReloadAlbumRequested,
    modeGalleryView,
    boolShowDisabledPhotos,
    fnFetchEnabledPhotos,
    fnFetchServerStatus,
    fnSetReloadAlbumRequested,
  } = usePhotoFilterSelectors(); // 只解构副作用真正需要的字段，保持组件层与实现解耦

  // 初始化数据库 & 状态（页面挂载一次即可）
  React.useEffect(() => {
    void fnInitPage();
  }, [fnInitPage]);

  // 轮询相册数据：每 4 秒刷新一次，只在 needUpdate 为 true 时执行
  React.useEffect(() => {
    fnFetchEnabledPhotos();

    const interval_photos = window.setInterval(() => {
      if (boolServerPollingNeeded) {
        fnFetchEnabledPhotos();
      }
    }, 4000);

    return () => window.clearInterval(interval_photos);
  }, [boolServerPollingNeeded, fnFetchEnabledPhotos]);

  // 显式触发相册刷新：当 reloadAlbumFlag / showDisabled / galleryMode 变化时强制刷新
  React.useEffect(() => {
    fnFetchEnabledPhotos();
    if (boolReloadAlbumRequested) {
      fnSetReloadAlbumRequested(false);
    }
  }, [boolReloadAlbumRequested, boolShowDisabledPhotos, modeGalleryView, fnFetchEnabledPhotos, fnSetReloadAlbumRequested]);

  // 轮询服务端状态：每 0.5 秒刷新一次，用 formatStatus 把原始数据映射到 UI 字符串
  React.useEffect(() => {
    const formatStatus = (data: ServerData | null) =>
      t("filterPage.serverStatusPrefix", {
        status:
          data?.status || t("filterPage.serverUnreachable") || "Unknown",
      });

    fnFetchServerStatus(formatStatus);

    const interval_status = window.setInterval(() => {
      if (boolServerPollingNeeded) {
        fnFetchServerStatus(formatStatus);
      }
    }, 500);

    return () => window.clearInterval(interval_status);
  }, [boolServerPollingNeeded, fnFetchServerStatus, t]);
};
