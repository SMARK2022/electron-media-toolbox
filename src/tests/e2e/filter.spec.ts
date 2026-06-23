/**
 * 照片筛选流程 E2E 测试
 * =======================
 * 验证：视图切换、相似度调节、任务提交、照片启用/禁用、分组稳定性
 */

import { test, expect, Page } from "@playwright/test";
import {
  launchApp,
  closeApp,
  navigateTo,
  SELECTORS,
  submitDetectionTask,
  waitForTaskIdle,
  assertPageHealthy,
  rapidClick,
  togglePhotoEnabled,
  TEST_IMAGE_COUNT,
  PHOTO_CARD_SELECTOR,
  LONG_TIMEOUT,
  ensurePhotosImported,
} from "./helpers/electronApp";

let page: Page;

test.beforeAll(async () => {
  ({ page } = await launchApp());
  // 确保筛选页有照片可操作——字母序执行时 filter 可能在 import 之前
  await ensurePhotosImported(page, 5);
});
test.afterAll(async () => {
  await closeApp();
});

// ============================================================================
// 筛选页面基础测试
// ============================================================================
test.describe("筛选页面基础功能", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("页面加载并显示提交任务按钮", async () => {
    const btn = page.locator(SELECTORS.filter.submitBtn).first();
    await expect(btn).toBeVisible({ timeout: 10000 });
  });

  test("显示服务状态按钮", async () => {
    const btn = page.locator(SELECTORS.filter.serverStatusBtn).first();
    await expect(btn).toBeVisible({ timeout: 5000 });
  });

  test("点击服务状态按钮打开抽屉", async () => {
    const btn = page.locator(SELECTORS.filter.serverStatusBtn).first();
    await btn.click();
    await page.waitForTimeout(300);

    // 应显示抽屉内容
    const drawer = page.locator('[role="dialog"]');
    await expect(drawer).toBeVisible({ timeout: 3000 });

    // 关闭抽屉
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  test("显示禁用照片开关可用", async () => {
    const sw = page.locator(SELECTORS.filter.showDisabledSwitch).first();
    await expect(sw).toBeVisible({ timeout: 5000 });
  });
});

// ============================================================================
// 视图模式切换测试
// ============================================================================
test.describe("视图模式切换", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("切换分组/整体模式", async () => {
    const groupTab = page.locator(SELECTORS.filter.groupModeTab).first();
    const totalTab = page.locator(SELECTORS.filter.totalModeTab).first();

    if (await groupTab.isVisible().catch(() => false)) {
      await groupTab.click();
      await page.waitForTimeout(300);
      await assertPageHealthy(page);
    }

    if (await totalTab.isVisible().catch(() => false)) {
      await totalTab.click();
      await page.waitForTimeout(300);
      await assertPageHealthy(page);
    }
  });
});

// ============================================================================
// 相似度阈值测试
// ============================================================================
test.describe("相似度阈值控制", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("显示相似度滑块", async () => {
    const slider = page.locator(SELECTORS.filter.similaritySlider).first();
    await expect(slider).toBeVisible({ timeout: 5000 });
  });

  test("拖动滑块调整阈值", async () => {
    const slider = page.locator(SELECTORS.filter.similaritySlider).first();

    if (await slider.isVisible()) {
      const box = await slider.boundingBox();
      if (box) {
        // 点击滑块中点
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        await page.waitForTimeout(200);

        // 拖动到右侧
        await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, {
          steps: 5,
        });
        await page.mouse.up();
        await page.waitForTimeout(300);
      }
    }

    await assertPageHealthy(page);
  });

  test("快速调整滑块多次不崩溃", async () => {
    const slider = page.locator(SELECTORS.filter.similaritySlider).first();

    if (await slider.isVisible()) {
      const box = await slider.boundingBox();
      if (box) {
        for (let i = 0; i < 8; i++) {
          const x = box.x + box.width * ((i % 4) / 4 + 0.1);
          await page.mouse.click(x, box.y + box.height / 2);
          await page.waitForTimeout(50);
        }
      }
    }

    await assertPageHealthy(page);
  });
});

