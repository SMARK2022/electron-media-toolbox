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
import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_ATTEMPTS = 10; // 最多尝试 10 次（约 10 秒）
const REQUEST_TIMEOUT_MS = 1000; // 每次请求 1 秒超时
const INITIAL_RETRY_INTERVAL_MS = 1000; // 初始阶段重试间隔 1 秒
const CONNECTED_POLL_INTERVAL_MS = 2000; // 成功后每 2 秒刷新一次延迟

export default function HomePage() {
  const { t, i18n } = useTranslation();

  const [serverStatusKey, setServerStatusKey] = useState("status.checking");
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [latency, setLatency] = useState<number | null>(null);

  // 用于控制“重新开始一轮检测”
  const [checkToken, setCheckToken] = useState(0);

  // 记录尝试次数
  const attemptsRef = useRef(0);
  // 是否曾经成功连接过，用于区分“首次等待 10 秒”与“之后的健康检测”
  const hasConnectedOnceRef = useRef(false);

  // 渲染状态图标
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

  // 手动触发重新检测
  const handleManualCheck = () => {
    // 重置状态并触发新的轮询周期
    setStatus("loading");
    setServerStatusKey("status.checking");
    setLatency(null);
    attemptsRef.current = 0;
    hasConnectedOnceRef.current = false;
    setCheckToken((prev) => prev + 1);
  };

  // 自动轮询逻辑：初始 10 次，之后每 2 秒刷新延迟
  useEffect(() => {
    let isMounted = true;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    // 每次语言变化 / 手动刷新时，重新初始化
    attemptsRef.current = 0;
    hasConnectedOnceRef.current = false;
    setStatus("loading");
    setServerStatusKey("status.checking");
    setLatency(null);

    const url = "http://localhost:8000/status";

    const scheduleNext = (delay: number, phase: "initial" | "connected") => {
      if (!isMounted) return;
      pollTimer = setTimeout(() => {
        void checkServer(phase);
      }, delay);
    };

    const checkServer = async (phase: "initial" | "connected") => {
      if (!isMounted) return;

      // 在“初始阶段”显示 loading；“已连接阶段”保持当前状态（成功或错误）
      if (phase === "initial") {
        setStatus("loading");
        setServerStatusKey("status.checking");
        setLatency(null);
      }

      // 准备超时控制
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const timeoutId = window.setTimeout(
        () => controller?.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const start = performance.now();

      try {
        const response = await fetch(url, { signal });
        const end = performance.now();
        window.clearTimeout(timeoutId);
        if (!isMounted) return;

        if (response.ok) {
          const currentLatency = Math.round(end - start);
          hasConnectedOnceRef.current = true;

          setStatus("success");
          setServerStatusKey("status.backendRunning");
          setLatency(currentLatency);

          // 成功后进入“已连接阶段”：每 2s 刷新一次延迟
          scheduleNext(CONNECTED_POLL_INTERVAL_MS, "connected");
        } else {
          throw new Error("Non-OK response");
        }
      } catch {
        window.clearTimeout(timeoutId);
        if (!isMounted) return;

        if (!hasConnectedOnceRef.current) {
          // 还从未成功连接：属于“初始 10 次尝试”阶段
          attemptsRef.current += 1;

          if (attemptsRef.current >= MAX_ATTEMPTS) {
            // 超过最大尝试次数：标记为错误并停止自动尝试
            setStatus("error");
            setServerStatusKey("status.backendNotRunning");
            setLatency(null);
            return;
          }

          // 继续下一次初始尝试
          scheduleNext(INITIAL_RETRY_INTERVAL_MS, "initial");
        } else {
          // 曾经成功连通过：现在是健康检测失败，标记为错误，但 2s 后继续重试
          setStatus("error");
          setServerStatusKey("status.backendNotRunning");
          setLatency(null);
          scheduleNext(CONNECTED_POLL_INTERVAL_MS, "connected");
        }
      }
    };

    // 启动第一次“初始阶段”的检测
    scheduleNext(0, "initial");

    return () => {
      isMounted = false;
      if (pollTimer) clearTimeout(pollTimer);
      controller?.abort();
    };
  }, [i18n.language, checkToken]);

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
            <span className="text-muted-foreground">
              {t("homePage.responseTime")}
            </span>
            <span className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
              {status === "success" && latency != null ? `${latency} ms` : "--"}
            </span>
          </div>

          {/* 地址行 */}
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("homePage.endpoint")}
            </span>
            <code className="bg-muted max-w-[65%] rounded px-1.5 py-0.5 text-right text-[11px] break-words">
              http://localhost:8000/status
            </code>
          </div>

          {/* 检查按钮：重启一轮 10 次尝试 */}
          <Button
            onClick={handleManualCheck}
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
