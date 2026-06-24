/**
 * Electron E2E 测试辅助工具
 * =========================
 * 封装应用启动、选择器、等待逻辑，支持中英文 UI
 * - 单例应用管理，避免重复启动
 * - 精确的中文/英文双语选择器
 * - 超时和重试机制
 */

import fs from "node:fs";
import path from "path";
import {
  _electron as electron,
  ElectronApplication,
  Page,
  expect,
} from "@playwright/test";
import { findLatestBuild, parseElectronApp } from "electron-playwright-helpers";

// ============================================================================
// 测试常量
// ============================================================================
// 仓库根目录：src/tests/e2e/helpers → 上 4 层到仓库根
// 本地默认指向 dev/，CI 通过环境变量 E2E_TEST_IMAGES_DIR / E2E_EXPORT_DIR 覆盖
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
export const TEST_IMAGES_DIR = process.env.E2E_TEST_IMAGES_DIR
  ? path.resolve(process.env.E2E_TEST_IMAGES_DIR)
  : path.join(REPO_ROOT, "dev", "imgs_to test"); // 测试图片目录
// 动态扫描测试图片目录——CI fixture 文件名不固定，不能硬编码
// 目录不存在或为空时返回空数组，依赖图片的测试通过 TEST_IMAGE_COUNT === 0 守卫降级
const _scannedFiles = (() => {
  try {
    return fs
      .readdirSync(TEST_IMAGES_DIR)
      .filter((f) => /\.(jpe?g|png|webp|bmp|tiff?)$/i.test(f))
      .sort();
  } catch {
    // 目录不存在时返回空数组，避免 readdirSync 抛异常阻断测试
    return [] as string[];
  }
})();
export const TEST_IMAGE_FILES = _scannedFiles;
export const TEST_IMAGE_COUNT = TEST_IMAGE_FILES.length; // 测试图片总数
export const EXPORT_TEST_DIR = process.env.E2E_EXPORT_DIR
  ? path.resolve(process.env.E2E_EXPORT_DIR)
  : path.join(REPO_ROOT, "dev", "test_export"); // 导出目录
export const SERVER_URL = "http://localhost:8000"; // 后端地址
export const WAIT_TIMEOUT = 30000; // 默认等待超时
export const LONG_TIMEOUT = 60000; // 长操作超时

/**
 * 轮询后端 /status 直到就绪。
 * 必须在 Node 端 fetch（非 page.evaluate），因为后端 CORS 仅允许 localhost:5173，
 * 渲染进程发起的请求会被拦截。超时则 throw——fast-fail 比让所有依赖后端的测试空转更高效。
 */
