import React, { useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";
import {
  Camera,
  MapPin,
  FileImage,
  Calendar,
  Aperture,
  Timer,
  Maximize,
  Copy,
  Check,
  HardDrive,
  Globe,
  Settings2,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

interface PhotoInfoDialogProps {
  open: boolean;
  /** 关闭弹窗 */
  onOpenChange: (open: boolean) => void;
  /** 当前预览的照片基本信息（仅用于显示路径等） */
  photo: { filePath?: string } | null;
  /** 主进程返回的 metadata 对象 */
  metadata: Record<string, any> | null;
}

// 简单的字段名本地翻译映射（仅在中文环境下使用）
const FIELD_LABEL_MAP_ZH: Record<string, string> = {
  // 基础信息
  filePath: "文件路径",
  size: "文件大小 (字节)",
  fileSize: "文件大小 (字节)",
  mtime: "修改时间",
  ctime: "创建时间",
  mtimeMs: "修改时间 (毫秒)",
  ctimeMs: "创建时间 (毫秒)",

  // 常见 EXIF 字段
  ImageWidth: "图像宽度",
  ImageHeight: "图像高度",
  ResolutionUnit: "分辨率单位",
  ImageDescription: "图像描述",
  Make: "相机品牌",
  Model: "相机型号",
  Software: "软件",
  Orientation: "方向",
  ModifyDate: "修改日期",
  YCbCrPositioning: "YCbCr 定位",
  XResolution: "水平分辨率",
  YResolution: "垂直分辨率",
  GPSVersionID: "GPS 版本",
  GPSLatitudeRef: "纬度参考",
  GPSLatitude: "纬度",
  GPSLongitudeRef: "经度参考",
  GPSLongitude: "经度",
  GPSAltitudeRef: "海拔参考",
  GPSAltitude: "海拔",
  GPSTimeStamp: "GPS 时间戳",
  GPSDateStamp: "GPS 日期",
  RecommendedExposureIndex: "推荐感光度",
  SensitivityType: "感光度类型",
  ISO: "ISO",
  ExposureProgram: "曝光程序",
  FNumber: "光圈值",
  ExposureTime: "曝光时间",
  SensingMethod: "感光方式",
  SubSecTimeDigitized: "数字化时间(子秒)",
  SubSecTimeOriginal: "原始时间(子秒)",
  SubSecTime: "时间(子秒)",
  FocalLength: "焦距",
  Flash: "闪光灯",
  LightSource: "光源",
  MeteringMode: "测光模式",
  SceneCaptureType: "场景类型",
  FocalLengthIn35mmFormat: "等效 35mm 焦距",
  MaxApertureValue: "最大光圈值",
  CreateDate: "拍摄时间",
  DateTimeOriginal: "原始拍摄时间",
  ExposureCompensation: "曝光补偿",
  DigitalZoomRatio: "数码变焦倍率",
  ExifImageHeight: "EXIF 图像高度",
  ExifImageWidth: "EXIF 图像宽度",
  WhiteBalance: "白平衡",
  BrightnessValue: "亮度值",
  ExposureMode: "曝光模式",
  ApertureValue: "光圈值 (Av)",
  ShutterSpeedValue: "快门速度 (Tv)",
  InteropIndex: "互操作索引",
  captureTime: "捕获时间",
  cameraModel: "相机型号",
};

// 仅中文环境下使用的字段映射
function getFieldLabel(key: string, isChinese: boolean): string {
  if (!isChinese) return key; // 英文等其他语言直接返回原始 key
  return FIELD_LABEL_MAP_ZH[key] ?? key;
}

// 工具：合并 className
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// 工具：文件大小格式化
const formatFileSize = (bytes: number) => {
  if (!bytes || bytes <= 0 || !Number.isFinite(bytes)) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  );
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

// 工具：日期格式化
const formatDate = (val: string | number | Date | undefined | null) => {
  if (!val) return "";
  try {
    const date = val instanceof Date ? val : new Date(val);
    if (isNaN(date.getTime())) return String(val);
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(date);
  } catch {
    return String(val);
  }
};

// 工具：快门时间格式化
const formatExposureTime = (val: number) => {
  if (!Number.isFinite(val)) return "--";
  if (val >= 1 || val === 0) return `${val}s`;
  return `1/${Math.round(1 / val)}s`;
};

// 子组件：信息块
const InfoItem: React.FC<{
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  className?: string;
}> = ({ label, value, icon: Icon, className }) => (
  <div
    className={cn(
      "flex flex-col rounded-md bg-muted/40 p-2 text-xs",
      className,
    )}
  >
    <span className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
      {Icon && <Icon className="h-3 w-3" />}
      {label}
    </span>
    <span className="select-text truncate font-medium text-foreground">
      {value}
    </span>
  </div>
);

// 子组件：复制按钮
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 忽略复制失败
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="ml-2 inline-flex items-center justify-center rounded p-1 transition-colors hover:bg-muted"
      title="复制路径"
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </button>
  );
};

