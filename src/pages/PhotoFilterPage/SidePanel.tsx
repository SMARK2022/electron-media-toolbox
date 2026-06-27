import * as React from "react";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { CustomSlider } from "@/components/CustomSlider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import PhotoDetailsTable from "./PhotoDetailsTable";
import { RetainSummaryCard } from "./RetainSummaryCard";
import {
  AlertCircle,
  Image as ImageIcon,
  RotateCcw,
  Trash2,
  ChevronDown,
} from "lucide-react";
import {
  useSidePanelSelectors,
  usePreviewDetailsSelectors,
  usePhotoFilterStore,
  computeRetentionPolicy,
  type RetentionPolicy,
} from "../../helpers/store/usePhotoFilterStore";
import { PhotoService } from "@/helpers/services/PhotoService";
import { useCallback, useRef, useMemo, useState, useEffect } from "react";

interface SidePanelProps {
  previewHeightPercent: number;
  onStartPreviewMouseDrag: (clientY: number, containerRect: DOMRect) => void;
  onStartPreviewTouchDrag: (clientY: number, containerRect: DOMRect) => void;
}

// 确认对话框状态：kind 区分弃用/启用，disablePaths 为预览快照（弃用时使用）
interface ConfirmState {
  open: boolean;
  kind: "disable" | "enable";
  disablePaths: string[]; // 弃用快照，保证"预览所见=实际执行"
  count: number; // 将影响的照片数
}

