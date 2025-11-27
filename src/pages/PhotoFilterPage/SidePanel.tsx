import * as React from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CustomSlider } from "@/components/CustomSlider";
import PhotoDetailsTable from "./PhotoDetailsTable"; // 预览下方的详细信息 & 开关表格
import { AlertCircle, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { usePhotoFilterSelectors } from "../../helpers/store/usePhotoFilterStore"; // 只订阅与 SidePanel 相关的状态和 action
import { PhotoService } from "@/helpers/services/PhotoService";

interface SidePanelProps {
  previewHeightPercent: number;
  onStartPreviewMouseDrag: (clientY: number) => void;
  onStartPreviewTouchDrag: (clientY: number) => void;
}

export const SidePanel: React.FC<SidePanelProps> = ({
  previewHeightPercent,
  onStartPreviewMouseDrag,
  onStartPreviewTouchDrag,
}) => {
  const { t } = useTranslation();
  const {
    tabRightPanel,
    fnSetRightPanelTab,
    numSimilarityThreshold,
    fnSetSimilarityThreshold,
    fnDisableRedundantInGroups,
    fnEnableAllPhotos,
    lstPreviewPhotoDetails,
    boolCurrentPreviewEnabled,
    fnUpdateFromDetailsPanel,
  } = usePhotoFilterSelectors(); // 只关心 panelTab / slider / 预览 / 批量操作等

  const handleSliderChange = (value: number) => {
    fnSetSimilarityThreshold(value); // 修改阈值时直接写入 store（内部已负责持久化）
  };

  const handleDisableRedundant = React.useCallback(async () => {
    await fnDisableRedundantInGroups(); // 调用 store 中的批量禁用逻辑
  }, [fnDisableRedundantInGroups]);

  const handleEnableAll = async () => {
    await fnEnableAllPhotos(); // 启用全部图片
  };

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
        <PhotoDetailsTable
          photo={lstPreviewPhotoDetails[0]}
          isPreviewEnabled={boolCurrentPreviewEnabled}
          setIsPreviewEnabled={() => {}}
          updatePhotoEnabledStatus={fnUpdateFromDetailsPanel}
          setPhotos={() => {}}
          onPhotoStatusChanged={() => PhotoService.refreshPhotos()}
          previewHeightPercent={previewHeightPercent}
          onStartPreviewMouseDrag={onStartPreviewMouseDrag}
          onStartPreviewTouchDrag={onStartPreviewTouchDrag}
        />
      </TabsContent>
    </Tabs>
  );
};
