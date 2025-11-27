/**
 * PhotoServiceProvider - 照片服务的 React 上下文提供者
 * =====================================================
 * 在 App 级别初始化 PhotoService，确保整个应用共享同一服务实例
 */

import React, { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { PhotoService } from "./PhotoService";
import type { ServerData } from "@/helpers/store/usePhotoFilterStore";

interface PhotoServiceProviderProps {
  children: React.ReactNode;
}

/**
 * PhotoServiceProvider 组件
 * 负责在应用挂载时初始化 PhotoService，卸载时销毁
 */
export function PhotoServiceProvider({ children }: PhotoServiceProviderProps) {
  const { t } = useTranslation();
  const initializedRef = useRef(false);

  useEffect(() => {
    // 防止 StrictMode 下重复初始化
    if (initializedRef.current) return;
    initializedRef.current = true;

    // 设置状态格式化函数（需要 i18n）
    PhotoService.setStatusFormatter((data: ServerData | null) =>
      t("filterPage.serverStatusPrefix", {
        status: data?.status || t("filterPage.serverUnreachable") || "Unknown",
      }),
    );

    // 初始化服务
    PhotoService.initialize().catch((error) => {
      console.error("[PhotoServiceProvider] Failed to initialize:", error);
    });

    // 卸载时销毁服务
    return () => {
      PhotoService.destroy();
      initializedRef.current = false;
    };
  }, [t]);

  return <>{children}</>;
}

export default PhotoServiceProvider;