export const SidePanel: React.FC<SidePanelProps> = React.memo(
  ({
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
      strRetainCriteria,
      numRetainKeepCount,
      fnSetRetainCriteria,
      fnSetRetainKeepCount,
      fnDisableRedundantInGroups,
      fnEnableAllPhotos,
    } = useSidePanelSelectors();

    const {
      lstPreviewPhotoDetails,
      boolCurrentPreviewEnabled,
      fnUpdateFromDetailsPanel,
    } = usePreviewDetailsSelectors();

    // 低频订阅：total 模式禁用保留策略；eyeStats 就绪标志控制降级提示
    const isTotalMode = usePhotoFilterStore(
      (s) => s.modeGalleryView === "total",
    );
    const eyeStatsReady = usePhotoFilterStore(
      (s) => s.lstPhotosEyeStats.size > 0,
    );

    const previewContainerRef = useRef<HTMLDivElement>(null);
    // keepCount 输入框：本地串 + 失焦提交，防止 setter 钳制后 DOM 残留显示（与 CustomSlider 同模式）
    const keepCountInputRef = useRef<HTMLInputElement>(null);
    const [keepCountInput, setKeepCountInput] = useState(
      numRetainKeepCount.toString(),
    );
    useEffect(() => {
      // 焦点门控：用户正在输入时跳过同步，避免冲掉未完成输入
      if (document.activeElement !== keepCountInputRef.current) {
        setKeepCountInput(numRetainKeepCount.toString());
      }
    }, [numRetainKeepCount]);
    const [confirm, setConfirm] = useState<ConfirmState>({
      open: false,
      kind: "disable",
      disablePaths: [],
      count: 0,
    });
    const [hintsOpen, setHintsOpen] = useState(false);

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

    // 预览弃用：用当前 store 快照计算 disable 列表，不写库——供确认对话框展示
    const handlePreviewDisable = useCallback(() => {
      const s = usePhotoFilterStore.getState();
      const policy: RetentionPolicy = {
        criteria: s.strRetainCriteria,
        keepCount: s.numRetainKeepCount,
      };
      const { disable } = computeRetentionPolicy(
        s.lstGalleryGroupedPhotos,
        policy,
        s.lstPhotosEyeStats,
      );
      // 无可弃用项时直接跳过，避免弹"弃用 0 张"的空确认框
      if (disable.length === 0) return;
      setConfirm({
        open: true,
        kind: "disable",
        disablePaths: disable.map((p) => p.filePath),
        count: disable.length,
      });
    }, []);

    // 预览启用所有：统计当前画廊中已弃用照片数（仅这些会被重新启用）
    const handlePreviewEnableAll = useCallback(() => {
      const s = usePhotoFilterStore.getState();
      let disabled = 0;
      for (const g of s.lstGalleryGroupedPhotos) {
        for (const p of g) if (!p.isEnabled) disabled++;
      }
      setConfirm({
        open: true,
        kind: "enable",
        disablePaths: [],
        count: disabled,
      });
    }, []);

    // 确认执行：弃用传快照路径，启用直接调 action
    const handleConfirm = useCallback(async () => {
      if (confirm.kind === "disable") {
        await fnDisableRedundantInGroups(confirm.disablePaths);
      } else {
        await fnEnableAllPhotos();
      }
      setConfirm((prev) => ({ ...prev, open: false }));
    }, [confirm, fnDisableRedundantInGroups, fnEnableAllPhotos]);

    const currentPhoto = useMemo(
      () => lstPreviewPhotoDetails[0],
      [lstPreviewPhotoDetails],
    );

    const noopRefresh = useCallback(() => PhotoService.refreshPhotos(), []);

    // 睁眼策略但数据未就绪时的降级提示文案
    const eyeDegradedHint =
      strRetainCriteria === "eye" && !eyeStatsReady
        ? t("filterPage.retainEyeNotReady")
        : null;

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
            {/* ① 智能推荐摘要卡 */}
            <RetainSummaryCard />

            {/* ② 检测配置：相似度阈值 */}
            <CustomSlider
              label={t("filterPage.similarityThresholdLabel")}
              description={t("filterPage.similarityThresholdDesc")}
              min={0}
              max={1}
              step={0.01}
              value={numSimilarityThreshold}
              onChange={handleSliderChange}
            />
            <p className="text-muted-foreground text-[11px] leading-relaxed">
              {t("filterPage.thresholdResubmitHint")}
            </p>

            {/* ③ 保留策略（total 模式下禁用：单一大组保留 N 语义荒谬） */}
            <div
              className={`border-border/60 space-y-2 rounded-lg border p-2.5 ${
                isTotalMode ? "pointer-events-none opacity-40" : ""
              }`}
            >
              <div className="text-muted-foreground text-[11px] font-medium">
                {t("filterPage.retainStrategyTitle")}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs">
                  {t("filterPage.retainCriteriaLabel")}
                </span>
                <ToggleGroup
                  type="single"
                  value={strRetainCriteria}
                  onValueChange={(v) => {
                    if (v) fnSetRetainCriteria(v as "iqa" | "eye");
                  }}
                  disabled={isTotalMode}
                  className="bg-muted/60 rounded-md"
                >
                  <ToggleGroupItem
                    value="iqa"
                    className="h-7 px-2 text-xs"
                    aria-label="IQA"
                  >
                    {t("filterPage.retainCriteriaIqa")}
                  </ToggleGroupItem>
                  <ToggleGroupItem
                    value="eye"
                    className="h-7 px-2 text-xs"
                    aria-label="eye"
                  >
                    {t("filterPage.retainCriteriaEye")}
                  </ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs">
                  {t("filterPage.retainKeepCountLabel")}
                </span>
                <Input
                  ref={keepCountInputRef}
                  type="number"
                  min={1}
                  max={99}
                  disabled={isTotalMode}
                  value={keepCountInput}
                  onChange={(e) => setKeepCountInput(e.target.value)}
                  onBlur={() => {
                    // 失焦时解析+钳制+提交，防止输入 0 时 DOM 残留与 store 不一致
                    const n = parseInt(keepCountInput, 10);
                    fnSetRetainKeepCount(Number.isNaN(n) ? 1 : n);
                  }}
                  className="h-7 w-16 text-center text-xs"
                />
              </div>
              {eyeDegradedHint && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {eyeDegradedHint}
                </p>
              )}
              {isTotalMode && (
                <p className="text-muted-foreground text-[11px]">
                  {t("filterPage.retainTotalModeHint")}
                </p>
              )}
            </div>

            {/* ④ 批量动作：预览摘要 + 确认执行 */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handlePreviewDisable}
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={isTotalMode}
              >
                <Trash2 className="h-4 w-4" />
                {t("filterPage.disableRedundant")}
              </Button>
              <Button
                onClick={handlePreviewEnableAll}
                variant="outline"
                size="sm"
                className="justify-start gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                {t("filterPage.enableAll")}
              </Button>
            </div>

            {/* ⑤ 操作提示（默认折叠，降权） */}
            <button
              onClick={() => setHintsOpen((v) => !v)}
              className="text-muted-foreground flex w-full items-center gap-1 text-[11px] hover:underline"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${hintsOpen ? "rotate-180" : ""}`}
              />
              {t("filterPage.hintsToggle")}
            </button>
            {hintsOpen && (
              <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  <div className="space-y-2 leading-relaxed">
                    <p>{t("filterPage.filterHintPrefix")}</p>
                    <p className="flex flex-wrap items-center gap-1">
                      {t("filterPage.filterHintLine1")}
                      <Kbd>⏎</Kbd>
                      {t("filterPage.filterHintLine1Suffix")}
                      <span className="inline-flex gap-0.5">
                        <Kbd>↑</Kbd>
                        <Kbd>↓</Kbd>
                        <Kbd>←</Kbd>
                        <Kbd>→</Kbd>
                      </span>
                      {t("filterPage.filterHintLine1End")}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="preview"
          className="mt-0 flex h-[calc(100vh-160px)] flex-col overflow-hidden border-0 bg-transparent p-0"
        >
          <div
            ref={previewContainerRef}
            className="flex h-full flex-col overflow-hidden"
          >
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

        {/* 批量动作确认对话框 */}
        <AlertDialog
          open={confirm.open}
          onOpenChange={(open) => {
            if (!open) setConfirm((prev) => ({ ...prev, open: false }));
          }}
        >
          <AlertDialogContent data-testid="retain-confirm-dialog">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm.kind === "disable"
                  ? t("filterPage.retainPreviewTitle")
                  : t("filterPage.enableAllConfirmTitle")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.kind === "disable"
                  ? t("filterPage.retainPreviewDisable", {
                      count: confirm.count,
                    })
                  : t("filterPage.enableAllConfirmDesc", {
                      count: confirm.count,
                    })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>
                {t("filterPage.retainConfirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Tabs>
    );
  },
);

SidePanel.displayName = "SidePanel";
