import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  FileText,
  HardDrive,
  Calendar,
  Info,
  Hash,
  Activity,
  Percent,
  MapPin,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { PhotoExtend } from "@/lib/db";

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
  highlight?: boolean;
};

const InfoRow: React.FC<InfoRowProps> = ({
  icon: Icon,
  label,
  value,
  highlight = false,
}) => {
  if (value === undefined || value === null || value === "") return null;

  return (
    <TableRow className="hover:bg-muted/40 transition-colors">
      <TableCell className="w-[10vw] align-top">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
      </TableCell>
      <TableCell>
        <div
          className={`text-sm break-all leading-tight ${
            highlight
              ? "font-semibold text-foreground"
              : "text-muted-foreground"
          }`}
        >
          {value}
        </div>
      </TableCell>
    </TableRow>
  );
};

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

  const statusLabel = isPreviewEnabled
    ? t("photoDetailsTable.statusEnabled")
    : t("photoDetailsTable.statusDisabled");
  const statusDescription = isPreviewEnabled
    ? t("photoDetailsTable.statusEnabledDesc")
    : t("photoDetailsTable.statusDisabledDesc");

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {/* 顶部标题 + 启用状态 */}
      <div className="flex items-start justify-between gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-0.5">
            {t("photoDetailsTable.currentPreviewPhoto")}
          </p>
          <p className="text-sm font-semibold text-foreground leading-tight break-all">
            {fileName || t("photoDetailsTable.noPhotoSelected")}
          </p>
          {groupId && (
            <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {t("photoDetailsTable.groupNumber")}：{groupId}
            </p>
          )}
        </div>

        {isEnabled !== undefined && (
          <div className="flex flex-col items-end gap-1 py-5 shrink-0">
            <div className="flex items-center gap-2 text-xs">
              <Label
                htmlFor="photo-enabled-switch"
                className={`cursor-pointer ${
                  isPreviewEnabled ? "text-foreground" : "text-destructive"
                }`}
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
              />
            </div>
          </div>
        )}
      </div>

      {/* 主信息表格 */}
      <div className="px-3 pb-3 pt-1">
        <Table>
          <TableBody>
            <InfoRow
              icon={FileText}
              label={t("photoDetailsTable.fileName")}
              value={fileName}
              highlight
            />
            <InfoRow
              icon={MapPin}
              label={t("photoDetailsTable.filePath")}
              value={filePath}
            />
            <InfoRow
              icon={HardDrive}
              label={t("photoDetailsTable.fileSize")}
              value={formatted.size}
            />
            <InfoRow
              icon={Info}
              label={t("photoDetailsTable.fileInfo")}
              value={info}
            />
            <InfoRow
              icon={Calendar}
              label={t("photoDetailsTable.fileDate")}
              value={formatted.dateDisplay}
            />
            <InfoRow
              icon={Percent}
              label={t("photoDetailsTable.similarity")}
              value={
                similarity !== undefined
                  ? formatted.similarity
                  : undefined
              }
            />
            <InfoRow
              icon={Activity}
              label={t("photoDetailsTable.iqaScore")}
              value={IQA !== undefined ? formatted.iqa : undefined}
            />
          </TableBody>
        </Table>

        {/* 底部状态描述 */}
        {isEnabled !== undefined && (
          <div className="mt-3 rounded-lg border bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
            <div className="flex items-center gap-1.5 mb-0.5">
              {isPreviewEnabled ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className="font-medium text-foreground">
                {statusLabel}
              </span>
            </div>
            <p>{statusDescription}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PhotoDetailsTable;
