import {
  closeWindow,
  maximizeWindow,
  minimizeWindow,
} from "@/helpers/window_helpers";
import { type ReactNode } from "react";
import { useTranslation } from "react-i18next";

interface DragWindowRegionProps {
  title?: ReactNode;
}

export default function DragWindowRegion({ title }: DragWindowRegionProps) {
  const isMac = window.ElectronAPI?.platform === "darwin";

  return (
    <div className="flex w-screen items-stretch justify-between">
      <div className={`draglayer w-full ${isMac ? "pl-[78px]" : ""}`}>
        {title && (
          <div className="flex flex-1 p-2 text-xs whitespace-nowrap text-gray-400 select-none">
            {title}
          </div>
        )}
      </div>
      {!isMac && <WindowButtons />}
    </div>
  );
}

function WindowButtons() {
  // t 在此组件内调用——DragWindowRegion 不直接使用 t，避免跨组件作用域引用
  const { t } = useTranslation();
  return (
    <div className="flex">
      <button
        title={t("windowControls.minimize")}
        type="button"
        // dark:hover 补全：原仅 hover:bg-slate-300，暗色模式下 hover 态不可见
        className="p-2 hover:bg-slate-300 dark:hover:bg-slate-600"
        onClick={minimizeWindow}
        aria-label={t("windowControls.minimize")}
      >
        <svg
          aria-hidden="true"
          role="presentation"
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <rect fill="currentColor" width="10" height="1" x="1" y="6"></rect>
        </svg>
      </button>
      <button
        title={t("windowControls.maximize")}
        type="button"
        className="p-2 hover:bg-slate-300 dark:hover:bg-slate-600"
        onClick={maximizeWindow}
        aria-label={t("windowControls.maximize")}
      >
        <svg
          aria-hidden="true"
          role="presentation"
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <rect
            width="9"
            height="9"
            x="1.5"
            y="1.5"
            fill="none"
            stroke="currentColor"
          ></rect>
        </svg>
      </button>
      <button
        type="button"
        title={t("windowControls.close")}
        className="p-2 hover:bg-red-300 dark:hover:bg-red-700/50"
        onClick={closeWindow}
        aria-label={t("windowControls.close")}
      >
        <svg
          aria-hidden="true"
          role="presentation"
          width="12"
          height="12"
          viewBox="0 0 12 12"
        >
          <polygon
            fill="currentColor"
            fillRule="evenodd"
            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
          ></polygon>
        </svg>
      </button>
    </div>
  );
}
