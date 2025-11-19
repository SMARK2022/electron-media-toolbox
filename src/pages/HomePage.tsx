import LangToggle from "@/components/LangToggle";
import ToggleTheme from "@/components/ToggleTheme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
} from "lucide-react";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export default function HomePage() {
  const { t, i18n } = useTranslation();
  const [serverStatusKey, setServerStatusKey] = useState("status.checking");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [latency, setLatency] = useState<number | null>(null);

  const checkServerStatus = async () => {
    try {
      setStatus("loading");
      setServerStatusKey("status.checking");
      setLatency(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1000);
      const start = Date.now();

      const response = await fetch("http://localhost:8000/status", {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const end = Date.now();

      if (response.ok) {
        setServerStatusKey("status.backendRunning");
        setStatus("success");
        setLatency(end - start);
      } else {
        setServerStatusKey("status.backendNotRunning");
        setStatus("error");
        setLatency(null);
      }
    } catch {
      setServerStatusKey("status.backendNotRunning");
      setStatus("error");
      setLatency(null);
    }
  };

  useEffect(() => {
    checkServerStatus();
  }, [i18n.language]);

  const renderStatusIcon = () => {
    if (status === "success") {
      return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    }
    if (status === "error") {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <Activity className="h-4 w-4 animate-pulse text-yellow-500" />;
  };

  const statusLabelClass = cn(
    "font-medium text-sm",
    status === "success"
      ? "text-green-700"
      : status === "error"
        ? "text-red-700"
        : "text-yellow-700",
  );

  const badgeClass = cn(
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold border",
    status === "success" && "border-green-100 bg-green-50 text-green-700",
    status === "error" && "border-red-100 bg-red-50 text-red-700",
    status === "loading" && "border-yellow-100 bg-yellow-50 text-yellow-700",
  );

  const checkLabel = t("actions.checkStatus");
  const checkButtonText =
    checkLabel === "actions.checkStatus" ? t("status.checking") : checkLabel;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-[2.5vh] pb-24 text-center">
        {/* 标题 */}
        <h1 className="text-4xl font-bold">{t("page.title")}</h1>

        {/* 说明文案 */}
        <p className="mx-auto max-w-[80vw] break-words whitespace-normal">
          {t("instructions.importPhotos")}
        </p>

        {/* 语言切换 + 主题切换：合并为一块 */}
        <div className="bg-background mt-1 flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-sm">
          <LangToggle />
          <div className="bg-muted-foreground/40 mx-1 h-4 w-px" />
          <ToggleTheme />
        </div>

        {/* 后端状态卡片（包含状态 + 延迟 + 地址 + 按钮） */}
        <div className="bg-background/80 mt-1 w-full max-w-sm rounded-xl border p-4 text-left shadow-sm">
          {/* 顶部标题 + 状态 Badge */}
          <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Server className="h-4 w-4" />
                  <span>{t("homePage.backendService")}</span>
                </div>
                <div className={badgeClass}>
                  <span>
                    {status === "success"
                      ? t("homePage.statusOnline")
                      : status === "error"
                        ? t("homePage.statusOffline")
                        : t("homePage.statusConnecting")}
                  </span>
                </div>
              </div>

          {/* 状态行 */}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("status.checking")}
            </span>
            <div className="flex items-center gap-2">
              {renderStatusIcon()}
              <span className={statusLabelClass}>{t(serverStatusKey)}</span>
            </div>
          </div>

          {/* 延迟行 */}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("homePage.responseTime")}</span>
            <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
              {status === "success" && latency != null ? `${latency} ms` : "--"}
            </span>
          </div>

          {/* 地址行 */}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("homePage.endpoint")}</span>
            <code className="bg-muted rounded px-1.5 py-0.5 text-[11px] text-right break-words max-w-[65%]">
              http://localhost:8000/status
            </code>
          </div>

          {/* 检查按钮 */}
          <Button
            onClick={checkServerStatus}
            variant="outline"
            size="sm"
            disabled={status === "loading"}
            className="mt-1 flex w-full items-center justify-center gap-2 text-xs"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                status === "loading" && "animate-spin",
              )}
            />
            <span>{checkButtonText}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
