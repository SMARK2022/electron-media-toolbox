import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Grid, Image as ImageIcon } from "lucide-react";
import { Photo } from "@/helpers/ipc/database/db";
import { PhotoGridEnhance } from "@/components/PhotoGrid";
import { useGallerySelectors } from "../../helpers/store/usePhotoFilterStore";

// ========== 分组组件（优化 memo 比较） ==========
interface GalleryGroupProps {
  group: Photo[];
  index: number;
  isGroupMode: boolean;
  groupLabel: string;
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
}

const GalleryGroup: React.FC<GalleryGroupProps> = React.memo(
  ({ group, index, isGroupMode, groupLabel, onPhotoClick }) => (
    <div className="mb-2 last:mb-0">
      {isGroupMode && group.length > 0 && (
        <div className="mb-1 flex items-center gap-2 px-1 pt-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          <span>{groupLabel} {index + 1}</span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-400" />
        </div>
      )}
      <PhotoGridEnhance photos={group} onPhotoClick={onPhotoClick} />
    </div>
  ),
  (prev, next) => ( // 仅比较 group 关键属性，highlight/focus 由 PhotoGrid 内部处理
    prev.group.length === next.group.length &&
    prev.group.every((p, i) => p.filePath === next.group[i]?.filePath && p.isEnabled === next.group[i]?.isEnabled) &&
    prev.index === next.index && prev.isGroupMode === next.isGroupMode
  ),
);
GalleryGroup.displayName = "GalleryGroup";

// ========== 主面板 ==========
interface GalleryPanelProps {
  totalPhotoCount: number;
  onPhotoClick: (photos: Photo[], event: string) => void | Promise<void>;
}

export const GalleryPanel: React.FC<GalleryPanelProps> = React.memo(({ totalPhotoCount, onPhotoClick }) => {
  const { t } = useTranslation();
  const { lstGalleryGroupedPhotos, modeGalleryView, fnSetGalleryMode } = useGallerySelectors();

  return (
    <Tabs id="gallery-pannel" value={modeGalleryView} onValueChange={(v) => fnSetGalleryMode(v as "group" | "total")} className="space-y-3">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <TabsList className="bg-muted/70 grid w-[280px] grid-cols-2">
          <TabsTrigger value="group" className="flex items-center gap-1.5 text-sm"><Layers className="h-3.5 w-3.5" />{t("filterPage.galleryMode")}</TabsTrigger>
          <TabsTrigger value="total" className="flex items-center gap-1.5 text-sm"><Grid className="h-3.5 w-3.5" />{t("filterPage.totalMode")}</TabsTrigger>
        </TabsList>
        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <div className="bg-muted flex items-center gap-1 rounded-full px-2 py-1">
            <ImageIcon className="text-muted-foreground/80 h-3.5 w-3.5" />
            <span className="font-sm">{t("labels.totalPhotosLabel")}:</span>
            <span className="rounded-full bg-blue-50 px-1.5 font-mono text-[14px] text-blue-700">{totalPhotoCount}</span>
          </div>
        </div>
      </div>

      {/* 滚动画廊 */}
      <ScrollArea className="mx-auto h-[calc(100vh-220px)] w-full rounded-xl border p-3 dark:bg-slate-900">
        {lstGalleryGroupedPhotos.map((group, i) => (
          <GalleryGroup key={`${modeGalleryView}-${i}`} group={group} index={i} isGroupMode={modeGalleryView === "group"} groupLabel={t("filterPage.groupLabel") || "Group"} onPhotoClick={onPhotoClick} />
        ))}
        {lstGalleryGroupedPhotos.length === 0 && (
          <div className="text-muted-foreground flex h-[calc(70vh-100px)] flex-col items-center justify-center text-center">
            <div className="mb-3 rounded-full bg-white p-4 shadow-sm"><ImageIcon className="h-8 w-8 opacity-30" /></div>
            <p className="text-sm font-medium">{t("filterPage.noPhotosFoundTitle") || "No photos found"}</p>
            <p className="text-muted-foreground mt-1 max-w-xs text-xs">{t("filterPage.noPhotosFoundDesc") || "Try adjusting filters or importing more photos."}</p>
          </div>
        )}
      </ScrollArea>
    </Tabs>
  );
});

GalleryPanel.displayName = "GalleryPanel";
