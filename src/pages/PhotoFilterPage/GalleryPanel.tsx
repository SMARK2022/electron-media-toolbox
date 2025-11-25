import * as React from "react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Layers, Grid, Image as ImageIcon } from "lucide-react";
import { Photo } from "@/lib/db";
import { PhotoGridEnhance } from "@/components/PhotoGrid"; // 复用全局的增强版缩略图网格组件
import { usePhotoFilterSelectors } from "./usePhotoFilterStore"; // 只订阅 gallery 相关状态（photos + mode）

interface GalleryGroupProps {
  group: Photo[];
  index: number;
  isGroupMode: boolean;
  groupLabel: string;
  highlightPhotos: Photo[];
  onPhotoClick?: (photos: Photo[], event: string) => void | Promise<void>;
}

const GalleryGroup: React.FC<GalleryGroupProps> = React.memo(
  ({ group, index, isGroupMode, groupLabel, highlightPhotos, onPhotoClick }) => {
  const header =
      isGroupMode && group.length > 0 ? (
        <div className="mb-1 flex items-center gap-2 px-1 pt-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
          <span>
            {groupLabel} {index + 1}
          </span>
          <div className="h-px flex-1 bg-slate-200 dark:bg-slate-400" />
        </div>
      ) : null;

    return (
      <div
        key={group[0]?.filePath ?? `group-${index}`}
        className="mb-2 last:mb-0"
      >
  {header}
        <PhotoGridEnhance
          photos={group}
          onPhotoClick={onPhotoClick}
          highlightPhotos={highlightPhotos}
        />
      </div>
    );
  },
);
GalleryGroup.displayName = "GalleryGroup"; // 便于在 React DevTools 中识别

interface GalleryPanelProps {
  totalPhotoCount: number;
  highlightPhotos: Photo[];
  onPhotoClick: (photos: Photo[], event: string) => void | Promise<void>;
}

export const GalleryPanel: React.FC<GalleryPanelProps> = ({
  totalPhotoCount,
  highlightPhotos,
  onPhotoClick,
}) => {
  const { t } = useTranslation();
  const { photos, galleryMode, setGalleryMode } = usePhotoFilterSelectors(); // 从 store 中取出画廊需要的最小状态

  return (
    <Tabs
      id="gallery-pannel"
      value={galleryMode}
      onValueChange={(val) => setGalleryMode(val as "group" | "total")}
      className="space-y-3"
    >
  {/* 顶部工具栏：模式切换 + 总数提示 */}
      <div className="flex items-center justify-between gap-3">
        <TabsList className="bg-muted/70 grid w-[280px] grid-cols-2">
          <TabsTrigger
            value="group"
            className="flex items-center gap-1.5 text-sm"
          >
            <Layers className="h-3.5 w-3.5" />
            {t("filterPage.galleryMode")}
          </TabsTrigger>
          <TabsTrigger
            value="total"
            className="flex items-center gap-1.5 text-sm"
          >
            <Grid className="h-3.5 w-3.5" />
            {t("filterPage.totalMode")}
          </TabsTrigger>
        </TabsList>

        <div className="text-muted-foreground flex items-center gap-3 text-sm">
          <div className="bg-muted flex items-center gap-1 rounded-full px-2 py-1">
            <ImageIcon className="text-muted-foreground/80 h-3.5 w-3.5" />
            <span className="font-sm">{t("labels.totalPhotosLabel")}:</span>
            <span className="rounded-full bg-blue-50 px-1.5 font-mono text-[14px] text-blue-700">
              {totalPhotoCount}
            </span>
          </div>
        </div>
      </div>

  {/* Scrollable Gallery：宽度随左侧容器自适应 */}
      <ScrollArea className="mx-auto h-[calc(100vh-220px)] w-full rounded-xl border p-3 dark:bg-slate-900">
        {photos.map((group, index) => (
          <GalleryGroup
            key={group[0]?.filePath ?? `group-${index}`}
            group={group}
            index={index}
            isGroupMode={galleryMode === "group"}
            groupLabel={t("filterPage.groupLabel") || "Group"}
            highlightPhotos={highlightPhotos}
            onPhotoClick={onPhotoClick}
          />
        ))}

        {photos.length === 0 && (
          <div className="text-muted-foreground flex h-[calc(70vh-100px)] flex-col items-center justify-center text中心 text-center">
            <div className="mb-3 rounded-full bg-white p-4 shadow-sm">
              <ImageIcon className="h-8 w-8 opacity-30" />
            </div>
            <p className="text-sm font-medium">
              {t("filterPage.noPhotosFoundTitle") || "No photos found"}
            </p>
            <p className="text-muted-foreground mt-1 max-w-xs text-xs">
              {t("filterPage.noPhotosFoundDesc") ||
                "Try adjusting filters, importing more photos, or running a new detection task."}
            </p>
          </div>
        )}
      </ScrollArea>
    </Tabs>
  );
};
