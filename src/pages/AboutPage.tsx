// src/renderer/pages/AboutPage.tsx
import React from "react";
import {
  Github,
  Mail,
  User,
  ExternalLink,
  MessageCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useTranslation } from "react-i18next";

import avatar from "@/assets/images/avatar.jpg";
import { GithubVersionChecker } from "@/components/GithubVersionChecker";

// ---- 简单封装：在 Electron 中优先使用 ElectronAPI.openExternal，
// ---- 否则回退到浏览器的 window.open
const openExternal = (url: string) => {
  try {
    const anyWindow = window as any;
    if (
      anyWindow.ElectronAPI &&
      typeof anyWindow.ElectronAPI.openExternal === "function"
    ) {
      anyWindow.ElectronAPI.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
};

export default function AboutPage() {
  const { t } = useTranslation();

  const authorName = "SMARK";
  const email = "SMARK2019@outlook.com";

  // 更友好的 mailto：带上主题和默认内容前缀
  const mailtoHref = `mailto:${email}?subject=${encodeURIComponent(
    "SMARK Media Tools 反馈 / Feedback",
  )}&body=${encodeURIComponent(
    "您好，我在使用 SMARK Media Tools 时有以下问题或建议：\n\n（请在此处填写具体内容）\n",
  )}`;

  // 反馈链接（建议指向仓库 Issues，也可以改成你自己的链接）
  const feedbackUrl =
    "https://github.com/SMARK2022/electron-media-toolbox/issues";
  const githubProfileUrl = "https://github.com/SMARK";
  const baseProjectUrl = "https://github.com/LuanRoger/electron-shadcn";
  const adoptedProjectUrl = "https://github.com/nasimjamshidi/LAR-IQA";

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-slate-50/50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-50"
      style={{ marginTop: "-5vh" }}
    >
      <Card className="w-full max-w-4xl overflow-hidden shadow-xl">
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
          {/* 左侧：个人信息侧栏 */}
          <div className="flex flex-col items-center justify-center border-b bg-slate-50/80 p-8 md:border-b-0 md:border-r dark:bg-slate-900/50">
            {/* 头像 */}
            <div className="mb-6 h-24 w-24 overflow-hidden rounded-full border-4 border-white bg-white shadow-md dark:border-slate-800">
              <img
                src={avatar}
                alt="SMARK's Avatar"
                className="h-full w-full object-cover"
              />
            </div>

            {/* 名字 + 邮件 */}
            <div className="space-y-2 text-center">
              <h3 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
                {authorName}
              </h3>

              {/* 邮箱（点击 mailto） */}
              <button
                type="button"
                onClick={() => openExternal(mailtoHref)}
                className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800"
              >
                <Mail className="h-3.5 w-3.5" />
                <span>{email}</span>
              </button>
            </div>

            <Separator className="my-6 w-1/2" />

            {/* 标签信息 */}
            <div className="space-y-2 text-center text-xs text-slate-400">
              <p className="flex items-center justify-center gap-1">
                <User className="h-3 w-3" />
                <span>{t("labels.author")} · SMARK</span>
              </p>

              {/* 反馈入口：醒目按钮 */}
              <button
                type="button"
                onClick={() => openExternal(feedbackUrl)}
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm ring-1 ring-emerald-100 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-900"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span>{t("about.feedbackLink") || "提交反馈 / Feedback"}</span>
              </button>
            </div>
          </div>

          {/* 右侧：项目说明 + 链接 + 版本信息 */}
          <div className="flex flex-col bg-white dark:bg-slate-950">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl">
                    {t("about.pageTitle")}
                  </CardTitle>
                  <CardDescription className="text-base">
                    {t("about.toolboxDescription")}
                  </CardDescription>
                </div>

                {/* GitHub Profile 图标按钮 */}
                <button
                  type="button"
                  aria-label="Open GitHub profile"
                  onClick={() => openExternal(githubProfileUrl)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                >
                  <Github className="h-4 w-4" />
                </button>
              </div>
            </CardHeader>

            <CardContent className="flex flex-1 flex-col justify-between gap-6 pt-3">
              {/* 描述 + GitHub 链接 */}
              <div className="space-y-4">
                <p className="leading-relaxed text-sm text-slate-600 dark:text-slate-300">
                  {t("about.contactInfo")}
                </p>

                {/* GitHub 文本链接条 */}
                <div className="flex items-center gap-2 rounded-md border bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                  <Github className="h-4 w-4 text-slate-500" />
                  <span className="font-semibold">
                    {t("labels.author")} GitHub:
                  </span>
                  <button
                    type="button"
                    onClick={() => openExternal(githubProfileUrl)}
                    className="ml-auto inline-flex max-w-[220px] items-center gap-1 truncate text-blue-600 hover:underline dark:text-blue-400"
                  >
                    <span>github.com/SMARK</span>
                    <ExternalLink className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* 底部：致谢 + 版本信息 */}
              <div className="space-y-4">
                <Separator />

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* 致谢信息 */}
                  <div className="space-y-2 text-xs text-slate-500 dark:text-slate-400">
                    <div className="flex flex-wrap items-center gap-1">
                      <span>{t("about.basedOnProject")}:</span>
                      <button
                        type="button"
                        onClick={() => openExternal(baseProjectUrl)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <span>electron-shadcn</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1">
                      <span>{t("about.adoptedProject")}:</span>
                      <button
                        type="button"
                        onClick={() => openExternal(adoptedProjectUrl)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400"
                      >
                        <span>LAR-IQA</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>

                  {/* 版本检查器右侧对齐 */}
                  <div className="flex items-end justify-end">
                    <div className="w-full sm:w-auto">
                      <GithubVersionChecker className="w-full" />
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </div>
        </div>
      </Card>
    </div>
  );
}
