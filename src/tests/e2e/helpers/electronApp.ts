/**
 * Electron E2E 测试辅助工具
 * =========================
 * 封装应用启动、选择器、等待逻辑，支持中英文 UI
 * - 单例应用管理，避免重复启动
 * - 精确的中文/英文双语选择器
 * - 超时和重试机制
 */

import { _electron as electron, ElectronApplication, Page, expect } from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";

// ============================================================================
// 测试常量
// ============================================================================
export const TEST_IMAGES_DIR = "F:/ML/PythonAIProject/SMARKMediaTools_web/electron-media-toolbox/dev/imgs_to test"; // 测试图片目录
// 实际存在的测试图片文件名列表（非连续编号）
export const TEST_IMAGE_FILES = [
  "Z30_3044.JPG", "Z30_3045.JPG", "Z30_3046.JPG", "Z30_3047.JPG", "Z30_3049.JPG",
  "Z30_3050.JPG", "Z30_3051.JPG", "Z30_3052.JPG", "Z30_3053.JPG", "Z30_3054.JPG",
  "Z30_3055.JPG", "Z30_3056.JPG", "Z30_3057.JPG", "Z30_3058.JPG", "Z30_3059.JPG",
  "Z30_3060.JPG", "Z30_3061.JPG", "Z30_3062.JPG", "Z30_3065.JPG", "Z30_3067.JPG",
];
export const TEST_IMAGE_COUNT = TEST_IMAGE_FILES.length; // 测试图片总数
export const EXPORT_TEST_DIR = "F:/ML/PythonAIProject/SMARKMediaTools_web/electron-media-toolbox/dev/test_export"; // 导出目录
export const SERVER_URL = "http://localhost:8000"; // 后端地址
export const WAIT_TIMEOUT = 30000; // 默认等待超时
export const LONG_TIMEOUT = 60000; // 长操作超时

// ============================================================================
// 双语选择器 - 支持中文(默认)和英文 UI
// 导航使用 tanstack router Link 组件，会渲染为 <a> 标签
// ============================================================================
export const SELECTORS = {
  // 导航栏 - 使用精确文本匹配
  nav: {
    import: 'a:has-text("导入"), a:has-text("Import")',
    filter: 'a:has-text("筛选"), a:has-text("Filter")',
    export: 'a:has-text("导出"), a:has-text("Export")',
  },
  // 导入页面
  import: {
    openDrawerBtn: 'button:has-text("导入照片"), button:has-text("Import Photos")',
    dropArea: '#drop-area',
    fileInput: 'input[type="file"]',
    folderInput: 'input[placeholder*="文件夹路径"], input[placeholder*="folder path"]',
    submitBtn: 'button:has-text("开始导入"), button:has-text("Import"):not(:has-text("照片")):not(:has-text("Photos"))',
    resetBtn: 'button:has-text("重置"), button:has-text("Reset")',
    totalPhotos: 'text=/总张数|Total Photos/',
    drawer: '[role="dialog"], [data-state="open"]',
  },
  // 筛选页面
  filter: {
    submitBtn: 'button:has-text("提交任务"), button:has-text("Submit Task")',
    serverStatusBtn: 'text=/服务状态|Server/',
    showDisabledSwitch: '#disabled-display',
    similaritySlider: '[role="slider"]',
    groupModeTab: 'button:has-text("分组模式"), button:has-text("Group Mode")',
    totalModeTab: 'button:has-text("整体模式"), button:has-text("Total Mode")',
  },
  // 导出页面 - 使用 i18n 中精确的占位符文本
  export: {
    exportBtn: 'button:has-text("导出照片"), button:has-text("Export Photos")',
    pathInput: 'input[placeholder*="请输入导出文件夹路径"], input[placeholder*="Enter export folder path"]',
    folderExists: 'text=/文件夹存在|Folder exists/',
    folderNotExists: 'text=/文件夹不存在|does not exist/',
    folderToCheck: 'text=/待检查|To check/',
    exportDialog: '[role="alertdialog"]',
    closeDialogBtn: 'button:has-text("关闭"), button:has-text("Close")',
  },
} as const;

// ============================================================================
// 应用管理器 - 单例模式
// ============================================================================
let appInstance: ElectronApplication | null = null;
let pageInstance: Page | null = null;

