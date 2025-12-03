/**
 * 完整工作流程 E2E 测试
 * =======================
 * 验证：导入→筛选→导出流程、数据一致性、页面切换稳定性
 */

import { test, expect, Page, ElectronApplication } from "@playwright/test";
import {
  launchApp, closeApp, navigateTo, SELECTORS,
  importTestFiles, waitForImportComplete, submitDetectionTask, waitForTaskIdle,
  setExportPath, getDisplayedPhotoCount, assertPageHealthy,
  TEST_IMAGES_DIR, EXPORT_TEST_DIR
} from "./helpers/electronApp";

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => { ({ app, page } = await launchApp()); });
test.afterAll(async () => { await closeApp(); });

// ============================================================================
// 完整工作流程测试
// ============================================================================
test.describe("完整工作流程", () => {
  test("导入→筛选→导出完整流程", async () => {
    // Step 1: 导入照片
    await test.step("导入照片", async () => {
      await navigateTo(page, "import");
      await page.waitForTimeout(500);

      const beforeCount = await getDisplayedPhotoCount(page);
      const imported = await importTestFiles(page, 5);

      if (imported > 0) {
        await waitForImportComplete(page, 30000);
        await page.waitForTimeout(2000);

        const afterCount = await getDisplayedPhotoCount(page);
        console.log(`[Workflow] Import: ${beforeCount} → ${afterCount}`);
      }
    });

    // Step 2: 筛选照片
    await test.step("筛选照片", async () => {
      await navigateTo(page, "filter");
      await page.waitForTimeout(1000);

      // 提交检测任务
      await submitDetectionTask(page);
      await page.waitForTimeout(2000);

      // 等待任务完成
      await waitForTaskIdle(page, 30000);
      await page.waitForTimeout(1000);

      await assertPageHealthy(page);
    });

    // Step 3: 导出照片
    await test.step("导出照片", async () => {
      await navigateTo(page, "export");
      await page.waitForTimeout(1000);

      const count = await getDisplayedPhotoCount(page);
      console.log(`[Workflow] Export photo count: ${count}`);

      await setExportPath(page, EXPORT_TEST_DIR);
      await page.waitForTimeout(500);

      await assertPageHealthy(page);
    });
  });
});

// ============================================================================
// 数据一致性测试
// ============================================================================
test.describe("数据一致性", () => {
  test("各页面照片数保持一致性", async () => {
    const counts: Record<string, number> = {};

    // 导入页面
    await navigateTo(page, "import");
    await page.waitForTimeout(500);
    counts.import = await getDisplayedPhotoCount(page);

    // 筛选页面
    await navigateTo(page, "filter");
    await page.waitForTimeout(500);
    counts.filter = await getDisplayedPhotoCount(page);

    // 导出页面
    await navigateTo(page, "export");
    await page.waitForTimeout(500);
    counts.export = await getDisplayedPhotoCount(page);

    console.log(`[Consistency] Import=${counts.import}, Filter=${counts.filter}, Export=${counts.export}`);

    // 导出数 <= 导入数（仅导出启用照片）
    expect(counts.export).toBeLessThanOrEqual(counts.import);
  });

  test("启用/禁用状态跨页面同步", async () => {
    // 在筛选页面切换开关
    await navigateTo(page, "filter");
    await page.waitForTimeout(500);

    const sw = page.locator(SELECTORS.filter.showDisabledSwitch).first();
    if (await sw.isVisible()) {
      await sw.click();
      await page.waitForTimeout(500);
      await sw.click(); // 恢复
      await page.waitForTimeout(500);
    }

    // 导出页面应只显示启用照片
    await navigateTo(page, "export");
    await page.waitForTimeout(500);

    await assertPageHealthy(page);
  });
});

// ============================================================================
// 页面切换稳定性测试
// ============================================================================
test.describe("页面切换稳定性", () => {
  test("快速切换页面 15 次不崩溃", async () => {
    const pages: ("import" | "filter" | "export")[] = ["import", "filter", "export"];

    for (let i = 0; i < 15; i++) {
      await navigateTo(page, pages[i % 3]);
      await page.waitForTimeout(100);
    }

    await page.waitForTimeout(500);
    await assertPageHealthy(page);
  });

  test("快速切换不丢失数据", async () => {
    await navigateTo(page, "import");
    await page.waitForTimeout(500);
    const initialCount = await getDisplayedPhotoCount(page);

    // 快速切换
    for (let i = 0; i < 10; i++) {
      await navigateTo(page, i % 2 === 0 ? "filter" : "export");
      await page.waitForTimeout(50);
    }

    // 返回导入页面
    await navigateTo(page, "import");
    await page.waitForTimeout(500);
    const finalCount = await getDisplayedPhotoCount(page);

    // 数据应一致
    expect(finalCount).toBe(initialCount);
  });
});

// ============================================================================
// 并发操作稳定性测试
// ============================================================================
test.describe("并发操作稳定性", () => {
  test("混合操作不崩溃", async () => {
    const operations = [
      async () => { await navigateTo(page, "import"); },
      async () => { await navigateTo(page, "filter"); },
      async () => { await navigateTo(page, "export"); },
      async () => { await page.keyboard.press("Escape"); },
    ];

    for (let i = 0; i < 20; i++) {
      await operations[i % operations.length]();
      await page.waitForTimeout(100);
    }

    await assertPageHealthy(page);
  });

  test("快速开关对话框不崩溃", async () => {
    await navigateTo(page, "filter");
    await page.waitForTimeout(300);

    const serverBtn = page.locator(SELECTORS.filter.serverStatusBtn).first();

    for (let i = 0; i < 10; i++) {
      if (await serverBtn.isVisible()) {
        await serverBtn.click().catch(() => {});
        await page.waitForTimeout(50);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(50);
      }
    }

    await assertPageHealthy(page);
  });
});

// ============================================================================
// 错误恢复测试
// ============================================================================
test.describe("错误恢复", () => {
  test("后端不可用时不崩溃", async () => {
    await navigateTo(page, "filter");
    await page.waitForTimeout(500);

    // 提交任务（后端可能不可用）
    await submitDetectionTask(page);
    await page.waitForTimeout(2000);

    await assertPageHealthy(page);

    // 服务状态应显示
    await expect(page.locator(SELECTORS.filter.serverStatusBtn).first()).toBeVisible();
  });

  test("异常路径输入不崩溃", async () => {
    await navigateTo(page, "export");
    await page.waitForTimeout(300);

    const input = page.locator(SELECTORS.export.pathInput).first();

    const invalidPaths = ["", "   ", "//invalid//path", "Z::\\Invalid\\Path"];

    for (const path of invalidPaths) {
      await input.fill(path);
      await page.waitForTimeout(200);
      await assertPageHealthy(page);
    }
  });
});