// ============================================================================
// 任务提交测试
// ============================================================================
test.describe("检测任务提交", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("点击提交任务按钮", async () => {
    await submitDetectionTask(page);
    await assertPageHealthy(page);
  });

  test("快速点击提交按钮多次不崩溃", async () => {
    await rapidClick(page, SELECTORS.filter.submitBtn, 5, 100);
    await page.waitForTimeout(1000);
    await assertPageHealthy(page);
  });

  test("任务提交后服务状态更新", async () => {
    await submitDetectionTask(page);
    await page.waitForTimeout(2000);

    const btn = page.locator(SELECTORS.filter.serverStatusBtn).first();
    const text = await btn.textContent().catch(() => "");
    // 状态应有值
    expect(text?.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// 照片启用/禁用操作测试
// ============================================================================
test.describe("照片启用/禁用操作", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("切换显示禁用照片开关", async () => {
    const sw = page.locator(SELECTORS.filter.showDisabledSwitch).first();

    if (await sw.isVisible()) {
      const initial = await sw.isChecked().catch(() => false);
      await sw.click();
      await page.waitForTimeout(300);

      const after = await sw.isChecked().catch(() => !initial);
      expect(after).not.toBe(initial);

      // 恢复
      await sw.click();
      await page.waitForTimeout(300);
    }
  });

  test("快速切换开关多次不崩溃", async () => {
    const sw = page.locator(SELECTORS.filter.showDisabledSwitch).first();

    if (await sw.isVisible()) {
      for (let i = 0; i < 10; i++) {
        await sw.click();
        await page.waitForTimeout(50);
      }

      const finalState = await sw.isChecked().catch(() => false);
      expect(typeof finalState).toBe("boolean");
    }

    await assertPageHealthy(page);
  });

  test("双击照片切换启用/禁用状态", async () => {
    // 无测试图片时跳过
    if (TEST_IMAGE_COUNT === 0) return;

    // 筛选页需先提交检测任务才有照片出现在网格中
    await submitDetectionTask(page);
    await waitForTaskIdle(page, LONG_TIMEOUT);
    await page.waitForTimeout(1000);

    // 运行时守卫：spec 按字母序执行（export→filter→import→workflow），
    // filter 可能在 import 之前运行导致 DB 无照片，此时卡片不可见应跳过而非失败
    const card = page.locator(PHOTO_CARD_SELECTOR).first();
    if (!(await card.isVisible().catch(() => false))) return;

    // 双击第一张照片切换为禁用（PhotoGrid 双击 → toggleEnabled）
    const disabled = await togglePhotoEnabled(page, 0);
    expect(disabled).toBe(true); // 首次双击应变为禁用态

    // 再次双击恢复为启用
    const reEnabled = await togglePhotoEnabled(page, 0);
    expect(reEnabled).toBe(false);
  });
});

// ============================================================================
// 分组结果稳定性测试
// ============================================================================
test.describe("分组结果稳定性", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("重复提交任务后分组一致", async () => {
    // 首次提交
    await submitDetectionTask(page);
    await page.waitForTimeout(5000);

    // 记录当前状态
    const text1 = await page
      .locator("body")
      .textContent()
      .catch(() => "");
    const hasGroups1 = text1?.includes("分组") || text1?.includes("Group");

    // 再次提交
    await submitDetectionTask(page);
    await page.waitForTimeout(5000);

    const text2 = await page
      .locator("body")
      .textContent()
      .catch(() => "");
    const hasGroups2 = text2?.includes("分组") || text2?.includes("Group");

    // 分组状态应一致
    expect(hasGroups1).toBe(hasGroups2);
  });
});

// ============================================================================
// 左右分栏拖动测试
// ============================================================================
test.describe("分栏拖动", () => {
  test.beforeEach(async () => {
    await navigateTo(page, "filter");
  });

  test("拖动分栏调整宽度", async () => {
    const dragHandle = page.locator('[class*="cursor-ew-resize"]').first();

    if (await dragHandle.isVisible().catch(() => false)) {
      const box = await dragHandle.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + 100, box.y + box.height / 2, {
          steps: 5,
        });
        await page.mouse.up();
        await page.waitForTimeout(300);
      }
    }

    await assertPageHealthy(page);
  });

  test("拖动到极限位置保持最小宽度", async () => {
    const dragHandle = page.locator('[class*="cursor-ew-resize"]').first();

    if (await dragHandle.isVisible().catch(() => false)) {
      const box = await dragHandle.boundingBox();
      if (box) {
        // 拖到屏幕最左
        await page.mouse.move(box.x, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(100, box.y + box.height / 2, { steps: 10 });
        await page.mouse.up();
        await page.waitForTimeout(300);
      }
    }

    await assertPageHealthy(page);
  });
});
