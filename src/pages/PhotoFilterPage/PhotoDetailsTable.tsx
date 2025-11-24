import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileText,
  HardDrive,
  Calendar,
  Info,
  Hash,
  Activity,
  Percent,
  MapPin,
} from "lucide-react";
import { PhotoExtend } from "@/lib/db";
import { cn } from "@/lib/utils";

interface PhotoDetailsTableProps {
  photo: PhotoExtend;
  isPreviewEnabled: boolean;
  setIsPreviewEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  updatePhotoEnabledStatus: (
    filePath: string,
    isEnabled: boolean,
  ) => Promise<void>;
  setPhotos: React.Dispatch<React.SetStateAction<any[]>>;
  onPhotoStatusChanged?: () => void;
}

// --- 工具函数：文件大小格式化 ---
const formatBytes = (bytes?: number | null, decimals = 2) => {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

// --- 工具函数：相似度格式化（自动识别 0–1 或 0–100） ---
const formatSimilarity = (value?: number | null) => {
  if (value === undefined || value === null) return "-";
  const v = value <= 1.5 ? value * 100 : value;
  return `${v.toFixed(1)} %`;
};

// --- 工具函数：IQA 格式化 ---
const formatIQA = (value?: number | null) => {
  if (value === undefined || value === null) return "-";
  return value.toFixed(2);
};

type InfoRowProps = {
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  label: string;
  value?: React.ReactNode;
  valueClassName?: string;
};

const InfoRow: React.FC<InfoRowProps> = ({
  icon: Icon,
  label,
  value,
  valueClassName,
}) => {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div className="group border-border/60 flex flex-col gap-0.5 border-b py-1.5 last:border-b-0">
      <div className="text-muted-foreground flex items-center gap-1.5 text-[11px] font-medium">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div
        className={cn(
          "text-foreground/90 pl-4 text-[13px] leading-snug break-all",
          valueClassName,
        )}
      >
        {value}
      </div>
    </div>
  );
};

const GroupBadge: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="bg-background inline-flex items-center rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
    {children}
  </span>
);

