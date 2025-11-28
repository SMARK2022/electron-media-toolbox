import * as React from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CustomSlider } from "@/components/CustomSlider";
import PhotoDetailsTable from "./PhotoDetailsTable";
import { AlertCircle, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { useSidePanelSelectors, usePreviewDetailsSelectors } from "../../helpers/store/usePhotoFilterStore";
import { PhotoService } from "@/helpers/services/PhotoService";
import { useCallback, useRef, useMemo } from "react";

interface SidePanelProps {
  previewHeightPercent: number;
  onStartPreviewMouseDrag: (clientY: number, containerRect: DOMRect) => void;
  onStartPreviewTouchDrag: (clientY: number, containerRect: DOMRect) => void;
}

export const SidePanel: React.FC<SidePanelProps> = React.memo(({
  previewHeightPercent,
  onStartPreviewMouseDrag,
  onStartPreviewTouchDrag,
}) => {
  const { t } = useTranslation();

  // 精细化订阅：拆分 SidePanel 和 PreviewDetails 的状态，避免无关 state 导致的重渲染
  const {
    tabRightPanel,
    fnSetRightPanelTab,
    numSimilarityThreshold,
    fnSetSimilarityThreshold,
    fnDisableRedundantInGroups,
    fnEnableAllPhotos,
  } = useSidePanelSelectors();

  const {
    lstPreviewPhotoDetails,
    boolCurrentPreviewEnabled,
    fnUpdateFromDetailsPanel,
  } = usePreviewDetailsSelectors();

  const previewContainerRef = useRef<HTMLDivElement>(null);

  // 稳定的回调函数（使用 useCallback 避免每次 render 重建）
  const handleSliderChange = useCallback(
    (value: number) => fnSetSimilarityThreshold(value),
    [fnSetSimilarityThreshold],
  );

  const handleStartPreviewMouseDrag = useCallback(
    (clientY: number) => {
      const rect = previewContainerRef.current?.getBoundingClientRect();
      if (rect) onStartPreviewMouseDrag(clientY, rect);
    },
    [onStartPreviewMouseDrag],
  );

  const handleStartPreviewTouchDrag = useCallback(
    (clientY: number) => {
      const rect = previewContainerRef.current?.getBoundingClientRect();
      if (rect) onStartPreviewTouchDrag(clientY, rect);
    },
    [onStartPreviewTouchDrag],
  );

  const handleDisableRedundant = useCallback(() => fnDisableRedundantInGroups(), [fnDisableRedundantInGroups]);
  const handleEnableAll = useCallback(() => fnEnableAllPhotos(), [fnEnableAllPhotos]);

  // 稳定化 PhotoDetailsTable 需要的 photo prop，只在真正变化时更新引用
  const currentPhoto = useMemo(() => lstPreviewPhotoDetails[0], [lstPreviewPhotoDetails]);

  // 稳定化空操作回调（避免每次渲染创建新函数）
  const noopRefresh = useCallback(() => PhotoService.refreshPhotos(), []);

  return (
    <Tabs
      id="side-pannel"
      value={tabRightPanel}
      onValueChange={(val) => fnSetRightPanelTab(val as "filter" | "preview")}
      className="bg-background/80 flex-1 rounded-xl p-3 shadow-sm"
    >
      <div className="mb-3 w-full">
        <TabsList className="bg-muted/70 grid grid-cols-2">
          <TabsTrigger
            value="filter"
            className="flex items-center gap-1.5 text-xs"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {t("filterPage.filterTab")}
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="flex items-center gap-1.5 text-xs"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t("filterPage.previewTab")}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent
        value="filter"
        className="bg透明 mt-0 border-0 bg-transparent p-0"
      >
        <div className="space-y-4">
          <CustomSlider
            label={t("filterPage.similarityThresholdLabel")}
            description={t("filterPage.similarityThresholdDesc")}
            min={0}
            max={1}
            step={0.01}
            value={numSimilarityThreshold}
            onChange={handleSliderChange}
          />

          <div className="flex justify-between gap-3">
            <Button
              onClick={handleDisableRedundant}
              variant="outline"
              size="sm"
              className="flex-1 justify-start gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
              {t("filterPage.disableRedundant")}
            </Button>
          </div>
          <div className="flex justify-between gap-3">
            <Button
              onClick={handleEnableAll}
              variant="outline"
              size="sm"
              className="flex-1 justify-start gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              {t("filterPage.enableAll")}
            </Button>
          </div>

          <div className="mt-3 rounded-md bg-blue-50 p-3 text-xs text-blue-800">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <p className="leading-relaxed whitespace-pre-wrap">
                {t("filterPage.filterHint")}
              </p>
            </div>
          </div>
        </div>
      </TabsContent>

      <TabsContent
        value="preview"
        className="mt-0 flex h-[calc(100vh-160px)] flex-col overflow-hidden border-0 bg-transparent p-0"
      >
        <div ref={previewContainerRef} className="flex h-full flex-col overflow-hidden">
          <PhotoDetailsTable
            photo={currentPhoto}
            isPreviewEnabled={boolCurrentPreviewEnabled}
            updatePhotoEnabledStatus={fnUpdateFromDetailsPanel}
            onPhotoStatusChanged={noopRefresh}
            previewHeightPercent={previewHeightPercent}
            onStartPreviewMouseDrag={handleStartPreviewMouseDrag}
            onStartPreviewTouchDrag={handleStartPreviewTouchDrag}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
});

SidePanel.displayName = "SidePanel";
