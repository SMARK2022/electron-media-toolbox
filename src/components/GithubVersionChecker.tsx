// src/components/github-version-checker.tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";

// 当前版本从运行时注入的全局变量或回退到 0.0.0（避免直接导入 package.json 导致 tsconfig 报错）
// 在 Electron 中可在 preload 中设置 window.__APP_VERSION__ = app.getVersion()
// 在 Next.js 或其他构建工具中可通过环境变量 NEXT_PUBLIC_APP_VERSION 注入
import packageJson from "@/../package.json";

const CURRENT_VERSION: string = (packageJson as any).version ?? "0.0.0";

const REPO_OWNER = "SMARK2022";
const REPO_NAME = "electron-media-toolbox";
const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;
const LATEST_RELEASE_PAGE = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

// 简单的 semver 比较：返回 1(a>b)、0(a=b)、-1(a<b)
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

type Status = "checking" | "up-to-date" | "update-available" | "error";

export function GithubVersionChecker({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = React.useState<Status>("checking");
  const [latestVersion, setLatestVersion] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

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

    async function checkVersion() {
      try {
        setStatus("checking");
        setErrorMessage(null);

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

        if (cancelled) return;

        setLatestVersion(remoteVersion);

        const cmp = compareSemver(remoteVersion, CURRENT_VERSION);
        if (cmp <= 0) {
          setStatus("up-to-date");
        } else {
          setStatus("update-available");
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error("Failed to check GitHub releases:", err);
        setErrorMessage(err?.message ?? "Unknown error");
        setStatus("error");
      }
    }

    checkVersion();

    return () => {
      cancelled = true;
    };
  }, []);

  const openLatestReleasePage = React.useCallback(() => {
    openExternal(LATEST_RELEASE_PAGE);
  }, [openExternal]);

  const renderIcon = () => {
    if (status === "checking") {
      return <Loader2 className="mr-2 h-4 w-4 animate-spin" />;
    }
    if (status === "up-to-date") {
      return <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />;
    }
    if (status === "update-available") {
      return <ArrowUpRight className="mr-2 h-4 w-4 text-amber-500" />;
    }
    // error
    return <Loader2 className="mr-2 h-4 w-4 text-red-500" />;
  };

  const renderLabel = () => {
    if (status === "checking") {
      return t("updateChecker.checking");
    }
    if (status === "up-to-date") {
      return t("updateChecker.upToDate");
    }
    if (status === "update-available") {
      return t("updateChecker.updateAvailable");
    }
    return t("updateChecker.error");
  };

  const handleClick = () => {
    if (status === "update-available") {
      openLatestReleasePage();
    } else if (status === "error") {
      // 失败时点击重试：简单粗暴版重新刷新
      window.location.reload();
    }
  };

  const isChecking = status === "checking";
  const isUpdateAvailable = status === "update-available";

  return (
    <div className={cn("flex flex-col gap-1 text-sm", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{t("updateChecker.title")}</span>
          <span className="text-muted-foreground text-xs">
            {t("updateChecker.currentVersion")} <code>{CURRENT_VERSION}</code>
            {latestVersion && (
              <>
                {" · "}
                {t("updateChecker.latestVersion")} <code>{latestVersion}</code>
              </>
            )}
          </span>
        </div>

        <Button
          variant={isUpdateAvailable ? "default" : "outline"}
          size="sm"
          disabled={isChecking}
          onClick={handleClick}
        >
          {renderIcon()}
          <span className="whitespace-nowrap">{renderLabel()}</span>
        </Button>
      </div>
      {status === "error" && errorMessage && (
        <p className="mt-1 text-xs text-red-500">{errorMessage}</p>
      )}
    </div>
  );
}
