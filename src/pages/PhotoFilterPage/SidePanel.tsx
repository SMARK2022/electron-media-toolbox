import * as React from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { CustomSlider } from "@/components/CustomSlider";
import ImagePreview from "@/components/ImagePreview";
import PhotoDetailsTable from "./PhotoDetailsTable";
import { AlertCircle, Image as ImageIcon, RotateCcw, Trash2 } from "lucide-react";
import { usePhotoFilterSelectors } from "./usePhotoFilterStore";

interface SidePanelProps {
  previewHeightPercent: number;
  onStartPreviewMouseDrag: (clientY: number) => void;
  onStartPreviewTouchDrag: (clientY: number) => void;
}

const PreviewPlaceholder: React.FC<{ height?: string }> = ({ height }) => {
  const { t } = useTranslation();

  return (
    <div
      style={height ? { height } : undefined}
      className="border-muted-foreground/20 bg-muted/40 m-4 flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center"
    >
      <div className="bg-muted mb-3 rounded-full p-3 shadow-sm">
        <ImageIcon className="text-muted-foreground/40 h-8 w-8" />
      </div>
      <p className="text-foreground text-sm font-medium">
        {t("filterPage.previewPlaceholderTitle") ||
          "Select a photo from the gallery to preview"}
      </p>
      <p className="text-muted-foreground mt-1 max-w-xs text-xs">
        {t("filterPage.previewPlaceholderDesc") ||
          "Click any thumbnail on the left to view details and toggle its enabled status."}
      </p>
    </div>
  );
};

export const SidePanel: React.FC<SidePanelProps> = ({
  previewHeightPercent,
  onStartPreviewMouseDrag,
  onStartPreviewTouchDrag,
}) => {
  const { t } = useTranslation();
  const {
    panelTab,
    setPanelTab,
    similarityThreshold,
    setSimilarityThreshold,
    disableRedundant,
    enableAll,
    previewPhotos,
    isPreviewEnabled,
    setReloadAlbumFlag,
    updateFromDetailsPanel,
  } = usePhotoFilterSelectors();

  const handleSliderChange = (value: number) => {
    setSimilarityThreshold(value);
  };

  const handleDisableRedundant = React.useCallback(async () => {
    await disableRedundant();
  }, [disableRedundant]);

  const handleEnableAll = async () => {
    await enableAll();
  };

  return (
    <Tabs
      id="side-pannel"
      value={panelTab}
      onValueChange={(val) => setPanelTab(val as "filter" | "preview")}
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

      <TabsContent value="filter" className="mt-0 border-0 bg透明 bg-transparent p-0">
        <div className="space-y-4">
          <CustomSlider
            label={t("filterPage.similarityThresholdLabel")}
            description={t("filterPage.similarityThresholdDesc")}
            min={0}
            max={1}
            step={0.01}
            value={similarityThreshold}
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
        {previewPhotos.length > 0 ? (
          <div className="flex h-full flex-col overflow-hidden">
            <div
              className="flex-shrink-0"
              style={{
                height: `${previewHeightPercent}%`,
                minHeight: "20%",
                maxHeight: "70%",
                width: "100%",
                display: "flex",
              }}
            >
              <ImagePreview
                src={`local-resource://${previewPhotos[0].filePath}`}
                height="100%"
                width="100%"
              />
            </div>

            <div
              className="bg-muted/20 hover:bg-muted/40 flex flex-shrink-0 cursor-ns-resize items-center justify-center transition-colors select-none"
              style={{
                height: 8,
                touchAction: "none",
              }}
              onMouseDown={(e) => onStartPreviewMouseDrag(e.clientY)}
              onTouchStart={(e) => {
                if (e.touches && e.touches[0])
                  onStartPreviewTouchDrag(e.touches[0].clientY);
              }}
            >
              <div className="bg-muted/60 h-1.5 w-10 rounded-full" />
            </div>

            <div
              className="flex-1 overflow-hidden"
              style={{
                maxHeight: `${100 - previewHeightPercent}%`,
              }}
            >
              <PhotoDetailsTable
                photo={previewPhotos[0]}
                isPreviewEnabled={isPreviewEnabled}
                setIsPreviewEnabled={() => {}}
                updatePhotoEnabledStatus={updateFromDetailsPanel}
                setPhotos={() => {}}
                onPhotoStatusChanged={() => setReloadAlbumFlag(true)}
              />
            </div>
          </div>
        ) : (
          <PreviewPlaceholder height={"calc((100vh - 180px))"} />
        )}
      </TabsContent>
    </Tabs>
  );
};
