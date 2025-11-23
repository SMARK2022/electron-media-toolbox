// src/components/GithubUpdateNotifier.tsx
"use client";

import * as React from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight,
  Loader2,
  Sparkles,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// 语言切换按钮
import LangToggle from "@/components/LangToggle";

// 和 GithubVersionChecker 保持一致的版本获取逻辑
import packageJson from "@/../package.json";

const CURRENT_VERSION: string = (packageJson as any).version ?? "0.0.0";

const REPO_OWNER = "SMARK2022";
const REPO_NAME = "electron-media-toolbox";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const LATEST_RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// 用于记录“用户已经忽略过的版本”，避免同一个版本反复打扰
const DISMISSED_VERSION_KEY = "github-update-dismissed-version";

// 简单 semver 比较：返回 1(a>b)、0(a=b)、-1(a<b)
function compareSemver(a: string, b: string): number {
  const normalize = (v: string) => {
    if (!v) return "0.0.0";
    if (v[0].toLowerCase() === "v") v = v.slice(1);
    return v;
  };
  const pa = normalize(a)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = normalize(b)
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

type UpdateState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "update-available";
      latestVersion: string;
      body: string;
      publishedAt?: string;
    }
  | { status: "up-to-date" }
  | { status: "error"; errorMessage: string };

/* -------------------------------------------------------------------------- */
/*                             简易 Markdown 渲染器                             */
/* -------------------------------------------------------------------------- */

