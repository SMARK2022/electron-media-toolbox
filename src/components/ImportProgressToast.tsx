/**
 * ImportProgressToast - 导入进度通知组件
 * ==========================================
 * - 显示缩略图、EXIF、总体进度条
 * - 导入完成后 1s 自动退出
 * - 提供红色终止按钮支持中止导入
 * - 订阅 PhotoService 状态变化自动更新
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Loader2,
  CheckCircle2,
  Image as ImageIcon,
  FileText,
  X,
  HardDrive,
  Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PhotoService } from "@/helpers/services/PhotoService";

// 导入任务状态类型（与 PhotoService 同步）
interface ImportTaskState {
  isRunning: boolean; // 任务是否运行中
  isComplete: boolean; // 任务是否完成
  totalFiles: number; // 总文件数
  processedFiles: number; // 已处理文件数
  thumbnailProgress: number; // 缩略图进度 0-100
  exifProgress: number; // EXIF 进度 0-100
  currentFile?: string; // 当前处理文件名
}

// 简化版 Progress 组件
const Progress = ({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) => (
  <div
    className={cn(
      "h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800",
      className
    )}
  >
    <div
      className={cn(
        "h-full w-full flex-1 bg-blue-600 transition-all duration-300 ease-in-out",
        indicatorClassName
      )}
      style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
    />
  </div>
);

export const ImportProgressToast = () => {
  const [state, setState] = useState<ImportTaskState>({
    isRunning: false,
    isComplete: false,
    totalFiles: 0,
    processedFiles: 0,
    thumbnailProgress: 0,
    exifProgress: 0,
  });

  const completeTimeoutRef = useRef<number | null>(null); // 完成后自动退出计时器

  // 订阅 PhotoService 状态变化
  useEffect(() => {
    const unsubscribe = PhotoService.subscribeImportTask(setState);
    return () => {
      unsubscribe();
      if (completeTimeoutRef.current !== null) {
        clearTimeout(completeTimeoutRef.current);
      }
    };
  }, []);

  // 完成后 1s 自动退出
  useEffect(() => {
    if (state.isComplete) {
      if (completeTimeoutRef.current !== null) clearTimeout(completeTimeoutRef.current);
      completeTimeoutRef.current = window.setTimeout(() => {
        PhotoService.dismissImportToast();
        completeTimeoutRef.current = null;
      }, 1000);
    }
    return () => {
      if (completeTimeoutRef.current !== null) {
        clearTimeout(completeTimeoutRef.current);
      }
    };
  }, [state.isComplete]);

  // 未运行且未完成时不显示
  if (!state.isRunning && !state.isComplete) return null;

  // 计算总体进度（两个进度的平均值）
  const overallProgress = Math.round(
    (state.thumbnailProgress + state.exifProgress) / 2
  );

  // 处理 Toast 关闭（仅在完成状态下可见）
  const handleDismiss = () => {
    PhotoService.dismissImportToast();
  };

  // 处理取消导入（仅在运行中可见）
  const handleCancel = () => {
    PhotoService.cancelImportTask();
  };

  return (
    <div
      className={cn(
        "fixed bottom-6 right-6 z-50 w-80 rounded-xl border border-slate-200",
        "bg-white/95 p-4 shadow-2xl backdrop-blur-md transition-all duration-500 ease-out",
        "dark:border-slate-800 dark:bg-slate-900/95",
        "animate-in slide-in-from-bottom-5 fade-in duration-300"
      )}
    >
      {/* Header：标题 + 状态图标 + 关闭按钮 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* 状态图标：运行时显示旋转动画，完成时显示对勾 */}
          <div
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full border shadow-sm transition-colors",
              state.isComplete
                ? "bg-emerald-100 border-emerald-200 text-emerald-600 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400"
                : "bg-blue-50 border-blue-100 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400"
            )}
          >
            {state.isComplete ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {state.isComplete ? "导入完成" : "正在导入照片..."}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
              {state.isComplete
                ? `共成功导入 ${state.totalFiles} 张照片`
                : `${state.processedFiles} / ${state.totalFiles} 张`}
            </p>
          </div>
        </div>

        {/* 仅完成时显示关闭按钮 */}
        {state.isComplete && (
          <button
            onClick={handleDismiss}
            className="text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-300 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 进度条区域：仅运行时显示 */}
      {!state.isComplete && (
        <div className="space-y-3">
          {/* 总体进度条 */}
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
              <span>总体进度</span>
              <span>{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-2" />
          </div>

          {/* 分隔线 */}
          <div className="h-px bg-slate-100 dark:bg-slate-800" />

          {/* 详细进度：缩略图 + EXIF（2列网格） */}
          <div className="grid grid-cols-2 gap-3">
            {/* 缩略图进度 */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <ImageIcon className="h-3 w-3" />
                <span>缩略图</span>
              </div>
              <Progress
                value={state.thumbnailProgress}
                className="h-1.5 bg-slate-100 dark:bg-slate-800"
                indicatorClassName="bg-indigo-500"
              />
            </div>

            {/* EXIF 数据进度 */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                <FileText className="h-3 w-3" />
                <span>EXIF 数据</span>
              </div>
              <Progress
                value={state.exifProgress}
                className="h-1.5 bg-slate-100 dark:bg-slate-800"
                indicatorClassName="bg-amber-500"
              />
            </div>
          </div>

          {/* 当前处理文件信息 */}
          <div className="bg-slate-50 dark:bg-slate-900/50 rounded px-2 py-1.5 mt-2 border border-slate-100 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 truncate flex items-center gap-2">
              <HardDrive className="h-3 w-3 shrink-0" />
              <span className="truncate">
                {state.currentFile || "处理中..."}
              </span>
            </p>
          </div>

          {/* 终止按钮：仅运行时显示，红色样式 */}
          <button
            onClick={handleCancel}
            className={cn(
              "w-full mt-3 h-8 px-3 py-2 rounded-lg text-xs font-medium",
              "flex items-center justify-center gap-2",
              "bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700",
              "border border-red-200 hover:border-red-300",
              "dark:bg-red-900/20 dark:hover:bg-red-900/30 dark:text-red-400 dark:border-red-800",
              "transition-colors"
            )}
          >
            <Square className="h-3.5 w-3.5" />
            <span>终止导入</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default ImportProgressToast;