/** 启动 Electron 应用（单例，重复调用返回已存在的实例） */
export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  if (appInstance && pageInstance) {
    try {
      await pageInstance.evaluate(() => true); // 检查页面是否有效
      return { app: appInstance, page: pageInstance };
    } catch {
      appInstance = null; pageInstance = null; // 页面已关闭，重新启动
    }
  }

  const latestBuild = findLatestBuild();
  const appInfo = parseElectronApp(latestBuild);
  process.env.CI = "e2e";

  appInstance = await electron.launch({
    args: [appInfo.main],
    timeout: 60000,
    env: { ...process.env, E2E_TEST: "true" },
  });

  appInstance.on("window", async (page) => {
    const url = page.url();
    if (!url.includes("devtools")) console.log(`[E2E] Window: ${url.split("/").pop()}`);
    page.on("pageerror", (err) => console.error("[E2E] Error:", err.message));
  });

  // 等待并获取主窗口（非 DevTools 窗口）
  const windows = appInstance.windows();
  for (const win of windows) {
    const url = win.url();
    if (!url.includes("devtools://")) {
      pageInstance = win;
      break;
    }
  }

  // 如果还没有找到主窗口，等待新窗口
  if (!pageInstance) {
    pageInstance = await appInstance.waitForEvent("window", {
      predicate: (page) => !page.url().includes("devtools://"),
      timeout: 30000,
    });
  }

  await pageInstance.waitForLoadState("domcontentloaded");
  await pageInstance.waitForTimeout(2000); // 等待应用初始化
  return { app: appInstance, page: pageInstance };
}

/** 关闭 Electron 应用 */
export async function closeApp(): Promise<void> {
  if (appInstance) { await appInstance.close(); appInstance = null; pageInstance = null; }
}

/** 获取当前页面实例 */
export function getPage(): Page | null { return pageInstance; }

// ============================================================================
// 导航辅助
// ============================================================================
/** 确保关闭所有打开的 Drawer/Dialog/Overlay */
export async function ensureOverlayClosed(page: Page): Promise<void> {
  // 尝试多次关闭可能存在的 overlay
  for (let attempt = 0; attempt < 5; attempt++) {
    const overlay = page.locator('[data-vaul-overlay=""], [role="dialog"], [data-state="open"][aria-hidden="true"]');
    const isOverlayVisible = await overlay.first().isVisible().catch(() => false);

    if (!isOverlayVisible) break;

    // 按 Escape 键关闭
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 如果还没关闭，尝试点击 overlay 外部
    const stillVisible = await overlay.first().isVisible().catch(() => false);
    if (stillVisible) {
      // 点击页面角落
      await page.mouse.click(10, 10);
      await page.waitForTimeout(200);
    }
  }

  // 最终等待一下确保动画完成
  await page.waitForTimeout(100);
}

/** 导航到指定页面 */
export async function navigateTo(page: Page, route: "import" | "filter" | "export"): Promise<void> {
  await ensureOverlayClosed(page);
  await page.locator(SELECTORS.nav[route]).first().click();
  await page.waitForTimeout(500);
}

// ============================================================================
// 照片网格辅助
// ============================================================================
/** 获取页面上显示的照片数量 */
export async function getDisplayedPhotoCount(page: Page): Promise<number> {
  const locator = page.locator(SELECTORS.import.totalPhotos).first();
  if (await locator.isVisible().catch(() => false)) {
    const text = await locator.textContent();
    const match = text?.match(/\d+/);
    if (match) return parseInt(match[0], 10);
  }
  return 0;
}

/** 等待照片网格中出现指定数量的照片 */
export async function waitForPhotosInGrid(page: Page, minCount: number, timeout = WAIT_TIMEOUT): Promise<number> {
  const startTime = Date.now();
  let count = 0;
  while (Date.now() - startTime < timeout) {
    count = await getDisplayedPhotoCount(page);
    if (count >= minCount) return count;
    await page.waitForTimeout(500);
  }
  console.log(`[E2E] Timeout: expected ${minCount} photos, got ${count}`);
  return count;
}

// ============================================================================
// 导入流程辅助
// ============================================================================
/** 打开导入 Drawer */
export async function openImportDrawer(page: Page): Promise<void> {
  await ensureOverlayClosed(page);
  await page.locator(SELECTORS.import.openDrawerBtn).first().click();
  await page.waitForTimeout(300);
}

/** 关闭导入 Drawer */
export async function closeImportDrawer(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
}

