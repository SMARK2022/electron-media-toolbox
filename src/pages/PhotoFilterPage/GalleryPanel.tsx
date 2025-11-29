/**
 * GalleryPanel 组件 - 轻量级包装
 * ================================
 * 基于 PhotoGridEnhance 的分组展示容器
 * - 提供分组/全部两种视图切换
 * - 顶部工具栏（模式切换、照片计数）
 * - 调用 PhotoGridEnhance 的分组模式渲染
 * - 仅 filter 页面有眨眼指示器（由 PhotoGridEnhance 内部控制）
 */

import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Grid, Image as ImageIcon } from "lucide-react";
import { Photo } from "@/helpers/ipc/database/db";
import { useGallerySelectors, usePhotoFilterStore } from "../../helpers/store/usePhotoFilterStore";
import { PhotoGridEnhance } from "@/components/PhotoGrid";
import { useTranslation } from "react-i18next";
import { PhotoInfoDialog } from "@/components/PhotoInfoDialog";

interface GalleryPanelProps {
  totalPhotoCount: number; // 总照片数
  onPhotoClick: (photos: Photo[], event: string) => void | Promise<void>; // 照片点击回调
}

interface GalleryPanelProps {
  totalPhotoCount: number; // 总照片数
  onPhotoClick: (photos: Photo[], event: string) => void | Promise<void>; // 照片点击回调
}

export const GalleryPanel: React.FC<GalleryPanelProps> = React.memo(({ totalPhotoCount, onPhotoClick }) => {
  const { t } = useTranslation();
  const { lstGalleryGroupedPhotos, modeGalleryView, fnSetGalleryMode } = useGallerySelectors(); // 获取分组数据和模式
  const boolShowInfoDialog = usePhotoFilterStore((s) => s.boolShowInfoDialog); // 元数据弹窗开关
  const objInfoPhoto = usePhotoFilterStore((s) => s.objInfoPhoto); // 元数据照片
  const objInfoMetadata = usePhotoFilterStore((s) => s.objInfoMetadata); // 元数据
  const fnCloseInfoDialog = usePhotoFilterStore((s) => s.fnCloseInfoDialog); // 关闭元数据弹窗

  const isGroupMode = modeGalleryView === "group"; // 是否分组模式

  return (
    <Tabs id="gallery-panel" value={modeGalleryView} onValueChange={(v) => fnSetGalleryMode(v as "group" | "total")} className="space-y-3">
      {/* 顶部工具栏：模式切换 + 照片计数 */}
      <div className="flex items-center justify-between gap-3">
        <TabsList className="bg-muted/70 grid w-[280px] grid-cols-2">
          <TabsTrigger value="group" className="flex items-center gap-1.5 text-sm">
            <Layers className="h-3.5 w-3.5" />
            {t("filterPage.galleryMode")}
          </TabsTrigger>
          <TabsTrigger value="total" className="flex items-center gap-1.5 text-sm">
            <Grid className="h-3.5 w-3.5" />
            {t("filterPage.totalMode")}
          </TabsTrigger>
        </TabsList>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <div className="bg-muted flex items-center gap-1 rounded-full px-2 py-1">
            <ImageIcon className="text-muted-foreground/80 h-3.5 w-3.5" />
            <span className="font-sm">{t("labels.totalPhotosLabel")}:</span>
            <span className="rounded-full bg-blue-50 px-1.5 font-mono text-[14px] text-blue-700">{totalPhotoCount}</span>
          </div>
        </div>
      </div>

      {/* 虚拟化照片网格：支持分组/平铺 */}
      <PhotoGridEnhance
        page="filter" // filter 页面有眨眼指示器
        isGroupMode={isGroupMode} // 分组或平铺模式
        groupedPhotos={isGroupMode ? lstGalleryGroupedPhotos : []} // 分组数据
        photos={!isGroupMode ? lstGalleryGroupedPhotos.flat() : []} // 平铺模式下的所有照片
        containerHeight="calc(100vh - 220px)" // 自适应高度
        onPhotoClick={onPhotoClick} // 点击回调
      />

      {/* 元数据弹窗 */}
      <PhotoInfoDialog
        open={boolShowInfoDialog}
        onOpenChange={(open) => { if (!open) fnCloseInfoDialog(); }}
        photo={objInfoPhoto} metadata={objInfoMetadata as any}
      />
    </Tabs>
  );
});

GalleryPanel.displayName = "GalleryPanel";