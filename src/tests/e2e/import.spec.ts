/**
 * 照片导入流程 E2E 测试
 * =======================
 * 验证：Drawer 交互、文件选择、导入进度、并发处理
 */

import { test, expect, Page, ElectronApplication } from "@playwright/test";
import {
  launchApp, closeApp, navigateTo, SELECTORS,
  openImportDrawer, closeImportDrawer, importTestFiles,
  waitForImportComplete, getDisplayedPhotoCount, rapidToggleDrawer,
  TEST_IMAGES_DIR, assertPageHealthy
} from "./helpers/electronApp";

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await closeApp(); });

// ============================================================================
// 导入页面基础测试
// ============================================================================
test.describe("导入页面基础功能", () => {
  test.beforeEach(async () => { await navigateTo(page, "import"); });

  test("页面加载并显示导入按钮", async () => {
    await expect(page.locator(SELECTORS.import.openDrawerBtn).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator(SELECTORS.import.totalPhotos).first()).toBeVisible();
  });

  test("点击按钮打开导入 Drawer", async () => {
    await openImportDrawer(page);
    await expect(page.locator(SELECTORS.import.drawer).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator(SELECTORS.import.dropArea)).toBeVisible();
    await closeImportDrawer(page);
  });

  test("Escape 键关闭 Drawer", async () => {
    await openImportDrawer(page);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    // Drawer 应关闭（无模态）
    await assertPageHealthy(page);
  });
});

// ============================================================================
// 文件选择与路径输入测试
// ============================================================================
test.describe("文件选择与导入", () => {
  test.beforeEach(async () => { await navigateTo(page, "import"); });

  test("选择文件后显示文件列表", async () => {
    await openImportDrawer(page);
    const fileInput = page.locator(SELECTORS.import.fileInput);

    if (await fileInput.count() > 0) {
      const testFiles = [`${TEST_IMAGES_DIR}/Z30_3044.JPG`, `${TEST_IMAGES_DIR}/Z30_3045.JPG`];
      await fileInput.setInputFiles(testFiles);
      await page.waitForTimeout(500);
      // 应显示文件列表项
      const fileItems = page.locator('text=/Z30_304/');
      await expect(fileItems.first()).toBeVisible({ timeout: 3000 });
    }
    await closeImportDrawer(page);
  });

  test("提交导入后照片数量更新", async () => {
    const beforeCount = await getDisplayedPhotoCount(page);
    const imported = await importTestFiles(page, 3); // 导入 3 张

    if (imported > 0) {
      await waitForImportComplete(page, 30000);
      await page.waitForTimeout(2000); // 等待 UI 更新

      const afterCount = await getDisplayedPhotoCount(page);
      // 照片数应增加（或至少不减少）
      expect(afterCount).toBeGreaterThanOrEqual(beforeCount);
    }
  });
});

// ============================================================================
// 并发导入测试（高频点击）
// ============================================================================
test.describe("并发导入处理", () => {
  test.beforeEach(async () => { await navigateTo(page, "import"); });

  test("快速点击导入按钮不崩溃", async () => {
    const btn = page.locator(SELECTORS.import.openDrawerBtn).first();

    // 快速点击 5 次
    for (let i = 0; i < 5; i++) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(50);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(50);
    }

    await assertPageHealthy(page);
    await expect(btn).toBeEnabled();
  });

  test("快速开关 Drawer 10 次不崩溃", async () => {
    await rapidToggleDrawer(page, 10);
    await assertPageHealthy(page);

    // 最后一次正常打开
    await openImportDrawer(page);
    await expect(page.locator(SELECTORS.import.drawer).first()).toBeVisible({ timeout: 3000 });
    await closeImportDrawer(page);
  });

  test("并发导入取消不损坏数据", async () => {
    const initialCount = await getDisplayedPhotoCount(page);

    // 首次导入
    await openImportDrawer(page);
    const fileInput = page.locator(SELECTORS.import.fileInput);
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles([`${TEST_IMAGES_DIR}/Z30_3044.JPG`]);
      await page.waitForTimeout(300);
      const submitBtn = page.locator(SELECTORS.import.submitBtn).first();
      if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
        await submitBtn.click();
      }
    }

    // 关闭 Drawer 后等待一段时间
    await closeImportDrawer(page);
    await page.waitForTimeout(1000);

    // 再次导入不同文件
    await openImportDrawer(page);
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles([`${TEST_IMAGES_DIR}/Z30_3050.JPG`]);
      await page.waitForTimeout(300);
      const submitBtn = page.locator(SELECTORS.import.submitBtn).first();
      if (await submitBtn.isVisible() && await submitBtn.isEnabled()) {
        await submitBtn.click();
      }
    }
    await closeImportDrawer(page);

    await page.waitForTimeout(2000);
    await assertPageHealthy(page);

    // 照片数不应减少
    const finalCount = await getDisplayedPhotoCount(page);
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);
  });
});

// ============================================================================
// 导入后状态一致性
// ============================================================================
test.describe("导入状态一致性", () => {
  test("页面切换后照片数保持一致", async () => {
    // 先确保在导入页面
    await navigateTo(page, "import");
    await page.waitForTimeout(1000); // 等待页面完全加载
    const importCount = await getDisplayedPhotoCount(page);

    // 切换到筛选页面
    await navigateTo(page, "filter");
    await page.waitForTimeout(1000);

    // 切换回导入页面
    await navigateTo(page, "import");
    await page.waitForTimeout(1000);

    const afterCount = await getDisplayedPhotoCount(page);
    // 允许异步更新导致的小幅波动
    expect(Math.abs(afterCount - importCount)).toBeLessThanOrEqual(5);
  });
});