export async function waitForBackend(timeout = 30000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const resp = await fetch(`${SERVER_URL}/status`, {
        signal: AbortSignal.timeout(2000),
      });
      if (resp.ok) return; // 后端已就绪
    } catch {
      // 后端尚未就绪（Nuitka onefile 解压需数秒），继续轮询
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Backend at ${SERVER_URL} not ready after ${timeout}ms`);
}

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
    openDrawerBtn:
      'button:has-text("导入照片"), button:has-text("Import Photos")',
    dropArea: "#drop-area",
    fileInput: 'input[type="file"]',
    folderInput:
      'input[placeholder*="文件夹路径"], input[placeholder*="folder path"]',
    submitBtn:
      'button:has-text("开始导入"), button:has-text("Import"):not(:has-text("照片")):not(:has-text("Photos"))',
    resetBtn: 'button:has-text("重置"), button:has-text("Reset")',
    totalPhotos: "text=/总张数|Total Photos/",
    drawer: '[role="dialog"], [data-state="open"]',
  },
  // 筛选页面
  filter: {
    submitBtn: 'button:has-text("提交任务"), button:has-text("Submit Task")',
    serverStatusBtn: "text=/服务状态|Server/",
    showDisabledSwitch: "#disabled-display",
    similaritySlider: '[role="slider"]',
    groupModeTab: 'button:has-text("分组模式"), button:has-text("Group Mode")',
    totalModeTab: 'button:has-text("整体模式"), button:has-text("Total Mode")',
  },
  // 导出页面 - 使用 i18n 中精确的占位符文本
  export: {
    exportBtn: 'button:has-text("导出照片"), button:has-text("Export Photos")',
    pathInput:
      'input[placeholder*="请输入导出文件夹路径"], input[placeholder*="Enter export folder path"]',
    folderExists: "text=/文件夹存在|Folder exists/",
    folderNotExists: "text=/文件夹不存在|does not exist/",
    folderToCheck: "text=/待检查|To check/",
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
export async function launchApp(): Promise<{
  app: ElectronApplication;
  page: Page;
}> {
  if (appInstance && pageInstance) {
    try {
      await pageInstance.evaluate(() => true); // 检查页面是否有效
      return { app: appInstance, page: pageInstance };
    } catch {
      appInstance = null;
      pageInstance = null; // 页面已关闭，重新启动
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
    if (!url.includes("devtools"))
      console.log(`[E2E] Window: ${url.split("/").pop()}`);
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
  // 等待 Python 后端就绪；未就绪时 fast-fail 避免后续测试空转超时
  await waitForBackend(30000);
  return { app: appInstance, page: pageInstance };
}

/** 关闭 Electron 应用 */
export async function closeApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = null;
    pageInstance = null;
  }
}

/** 获取当前页面实例 */
export function getPage(): Page | null {
  return pageInstance;
}

// ============================================================================
// 导航辅助
// ============================================================================
/** 确保关闭所有打开的 Drawer/Dialog/Overlay */
export async function ensureOverlayClosed(page: Page): Promise<void> {
  // 尝试多次关闭可能存在的 overlay
  for (let attempt = 0; attempt < 5; attempt++) {
    const overlay = page.locator(
      '[data-vaul-overlay=""], [role="dialog"], [data-state="open"][aria-hidden="true"]',
    );
    const isOverlayVisible = await overlay
      .first()
      .isVisible()
      .catch(() => false);

    if (!isOverlayVisible) break;

    // 按 Escape 键关闭
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // 如果还没关闭，尝试点击 overlay 外部
    const stillVisible = await overlay
      .first()
      .isVisible()
      .catch(() => false);
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
export async function navigateTo(
  page: Page,
  route: "import" | "filter" | "export",
): Promise<void> {
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
    // 选择器匹配 <span>总张数</span>，计数值在兄弟 <span> 中。
    // 读取 parentElement.textContent 以获取"总张数3"格式
    const text = await locator.evaluate(
      (el) => el.parentElement?.textContent ?? el.textContent ?? "",
    );
    const match = text?.match(/\d+/);
    if (match) return parseInt(match[0], 10);
  }
  return 0;
}

/** 等待照片网格中出现指定数量的照片 */
export async function waitForPhotosInGrid(
  page: Page,
  minCount: number,
  timeout = WAIT_TIMEOUT,
): Promise<number> {
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
export async function importTestFiles(
  page: Page,
  fileCount = 5,
): Promise<number> {
  await openImportDrawer(page);
  const fileInput = page.locator(SELECTORS.import.fileInput);
  if ((await fileInput.count()) === 0) {
    await closeImportDrawer(page);
    return 0;
  }

  // 使用实际存在的文件
  const filesToUse = TEST_IMAGE_FILES.slice(
    0,
    Math.min(fileCount, TEST_IMAGE_FILES.length),
  );
  // 无可用测试图片时优雅降级，不阻塞后续测试
  if (filesToUse.length === 0) {
    await closeImportDrawer(page);
    return 0;
  }
  const files = filesToUse.map((name) => `${TEST_IMAGES_DIR}/${name}`);
  // setInputFiles 对不存在的路径会抛异常，需 try/catch 降级
  try {
    await fileInput.setInputFiles(files);
  } catch {
    await closeImportDrawer(page);
    return 0;
  }
  await page.waitForTimeout(500);

  // Electron 39 中 setInputFiles 创建的 File 对象可能没有 path 属性，
  // tryGetFullPath 返回空 → showFolderInput 为 true → handleSubmit 需要文件夹路径。
  // 此时手动填入 TEST_IMAGES_DIR 让 handleSubmit 拼接出绝对路径。
  const folderInput = page.locator(SELECTORS.import.folderInput).first();
  if (await folderInput.isVisible().catch(() => false)) {
    await folderInput.fill(TEST_IMAGES_DIR);
    await page.waitForTimeout(300);
  }

  const submitBtn = page.locator(SELECTORS.import.submitBtn).first();
  if ((await submitBtn.isVisible()) && (await submitBtn.isEnabled())) {
    await submitBtn.click();
    await page.waitForTimeout(1000);
    // 仅在成功点击提交后返回正数，让调用方知道导入已触发；
    // 否则后续 waitForImportComplete 会以错误的 expectedMin 空等超时
    return files.length;
  }
  // submit 按钮不可用——导入未发生，返回 0 避免 caller 误判
  await closeImportDrawer(page);
  return 0;
}

/**
 * 等待导入完成：照片数量达到预期值后稳定。
 * 旧实现用 [class*="ImportProgressToast"] 选择器，但实际组件无此 class → 永不匹配 → 立即返回。
 * 改为确定性计数目标：先等数量 >= expectedMin，再 2s 稳定确认防异步抖动。
 * @param expectedMin 预期最小照片数（导入前数量 + 本次导入数）
 */
export async function waitForImportComplete(
  page: Page,
  expectedMin: number,
  timeout = LONG_TIMEOUT,
): Promise<void> {
  const startTime = Date.now();
  // 阶段 1：等照片数量达到预期值
  while (Date.now() - startTime < timeout) {
    const count = await getDisplayedPhotoCount(page);
    if (count >= expectedMin) break;
    await page.waitForTimeout(500);
  }
  // 阶段 2：2s 稳定性确认（防异步更新抖动导致误判）
  let stableStart = 0;
  let lastCount = -1;
  while (Date.now() - startTime < timeout) {
    const count = await getDisplayedPhotoCount(page);
    // 计数回落到 expectedMin 以下时重置稳定计时——防止 UI 因 clearPhotos
    // 先清空后填充的抖动导致阶段 1 break 后在低于 expectedMin 的值上稳定
    if (count < expectedMin) {
      stableStart = 0;
      lastCount = count;
      await page.waitForTimeout(500);
      continue;
    }
    if (count === lastCount) {
      if (stableStart === 0) stableStart = Date.now();
      // 连续 2s 数量不变视为导入完成
      if (Date.now() - stableStart >= 2000) return;
    } else {
      stableStart = 0; // 数量仍在变化，重置稳定计时
    }
    lastCount = count;
    await page.waitForTimeout(500);
  }
  // 超时说明导入未完成（后端未响应、文件路径无效或 submit 未触发），
  // 必须 fast-fail 避免后续测试基于空 DB 产生误判
  throw new Error(
    `Import did not complete after ${timeout}ms (expected >= ${expectedMin} photos)`,
  );
}

/**
 * 确保数据库中有测试照片。每次调用都重新导入——submitImportTask 内部
 * clearPhotos() 会先清空 DB 再写入，保证各 spec 起始状态确定，
 * 不依赖前序 spec 残留或 Playwright 字母序执行顺序。
 * 导入失败时直接 throw（fast-fail），避免后续筛选/导出测试空转。
 */
export async function ensurePhotosImported(
  page: Page,
  count = 5,
): Promise<void> {
  // 无测试图片时不 throw——保留 TEST_IMAGE_COUNT === 0 的优雅降级能力，
  // 让各 spec 中不依赖照片的测试（页面加载、按钮可见性等）仍能运行
  if (TEST_IMAGE_COUNT === 0) return;
  await navigateTo(page, "import");
  const imported = await importTestFiles(page, count);
  // importTestFiles 返回 0 说明 submit 未被点击（选择器未命中或文件不可读）
  if (imported === 0) {
    throw new Error(
      `ensurePhotosImported: 导入失败 (TEST_IMAGE_COUNT=${TEST_IMAGE_COUNT})`,
    );
  }
  // expectedMin = imported：clearPhotos 先清空 DB，导入后恰好有 imported 张
  await waitForImportComplete(page, imported);
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
export async function waitForTaskIdle(
  page: Page,
  timeout = LONG_TIMEOUT,
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const text = await page
      .locator(SELECTORS.filter.serverStatusBtn)
      .first()
      .textContent()
      .catch(() => "");
    if (text?.includes("空闲") || text?.includes("idle")) return;
    await page.waitForTimeout(1000);
  }
  // 检测任务超时未回到空闲态——后端可能卡死或 ONNX 推理异常缓慢，
  // fast-fail 让测试立即失败而非继续空转
  throw new Error(`Detection task did not become idle after ${timeout}ms`);
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
export async function getExportPathStatus(
  page: Page,
): Promise<"exists" | "notExists" | "toCheck" | "unknown"> {
  if (
    await page
      .locator(SELECTORS.export.folderExists)
      .isVisible()
      .catch(() => false)
  )
    return "exists";
  if (
    await page
      .locator(SELECTORS.export.folderNotExists)
      .isVisible()
      .catch(() => false)
  )
    return "notExists";
  if (
    await page
      .locator(SELECTORS.export.folderToCheck)
      .isVisible()
      .catch(() => false)
  )
    return "toCheck";
  return "unknown";
}

/** 执行导出 */
export async function executeExport(page: Page): Promise<boolean> {
  const btn = page.locator(SELECTORS.export.exportBtn).first();
  if (!(await btn.isEnabled())) return false;
  await btn.click();
  await page.waitForTimeout(500);
  return await page
    .locator(SELECTORS.export.exportDialog)
    .isVisible()
    .catch(() => false);
}

/** 关闭导出对话框 */
export async function closeExportDialog(page: Page): Promise<void> {
  const btn = page.locator(SELECTORS.export.closeDialogBtn).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(300);
  }
}

/**
 * 等待导出对话框显示"完成"文本。
 * PhotoExportPage 的 copyPhotos await 完成后才置 copyInProgress=false 并显示完成文案，
 * 因此对话框出现"完成"时文件已物理写入，无需额外等待文件系统。
 */
export async function waitForExportComplete(
  page: Page,
  timeout = LONG_TIMEOUT,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    const dialog = page.locator(SELECTORS.export.exportDialog);
    if (await dialog.isVisible().catch(() => false)) {
      const text = await dialog.textContent().catch(() => "");
      // 后端返回完成后对话框文案含"完成"/"Complete"
      if (text?.includes("完成") || text?.includes("Complete")) return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

// ============================================================================
// 照片卡片操作辅助
// ============================================================================
// PhotoCard 渲染为 div.group.relative[tabindex="0"]，依赖 Tailwind class 名（无 data-test）
// 禁用态额外有 opacity-40 grayscale class（PhotoGrid.tsx:446）
// 注意：react-virtual 虚拟化，仅 index 0 保证已渲染
export const PHOTO_CARD_SELECTOR = '.group.relative[tabindex="0"]';

/**
 * 双击第 N 张照片切换启用/禁用状态。
 * PhotoGrid.tsx:940 定义双击 → triggerClick(photo, "Change") → 切换 isEnabled。
 * @returns 切换后是否为禁用态（true=禁用，false=启用）
 */
export async function togglePhotoEnabled(
  page: Page,
  index = 0,
): Promise<boolean> {
  const card = page.locator(PHOTO_CARD_SELECTOR).nth(index);
  if (!(await card.isVisible().catch(() => false))) return false;
  await card.dblclick();
  await page.waitForTimeout(500); // 等状态更新 + 重渲染
  // 检查禁用态 class 是否出现
  const cls = (await card.getAttribute("class")) ?? "";
  return cls.includes("opacity-40");
}

// ============================================================================
// 并发测试辅助
// ============================================================================
/** 快速点击元素多次 */
export async function rapidClick(
  page: Page,
  selector: string,
  times: number,
  interval = 50,
): Promise<void> {
  const locator = page.locator(selector).first();
  for (let i = 0; i < times; i++) {
    await locator.click().catch(() => {});
    await page.waitForTimeout(interval);
  }
}

/** 快速开关 Drawer */
export async function rapidToggleDrawer(
  page: Page,
  times: number,
): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page
      .locator(SELECTORS.import.openDrawerBtn)
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(100);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
  }
}

// ============================================================================
// 断言辅助
// ============================================================================
/** 断言页面正常：body 可见 + 导航栏存在（排除白屏/崩溃态） */
export async function assertPageHealthy(page: Page): Promise<void> {
  await expect(page.locator("body")).toBeVisible();
  // 导航栏链接应始终可见——若不可见说明页面白屏或崩溃
  await expect(page.locator(SELECTORS.nav.import).first()).toBeVisible({
    timeout: 5000,
  });
}

/** 断言照片数量在范围内 */
export async function assertPhotoCountInRange(
  page: Page,
  min: number,
  max: number,
): Promise<void> {
  const count = await getDisplayedPhotoCount(page);
  expect(count).toBeGreaterThanOrEqual(min);
  expect(count).toBeLessThanOrEqual(max);
}