const PhotoDetailsTable: React.FC<PhotoDetailsTableProps> = ({
  photo,
  isPreviewEnabled,
  setIsPreviewEnabled,
  updatePhotoEnabledStatus,
  setPhotos,
  onPhotoStatusChanged,
}) => {
  const { t } = useTranslation();
  const [isUpdating, setIsUpdating] = useState(false);

  const {
    fileName,
    filePath,
    fileSize,
    info,
    date,
    groupId,
    similarity,
    IQA,
    isEnabled,
  } = photo;

  const formatted = useMemo(
    () => ({
      size: formatBytes(fileSize),
      similarity: formatSimilarity(similarity),
      iqa: formatIQA(IQA),
      dateDisplay: date ? date : "-",
    }),
    [fileSize, similarity, IQA, date],
  );

  const handleToggle = async (checked: boolean) => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await updatePhotoEnabledStatus(filePath, checked);

      // 同步更新前端状态
      setPhotos((prevPhotos) =>
        prevPhotos.map((group) =>
          group.map((p: PhotoExtend) =>
            p.filePath === filePath
              ? {
                  ...p,
                  isEnabled: checked,
                }
              : p,
          ),
        ),
      );
      setIsPreviewEnabled(checked);

      // 触发相册重新加载
      onPhotoStatusChanged?.();
    } catch (err) {
      console.error("[PhotoDetailsTable] 更新启用状态失败:", err);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="bg-card flex h-full flex-col overflow-hidden rounded-xl border shadow-sm">
      {/* 顶部区域：当前照片 + 分组 + 启用开关 + 状态描述 */}
      <div
        className={cn(
          "flex flex-col gap-1 border-b px-3.5 py-2 transition-colors duration-300",
          isPreviewEnabled
            ? "bg-emerald-50/70 dark:bg-emerald-950/20"
            : "bg-muted/40",
        )}
      >
        <div className="flex items-start justify-between gap-2.5">
          {/* 左侧：标题 + 文件名 + 分组 + 状态描述 */}
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-1.5">
              <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                {t("photoDetailsTable.currentPreviewPhoto")}
              </p>
              {groupId !== undefined && groupId !== null && (
                <GroupBadge>
                  <Hash className="mr-1 h-3 w-3 text-slate-400" />
                  {t("photoDetailsTable.groupNumber")} {groupId}
                </GroupBadge>
              )}
            </div>

            <div className="flex items-start gap-1.5">
              <FileText className="text-muted-foreground mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <p className="text-foreground line-clamp-2 text-[13px] leading-snug font-semibold">
                {fileName || t("photoDetailsTable.noPhotoSelected")}
              </p>
            </div>

            {/* 状态文案：放在文件名下面，行距收紧 */}
            {isEnabled !== undefined && (
              <p className="ml-5 text-[11px] leading-tight text-slate-600 dark:text-slate-400">
                {isPreviewEnabled
                  ? t("photoDetailsTable.statusEnabledDesc")
                  : t("photoDetailsTable.statusDisabledDesc")}
              </p>
            )}
          </div>

          {/* 右侧：开关 + 启用/弃用文案（在右半部分区域垂直居中） */}
          {isEnabled !== undefined && (
            <div className="flex shrink-0 flex-col items-end gap-0.5 self-center">
              <div className="flex items-center gap-1.5 text-[12px]">
                <Label
                  htmlFor="photo-enabled-switch"
                  className={cn(
                    "cursor-pointer font-medium",
                    isPreviewEnabled
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-slate-500 dark:text-slate-300",
                  )}
                >
                  {isPreviewEnabled
                    ? t("photoDetailsTable.enabled")
                    : t("photoDetailsTable.disabled")}
                </Label>
                <Switch
                  id="photo-enabled-switch"
                  checked={isPreviewEnabled}
                  disabled={isUpdating}
                  onCheckedChange={handleToggle}
                  className={cn(
                    // 自定义 switch 颜色（覆盖 shadcn 默认 primary）
                    "data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-slate-300",
                    "dark:data-[state=checked]:bg-emerald-500/90 dark:data-[state=unchecked]:bg-slate-700",
                  )}
                />
              </div>
              {isUpdating && (
                <p className="text-muted-foreground text-[11px]">
                  {t("photoDetailsTable.updatingStatus")}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 底部细分隔线，增加一点精致感但几乎不占高度 */}
        <div className="h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent dark:via-slate-700" />
      </div>

      {/* 主体：详细信息列表（响应式滚动区域） */}
      <ScrollArea className="flex-1">
        <div className="space-y-1.5 px-3.5 py-2">
          {/* 文件名（完整展示） */}
          <InfoRow
            icon={FileText}
            label={t("photoDetailsTable.fileName")}
            value={fileName}
            valueClassName="font-medium"
          />

          {/* 文件路径 */}
          <InfoRow
            icon={MapPin}
            label={t("photoDetailsTable.filePath")}
            value={filePath}
            valueClassName="font-mono text-[11px] text-muted-foreground"
          />

          {/* 文件大小 + 日期（在大屏时并排，小屏自动换行） */}
          <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
            <InfoRow
              icon={HardDrive}
              label={t("photoDetailsTable.fileSize")}
              value={formatted.size}
              valueClassName="font-mono"
            />
            <InfoRow
              icon={Calendar}
              label={t("photoDetailsTable.fileDate")}
              value={formatted.dateDisplay}
              valueClassName="font-mono"
            />
          </div>

          {/* EXIF / 拍摄信息 */}
          <InfoRow
            icon={Info}
            label={t("photoDetailsTable.fileInfo")}
            value={info}
          />

          {/* 相似度 + IQA 分数 */}
          <div className="grid gap-1.5 pt-1 sm:grid-cols-2">
            <InfoRow
              icon={Percent}
              label={t("photoDetailsTable.similarity")}
              value={
                similarity !== undefined ? formatted.similarity : undefined
              }
              valueClassName={cn(
                "font-mono",
                typeof similarity === "number" && similarity < 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "",
              )}
            />
            <InfoRow
              icon={Activity}
              label={t("photoDetailsTable.iqaScore")}
              value={IQA !== undefined ? formatted.iqa : undefined}
              valueClassName={cn(
                "font-mono",
                typeof IQA === "number" && IQA < 60
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400",
              )}
            />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
};

export default PhotoDetailsTable;