export const PhotoInfoDialog: React.FC<PhotoInfoDialogProps> = ({
  open,
  onOpenChange,
  photo,
  metadata,
}) => {
  const { t, i18n } = useTranslation();

  const isChinese = useMemo(
    () => i18n.language?.startsWith("zh"),
    [i18n.language],
  );

  // 扁平化 metadata，将 exif 展开到同一层
  const flatData: Record<string, any> = useMemo(() => {
    if (!metadata) return {};
    const base: Record<string, any> = { ...metadata };
    if (metadata.exif && typeof metadata.exif === "object") {
      Object.assign(base, metadata.exif);
      delete base.exif;
    }
    return base;
  }, [metadata]);

  // 相机与曝光相关信息
  const cameraModel = [flatData.Make, flatData.Model]
    .filter(Boolean)
    .join(" ");

  const lensInfo =
    flatData.LensModel ||
    (flatData.FocalLengthIn35mmFormat
      ? `${flatData.FocalLengthIn35mmFormat}mm (35mm eq)`
      : null);

  const fNumber = flatData.FNumber
    ? `f/${flatData.FNumber}`
    : flatData.ApertureValue
      ? `f/${flatData.ApertureValue}`
      : null;

  const shutter = flatData.ExposureTime
    ? formatExposureTime(flatData.ExposureTime)
    : flatData.ShutterSpeedValue
      ? formatExposureTime(1 / Math.pow(2, flatData.ShutterSpeedValue))
      : null;

  const iso = flatData.ISO;

  // 拍摄/修改时间
  const captureDateStr = formatDate(
    flatData.DateTimeOriginal || flatData.CreateDate || flatData.mtime,
  );
  const captureDateShort = captureDateStr.split(" ")[0] || "--";

  // GPS 信息 + 必应地图链接
  const hasGPS =
    typeof flatData.GPSLatitude === "number" &&
    typeof flatData.GPSLongitude === "number";

  const bingMapLink = hasGPS
    ? `https://www.bing.com/maps?q=${flatData.GPSLatitude},${flatData.GPSLongitude}`
    : "#";

  // 重点展示的 key，其他放到“其他参数”中
  const prominentKeys = useMemo(
    () =>
      new Set([
        "Make",
        "Model",
        "LensModel",
        "FocalLengthIn35mmFormat",
        "FNumber",
        "ApertureValue",
        "ExposureTime",
        "ShutterSpeedValue",
        "ISO",
        "DateTimeOriginal",
        "CreateDate",
        "mtime",
        "ctime",
        "GPSLatitude",
        "GPSLongitude",
        "GPSAltitude",
        "filePath",
        "fileSize",
        "size",
        "mtimeMs",
        "ctimeMs",
      ]),
    [],
  );

  const otherEntries = useMemo(
    () =>
      Object.entries(flatData)
        .filter(([k, v]) => {
          if (prominentKeys.has(k)) return false;
          if (v === undefined || v === null) return false;
          if (typeof v === "object") return false;
          return true;
        })
        .sort((a, b) => a[0].localeCompare(b[0])),
    [flatData, prominentKeys],
  );

  const hasMetadata = Object.keys(flatData).length > 0;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden p-0">
        {/* 头部 + 高亮信息区 */}
        <div className="border-b bg-muted/30 p-6 pb-4">
          <AlertDialogHeader className="mb-4">
            <AlertDialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              {t("photoContext.infoTitle", "Photo details")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="break-all">
                    {photo?.filePath || flatData.filePath || ""}
                  </span>
                  {(photo?.filePath || flatData.filePath) && (
                    <CopyButton
                      text={(photo?.filePath || flatData.filePath) as string}
                    />
                  )}
                </div>
                <div className="text-[11px]">
                  {t(
                    "photoContext.infoDescription",
                    "All available metadata for this photo.",
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* 相机/曝光高亮区 */}
          <div className="mb-2 grid grid-cols-4 gap-2">
            <div className="col-span-2 flex flex-col justify-center rounded-md border bg-background p-3">
              <span className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                <Camera className="h-3 w-3" />
                {isChinese ? "相机" : "Camera"}
              </span>
              <span
                className="truncate text-sm font-semibold"
                title={cameraModel || (isChinese ? "未知相机" : "Unknown camera")}
              >
                {cameraModel || (isChinese ? "未知相机" : "Unknown camera")}
              </span>
              {lensInfo && (
                <span className="truncate text-xs text-muted-foreground">
                  {lensInfo}
                </span>
              )}
            </div>

            <div className="flex flex-col items-center justify-center rounded-md border bg-background p-3 text-center">
              <Aperture className="mb-1 h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-mono font-medium">
                {fNumber || "--"}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center rounded-md border bg-background p-3 text-center">
              <Timer className="mb-1 h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-mono font-medium">
                {shutter || "--"}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <InfoItem
              icon={FileImage}
              label={isChinese ? "ISO" : "ISO"}
              value={iso || "--"}
              className="border bg-background"
            />
            <InfoItem
              icon={Maximize}
              label={isChinese ? "分辨率" : "Resolution"}
              value={
                flatData.ImageWidth && flatData.ImageHeight
                  ? `${flatData.ImageWidth} x ${flatData.ImageHeight}`
                  : "--"
              }
              className="col-span-2 border bg-background"
            />
            <InfoItem
              icon={Calendar}
              label={isChinese ? "拍摄日期" : "Captured"}
              value={captureDateShort}
              className="border bg-background"
            />
          </div>
        </div>

        {/* 滚动详情区 */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6 pt-4 text-xs">
          {/* 文件信息 */}
          <section>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/80">
              <HardDrive className="h-4 w-4" />
              {isChinese ? "文件信息" : "File info"}
            </h4>
            <div className="space-y-3 rounded-lg border bg-card p-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-semibold uppercase text-muted-foreground">
                  {isChinese ? "文件路径" : "File path"}
                  {(photo?.filePath || flatData.filePath) && (
                    <CopyButton
                      text={(photo?.filePath || flatData.filePath) as string}
                    />
                  )}
                </div>
                <div className="break-all font-mono text-xs leading-relaxed text-foreground">
                  {photo?.filePath || flatData.filePath || "N/A"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t pt-2">
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {isChinese ? "文件大小" : "File size"}
                  </div>
                  <div className="text-xs">
                    {formatFileSize(
                      Number(flatData.fileSize || flatData.size || 0),
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                    {isChinese ? "修改时间" : "Modified"}
                  </div>
                  <div className="text-xs">
                    {formatDate(flatData.mtimeMs || flatData.mtime) || "--"}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* GPS 区块（使用必应地图） */}
          {hasGPS && (
            <section>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/80">
                <MapPin className="h-4 w-4" />
                {isChinese ? "地理位置" : "Location"}
              </h4>
              <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                    <Globe className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs font-medium">
                      {flatData.GPSLatitude?.toFixed(6)},
                      {" "}
                      {flatData.GPSLongitude?.toFixed(6)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {isChinese ? "海拔" : "Altitude"}
                      {": "}
                      {flatData.GPSAltitude !== undefined &&
                      flatData.GPSAltitude !== null
                        ? `${Math.round(flatData.GPSAltitude)}m`
                        : isChinese
                          ? "未知"
                          : "Unknown"}
                    </div>
                  </div>
                </div>
                <a
                  href={bingMapLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  {isChinese ? "在必应地图查看" : "View in Bing Maps"}
                </a>
              </div>
            </section>
          )}

          {/* 其他参数 */}
          {hasMetadata && otherEntries.length > 0 && (
            <section>
              <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground/80">
                <Settings2 className="h-4 w-4" />
                {isChinese ? "其他参数" : "Other details"}
              </h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {otherEntries.map(([key, value]) => (
                  <div
                    key={key}
                    className="rounded border px-2 py-1.5 transition-colors hover:bg-muted/50"
                  >
                    <dt className="mb-0.5 truncate text-[10px] text-muted-foreground">
                      {getFieldLabel(key, isChinese)}
                    </dt>
                    <dd
                      className="truncate text-[11px] font-medium"
                      title={String(value)}
                    >
                      {String(value)}
                    </dd>
                  </div>
                ))}
              </div>
            </section>
          )}

          {!hasMetadata && (
            <p className="text-[11px] text-muted-foreground">
              {t(
                "photoContext.infoEmpty",
                "No extra metadata available.",
              )}
            </p>
          )}
        </div>

        <AlertDialogFooter className="border-t bg-muted/10 p-4 pt-2">
          <AlertDialogAction className="w-full sm:w-auto">
            {t("common.close", isChinese ? "关闭" : "Close")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
