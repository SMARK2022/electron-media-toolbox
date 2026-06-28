/**
 * ImportProgressToast 行为级单元测试
 * ==================================
 * 验证三个不变量：
 * 1. i18n 完整性——运行态/完成态文案走 t()，不残留硬编码中文
 * 2. a11y live region——header 区域带 role="status"，读屏器可感知状态变化
 * 3. dismiss 按钮可访问名——完成态关闭按钮有 aria-label
 *
 * 若回退 i18n 或移除 a11y 属性，对应断言将失败。
 */
import { vi } from "vitest";

// 导入 i18n 以初始化 react-i18next（i18n.ts 底部执行 initReactI18next.init）
import "@/localization/i18n";

// ============================================================================
// Mock PhotoService：可控注入运行态/完成态，避免真实 IPC 调用
// ============================================================================
// vi.mock 工厂在文件顶部提升执行，引用的变量必须以 mock 前缀命名
const mockImportState = {
  isRunning: false,
  isComplete: false,
  totalFiles: 0,
  processedFiles: 0,
  thumbnailProgress: 0,
  exifProgress: 0,
};

vi.mock("@/helpers/services/PhotoService", () => ({
  PhotoService: {
    // subscribeImportTask 立即同步回调当前 mock 状态（与真实实现一致）
    subscribeImportTask: vi.fn(
      (listener: (s: typeof mockImportState) => void) => {
        listener({ ...mockImportState });
        return () => {};
      },
    ),
    dismissImportToast: vi.fn(),
    cancelImportTask: vi.fn(),
  },
}));

import { render, screen } from "@testing-library/react";
import { act } from "react";
import i18n from "@/localization/i18n";
import { PhotoService } from "@/helpers/services/PhotoService";
import ImportProgressToast from "@/components/ImportProgressToast";

// mock 后的 subscribeImportTask 引用——injectState 中复用它重新注入状态
const mockedSubscribe = vi.mocked(PhotoService.subscribeImportTask);

/** 切换 i18n 语言并等待 React 重渲染 */
async function setLang(lang: "en" | "zh") {
  await act(async () => {
    await i18n.changeLanguage(lang);
  });
}

/** 重新渲染组件并注入新的 mock 状态 */
async function injectState(state: typeof mockImportState) {
  Object.assign(mockImportState, state);
  // 重新让 subscribeImportTask 回调新状态——通过重渲染组件触发订阅
  await act(async () => {
    mockedSubscribe.mockImplementation(
      (listener: (s: typeof mockImportState) => void) => {
        listener({ ...mockImportState });
        return () => {};
      },
    );
    render(<ImportProgressToast />);
  });
}

describe("ImportProgressToast i18n", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockImportState, {
      isRunning: false,
      isComplete: false,
      totalFiles: 0,
      processedFiles: 0,
      thumbnailProgress: 0,
      exifProgress: 0,
    });
  });

  test("运行态显示 i18n 文案而非硬编码中文（英文环境）", async () => {
    await setLang("en");
    await injectState({
      isRunning: true,
      isComplete: false,
      totalFiles: 10,
      processedFiles: 3,
      thumbnailProgress: 30,
      exifProgress: 20,
    });

    // 英文环境下不应出现硬编码中文"正在导入照片..."
    expect(screen.queryByText("正在导入照片...")).not.toBeInTheDocument();
    // 应显示英文 i18n 文案
    expect(screen.getByText(/Importing photos/i)).toBeInTheDocument();
  });

  test("完成态显示 i18n 文案而非硬编码中文（英文环境）", async () => {
    await setLang("en");
    await injectState({
      isRunning: false,
      isComplete: true,
      totalFiles: 5,
      processedFiles: 5,
      thumbnailProgress: 100,
      exifProgress: 100,
    });

    // 不应出现硬编码中文"导入完成"
    expect(screen.queryByText("导入完成")).not.toBeInTheDocument();
    expect(screen.getByText(/Import Complete/i)).toBeInTheDocument();
  });

  test("中文环境显示中文 i18n 文案", async () => {
    await setLang("zh");
    await injectState({
      isRunning: true,
      isComplete: false,
      totalFiles: 8,
      processedFiles: 2,
      thumbnailProgress: 25,
      exifProgress: 15,
    });

    expect(screen.getByText("正在导入照片...")).toBeInTheDocument();
  });

  test("终止按钮使用 i18n 文案（英文环境）", async () => {
    await setLang("en");
    await injectState({
      isRunning: true,
      isComplete: false,
      totalFiles: 3,
      processedFiles: 1,
      thumbnailProgress: 33,
      exifProgress: 10,
    });

    // 不应出现硬编码中文"终止导入"
    expect(screen.queryByText("终止导入")).not.toBeInTheDocument();
    expect(screen.getByText(/Cancel Import/i)).toBeInTheDocument();
  });
});

describe("ImportProgressToast a11y", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockImportState, {
      isRunning: false,
      isComplete: false,
      totalFiles: 0,
      processedFiles: 0,
      thumbnailProgress: 0,
      exifProgress: 0,
    });
  });

  test("运行态 header 区域带 role=status 供读屏器感知", async () => {
    await setLang("en");
    await injectState({
      isRunning: true,
      isComplete: false,
      totalFiles: 5,
      processedFiles: 1,
      thumbnailProgress: 20,
      exifProgress: 10,
    });

    const statusRegion = screen.getByRole("status");
    expect(statusRegion).toBeInTheDocument();
  });

  test("完成态关闭按钮有非空 aria-label", async () => {
    await setLang("en");
    await injectState({
      isRunning: false,
      isComplete: true,
      totalFiles: 3,
      processedFiles: 3,
      thumbnailProgress: 100,
      exifProgress: 100,
    });

    // 完成态才渲染 dismiss 按钮
    const dismissBtn = screen.getByRole("button");
    expect(dismissBtn.getAttribute("aria-label")).toBeTruthy();
  });
});