/** 选择测试文件并提交导入 */
export async function importTestFiles(page: Page, fileCount = 5): Promise<number> {
  await openImportDrawer(page);
  const fileInput = page.locator(SELECTORS.import.fileInput);
  if (await fileInput.count() === 0) { await closeImportDrawer(page); return 0; }

  // 使用实际存在的文件
  const filesToUse = TEST_IMAGE_FILES.slice(0, Math.min(fileCount, TEST_IMAGE_FILES.length));
  const files = filesToUse.map(name => `${TEST_IMAGES_DIR}/${name}`);
  await fileInput.setInputFiles(files);
  await page.waitForTimeout(500);

  const submitBtn = page.locator(SELECTORS.import.submitBtn).first();
  if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
    await submitBtn.click();
    await page.waitForTimeout(1000);
  }
  return files.length;
}

/** 等待导入完成 */
export async function waitForImportComplete(page: Page, timeout = LONG_TIMEOUT): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const toast = page.locator('[class*="ImportProgressToast"]');
    if (!(await toast.isVisible().catch(() => false))) return;
    const text = await toast.textContent().catch(() => "");
    if (text?.includes("100%") || text?.includes("完成")) { await page.waitForTimeout(500); return; }
    await page.waitForTimeout(500);
  }
  console.log("[E2E] Import timeout, continuing...");
}

// ============================================================================
// 筛选页面辅助
// ============================================================================
/** 提交检测任务 */
export async function submitDetectionTask(page: Page): Promise<void> {
  await page.locator(SELECTORS.filter.submitBtn).first().click();
  await page.waitForTimeout(500);
}

/** 等待任务完成 */
export async function waitForTaskIdle(page: Page, timeout = LONG_TIMEOUT): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const text = await page.locator(SELECTORS.filter.serverStatusBtn).first().textContent().catch(() => "");
    if (text?.includes("空闲") || text?.includes("idle")) return;
    await page.waitForTimeout(1000);
  }
  console.log("[E2E] Task idle timeout, continuing...");
}

/** 切换显示弃用照片开关 */
export async function toggleShowDisabled(page: Page): Promise<boolean> {
  const sw = page.locator(SELECTORS.filter.showDisabledSwitch).first();
  const initial = await sw.isChecked().catch(() => false);
  await sw.click();
  await page.waitForTimeout(300);
  return !initial;
}

// ============================================================================
// 导出页面辅助
// ============================================================================
/** 设置导出路径 */
export async function setExportPath(page: Page, path: string): Promise<void> {
  await page.locator(SELECTORS.export.pathInput).first().fill(path);
  await page.waitForTimeout(500);
}

/** 获取导出路径验证状态 */
export async function getExportPathStatus(page: Page): Promise<"exists" | "notExists" | "toCheck" | "unknown"> {
  if (await page.locator(SELECTORS.export.folderExists).isVisible().catch(() => false)) return "exists";
  if (await page.locator(SELECTORS.export.folderNotExists).isVisible().catch(() => false)) return "notExists";
  if (await page.locator(SELECTORS.export.folderToCheck).isVisible().catch(() => false)) return "toCheck";
  return "unknown";
}

/** 执行导出 */
export async function executeExport(page: Page): Promise<boolean> {
  const btn = page.locator(SELECTORS.export.exportBtn).first();
  if (!(await btn.isEnabled())) return false;
  await btn.click();
  await page.waitForTimeout(500);
  return await page.locator(SELECTORS.export.exportDialog).isVisible().catch(() => false);
}

/** 关闭导出对话框 */
export async function closeExportDialog(page: Page): Promise<void> {
  const btn = page.locator(SELECTORS.export.closeDialogBtn).first();
  if (await btn.isVisible().catch(() => false)) { await btn.click(); await page.waitForTimeout(300); }
}

// ============================================================================
// 并发测试辅助
// ============================================================================
/** 快速点击元素多次 */
export async function rapidClick(page: Page, selector: string, times: number, interval = 50): Promise<void> {
  const locator = page.locator(selector).first();
  for (let i = 0; i < times; i++) {
    await locator.click().catch(() => {});
    await page.waitForTimeout(interval);
  }
}

/** 快速开关 Drawer */
export async function rapidToggleDrawer(page: Page, times: number): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.locator(SELECTORS.import.openDrawerBtn).first().click().catch(() => {});
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
}

// ============================================================================
// 断言辅助
// ============================================================================
/** 断言页面正常 */
export async function assertPageHealthy(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
}

/** 断言照片数量在范围内 */
export async function assertPhotoCountInRange(page: Page, min: number, max: number): Promise<void> {
  const count = await getDisplayedPhotoCount(page);
  expect(count).toBeGreaterThanOrEqual(min);
  expect(count).toBeLessThanOrEqual(max);
}
