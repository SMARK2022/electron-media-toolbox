/**
 * RetainSummaryCard - 智能推荐摘要卡
 * ==================================
 * 独立订阅派生计数（分组数/照片数/启用/弃用/闭眼风险），而非原始数组引用，
 * 避免每 4s refreshPhotos 替换 lstGalleryGroupedPhotos 时触发 SidePanel 全树重渲染。
 * 仅当计数变化才重渲染（Zustand 对 selector 返回的原始值做 Object.is 比较）。
 */
import { useTranslation } from "react-i18next";
import {
  Layers,
  Image as ImageIcon,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { usePhotoFilterStore } from "@/helpers/store/usePhotoFilterStore";

export const RetainSummaryCard = () => {
  const { t } = useTranslation();

  // 各计数独立订阅原始值，未变化时不触发本组件重渲染
  const groupCount = usePhotoFilterStore(
    (s) => s.lstGalleryGroupedPhotos.length,
  );
  const photoCount = usePhotoFilterStore(
    (s) => s.lstGalleryGroupedPhotos.flat().length,
  );
  const enabledCount = usePhotoFilterStore((s) => {
    // 统计当前画廊中仍启用的照片数
    let n = 0;
    for (const g of s.lstGalleryGroupedPhotos) {
      for (const p of g) if (p.isEnabled) n++;
    }
    return n;
  });
  // 闭眼风险：仅统计当前画廊内照片（相册切换后 eyeStats 可能含陈旧条目）
  const eyeRiskCount = usePhotoFilterStore((s) => {
    let n = 0;
    for (const g of s.lstGalleryGroupedPhotos) {
      for (const p of g) {
        const stats = s.lstPhotosEyeStats.get(p.filePath);
        if (stats && (stats.closedEyesCount > 0 || stats.suspiciousCount > 0))
          n++;
      }
    }
    return n;
  });

  const disabledCount = photoCount - enabledCount;

  return (
    <div className="border-border/60 bg-muted/30 grid grid-cols-2 gap-2 rounded-lg border p-2.5 text-xs">
      <StatItem
        icon={Layers}
        label={t("filterPage.summaryGroups")}
        value={groupCount}
        tone="default"
      />
      <StatItem
        icon={ImageIcon}
        label={t("filterPage.summaryPhotos")}
        value={photoCount}
        tone="default"
      />
      <StatItem
        icon={Eye}
        label={t("filterPage.summaryEnabled")}
        value={enabledCount}
        tone="emerald"
      />
      <StatItem
        icon={EyeOff}
        label={t("filterPage.summaryDisabled")}
        value={disabledCount}
        tone="muted"
      />
      {eyeRiskCount > 0 && (
        <StatItem
          icon={AlertTriangle}
          label={t("filterPage.summaryEyeRisk")}
          value={eyeRiskCount}
          tone="amber"
        />
      )}
    </div>
  );
};

// 单项统计：tone 控制图标/数值配色
const StatItem = ({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  tone: "default" | "emerald" | "muted" | "amber";
}) => {
  const toneClass = {
    default: "text-foreground",
    emerald: "text-emerald-600 dark:text-emerald-400",
    muted: "text-muted-foreground",
    amber: "text-amber-600 dark:text-amber-400",
  }[tone];

  return (
    <div className="flex items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 ${toneClass}`} />
      <span className="text-muted-foreground truncate">{label}</span>
      <span className={`ml-auto font-mono font-semibold ${toneClass}`}>
        {value}
      </span>
    </div>
  );
};

RetainSummaryCard.displayName = "RetainSummaryCard";