function MarkdownReleaseNotes({ content }: { content: string }) {
  if (!content) return null;

  const lines = content.split(/\r?\n/);

  return (
    <div className="text-muted-foreground space-y-2 text-xs leading-relaxed sm:text-sm">
      {lines.map((line, i) => {
        const trimmed = line.trim();

        // 空行 -> 小间距
        if (!trimmed) {
          return <div key={i} className="h-2" />;
        }

        // 三级标题 ###
        if (trimmed.startsWith("### ")) {
          const titleText = trimmed.replace(/^###\s+/, "");
          return (
            <h3
              key={i}
              className="text-foreground mt-3 flex items-center gap-2 text-sm font-semibold"
            >
              <span className="h-4 w-1 rounded-full bg-blue-500 dark:bg-blue-400" />
              {titleText}
            </h3>
          );
        }

        // 列表项 * / -
        const listMatch = trimmed.match(/^[-*]\s+(.+)/);
        if (listMatch) {
          const itemText = listMatch[1];

          // 处理加粗 **text**
          const parts = itemText.split(/(\*\*[^*]+\*\*)/g);
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <div className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
              <p className="text-xs sm:text-sm">
                {parts.map((part, idx) => {
                  if (/^\*\*.*\*\*$/.test(part)) {
                    return (
                      <strong
                        key={idx}
                        className="bg-muted text-foreground mx-[2px] rounded px-1 font-semibold"
                      >
                        {part.slice(2, -2)}
                      </strong>
                    );
                  }
                  return <React.Fragment key={idx}>{part}</React.Fragment>;
                })}
              </p>
            </div>
          );
        }

        // 普通段落 + 加粗
        const boldParts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={i} className="text-xs sm:text-sm">
            {boldParts.map((part, idx) => {
              if (/^\*\*.*\*\*$/.test(part)) {
                return (
                  <strong
                    key={idx}
                    className="bg-muted text-foreground mx-[2px] rounded px-1 font-semibold"
                  >
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <React.Fragment key={idx}>{part}</React.Fragment>;
            })}
          </p>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                              更新通知主组件                                  */
/* -------------------------------------------------------------------------- */

export function GithubUpdateNotifier({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [state, setState] = React.useState<UpdateState>({ status: "idle" });
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const openExternal = React.useCallback((url: string) => {
    const anyWindow = window as any;
    try {
      if (anyWindow.ElectronAPI?.openExternal) {
        anyWindow.ElectronAPI.openExternal(url);
      } else if (anyWindow.electron?.shell?.openExternal) {
        anyWindow.electron.shell.openExternal(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function checkForUpdateOnceOnStartup() {
      try {
        setState({ status: "checking" });

        const res = await fetch(LATEST_RELEASE_API, {
          headers: {
            Accept: "application/vnd.github+json",
          },
        });

        if (!res.ok) {
          throw new Error(`GitHub API error: ${res.status}`);
        }

        const data: any = await res.json();
        const remoteVersion: string =
          data.tag_name || data.name || data.id?.toString() || "";
        const releaseBody: string = data.body || "";
        const publishedAt: string | undefined =
          data.published_at || data.created_at || undefined;

        if (cancelled) return;

        // 比较当前版本 vs 远端版本
        const cmp = compareSemver(remoteVersion, CURRENT_VERSION);

        if (cmp <= 0) {
          // 已是最新或更高（dev build 等情况）
          setState({ status: "up-to-date" });
          return;
        }

        // 有新版本，检查用户是否已经对同一版本点过“稍后再说/忽略”
        const dismissed = window.localStorage.getItem(DISMISSED_VERSION_KEY);
        const newState: UpdateState = {
          status: "update-available",
          latestVersion: remoteVersion,
          body: releaseBody,
          publishedAt,
        };

        setState(newState);

        if (dismissed && dismissed === remoteVersion) {
          // 用户已经忽略过这个版本：不再弹出，只在后台挂着
          return;
        }

        // 有新版本，且用户没忽略过 -> 弹窗提醒
        setDialogOpen(true);
      } catch (err: any) {
        if (cancelled) return;
        console.error("[GithubUpdateNotifier] check error:", err);
        setState({
          status: "error",
          errorMessage: err?.message ?? "Unknown error",
        });
      }
    }

    // 启动时仅检查一次
    checkForUpdateOnceOnStartup();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleLater = React.useCallback(() => {
    // 记住用户已经忽略了这个版本，下次启动不再弹
    if (state.status === "update-available") {
      try {
        window.localStorage.setItem(DISMISSED_VERSION_KEY, state.latestVersion);
      } catch {
        // 忽略 localStorage 失败
      }
    }
    setDialogOpen(false);
  }, [state]);

  const handleOpenGithub = React.useCallback(() => {
    if (state.status === "update-available") {
      try {
        window.localStorage.setItem(DISMISSED_VERSION_KEY, state.latestVersion);
      } catch {
        // ignore
      }
    }
    openExternal(LATEST_RELEASE_PAGE);
    setDialogOpen(false);
  }, [state, openExternal]);

  // 如果没有更新 / 检查失败，这个组件就只是“后台挂着”，不渲染弹窗内容
  if (state.status !== "update-available") {
    return <div className={cn("hidden", className)}>{/* 后台静默挂载 */}</div>;
  }

  const { latestVersion, body, publishedAt } = state;
  const releaseDate = publishedAt ? new Date(publishedAt) : null;

  // 文案（保留 i18n，可在语言文件中配置对应 key）
  const title =
    t("updateDialog.title", {
      defaultValue: "发现新版本",
    }) + ` v${latestVersion}`;

  const subtitle = t("updateDialog.subtitle", {
    defaultValue:
      "检测到 GitHub 上有新的版本可用，建议立即更新以获得最佳体验。",
  });

  const desc = t("updateDialog.description", {
    defaultValue: "是否前往 GitHub 下载最新版本？",
  });

  const currentVersionLabel = t("updateDialog.currentVersion", {
    defaultValue: "当前版本",
  });
  const latestVersionLabel = t("updateDialog.latestVersion", {
    defaultValue: "最新版本",
  });
  const releaseNotesLabel = t("updateDialog.releaseNotes", {
    defaultValue: "更新内容",
  });
  const releaseDateLabel = t("updateDialog.releaseDate", {
    defaultValue: "发布时间",
  });
  const laterLabel = t("updateDialog.later", {
    defaultValue: "稍后再说（下次启动时）",
  });
  const gotoGithubLabel = t("updateDialog.gotoGithub", {
    defaultValue: "前往 GitHub 下载",
  });
  const noReleaseNotesText = t("updateDialog.noReleaseNotes", {
    defaultValue: "该版本未提供详细更新说明。",
  });

  return (
    <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <AlertDialogContent
        className={cn(
          "bg-background flex max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 p-0 shadow-2xl dark:border-slate-800",
          className,
        )}
      >
        {/* 顶部渐变条 */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500 dark:from-blue-400 dark:via-indigo-400 dark:to-violet-400" />

        {/* 主体（可伸缩区域） */}
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Header：标题 + 副标题 + 语言切换 */}
          <div className="space-y-0 px-6 pt-4 pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="text-foreground flex items-center gap-2 text-2xl font-bold tracking-tight">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  {title}
                </div>
                <p className="text-muted-foreground text-sm max-w-[55vw]">{subtitle}</p>
                <p className="text-muted-foreground/80 text-xs">{desc}</p>
              </div>

              {/* 右上角：语言切换 */}
              <div className="flex items-center justify-end">
                <div className="scale-90 transform">
                  <LangToggle />
                </div>
              </div>
            </div>
          </div>

          {/* 版本信息条 */}
          <div className="px-6 pb-3">
            <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs sm:text-sm dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {currentVersionLabel}:
                </span>
                <code className="text-foreground font-mono text-xs sm:text-sm">
                  {CURRENT_VERSION}
                </code>
              </div>

              <div className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-700" />

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {latestVersionLabel}:
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 dark:bg-blue-900/40">
                  <code className="font-mono text-xs text-blue-700 sm:text-sm dark:text-blue-300">
                    v{latestVersion}
                  </code>
                </span>
              </div>

              {releaseDate && (
                <div className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {releaseDateLabel}:{" "}
                    {releaseDate.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Release Notes 区域：在剩余区域内滚动 */}
          <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
            <div className="text-foreground mb-2 flex items-center gap-2 text-sm font-medium">
              <AlertCircle className="h-4 w-4 text-blue-500" />
              {releaseNotesLabel}
            </div>
            <ScrollArea className="bg-muted/40 min-h-0 w-full flex-1 rounded-md border p-3 text-xs sm:text-sm dark:border-slate-800">
              {body ? (
                <MarkdownReleaseNotes content={body} />
              ) : (
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>{noReleaseNotesText}</span>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>

        {/* 底部操作栏 */}
        <AlertDialogFooter className="bg-muted/40 flex flex-col gap-2 border-t border-slate-100 px-6 py-3 sm:flex-row sm:justify-end dark:border-slate-800">
          <AlertDialogCancel asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-center sm:w-auto"
              onClick={handleLater}
            >
              {laterLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              size="sm"
              className="w-full justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 dark:from-blue-500 dark:to-indigo-500 dark:hover:from-blue-600 dark:hover:to-indigo-600"
              onClick={handleOpenGithub}
            >
              <ArrowUpRight className="h-4 w-4" />
              {gotoGithubLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
