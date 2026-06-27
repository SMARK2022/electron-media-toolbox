/**
 * EXIF 部分读取正确性单元测试
 * =============================
 * 验证 exif-parser 对截断缓冲区的解析行为：
 * - 64KB 部分缓冲区与完整文件解析结果一致（关键 EXIF 字段不丢失）
 * - 过小缓冲区解析失败或返回空标签（确认边界行为）
 *
 * 这些不变量是 get-photo-metadata IPC handler 使用部分读取的前提——
 * 若 exif-parser 在某次升级后改变截断行为，此测试会立即暴露回归。
 */
import fs from "node:fs";
import path from "node:path";

// exif-parser 无 ESM 默认导出，与 window-listeners.ts 保持一致的 require 语义
// eslint-disable-next-line @typescript-eslint/no-require-imports
const exifParser = require("exif-parser");

// 使用 dev 目录中的原始相机照片（含完整 EXIF）验证
// CI 中无此目录时跳过——E2E 测试会覆盖完整导入流程
const fixturePath = path.resolve(
  process.cwd(),
  "dev/imgs_to test/Z30_3044.JPG",
);

describe("EXIF 部分读取正确性", () => {
  test("64KB 部分缓冲区与完整文件解析得到相同的关键 EXIF 字段", () => {
    if (!fs.existsSync(fixturePath)) return; // CI 无原始照片时跳过

    const fullBuf = fs.readFileSync(fixturePath);
    // 64KB 是 get-photo-metadata handler 中 EXIF_READ_SIZE 的值
    const partialBuf = fullBuf.subarray(0, Math.min(64 * 1024, fullBuf.length));

    const fullResult = exifParser.create(fullBuf).parse();
    const partialResult = exifParser.create(partialBuf).parse();

    // 完整文件必须包含 EXIF——否则测试无意义
    expect(Object.keys(fullResult.tags || {}).length).toBeGreaterThan(0);

    // 关键 EXIF 字段必须一致——这些字段被 PhotoService 用于 UI 显示和 DB 写入
    expect(partialResult.tags.DateTimeOriginal).toBe(
      fullResult.tags.DateTimeOriginal,
    );
    expect(partialResult.tags.Model).toBe(fullResult.tags.Model);
    expect(partialResult.tags.ExposureTime).toBe(fullResult.tags.ExposureTime);
    expect(partialResult.tags.LensModel).toBe(fullResult.tags.LensModel);
  });

  test("过小缓冲区（4KB）无法解析 EXIF（确认回退路径的触发条件）", () => {
    if (!fs.existsSync(fixturePath)) return;

    const fullBuf = fs.readFileSync(fixturePath);
    // 4KB 远不足以包含完整 EXIF APP1 段（实测 Z30 系列需 ~32KB）
    const tinyBuf = fullBuf.subarray(0, 4096);

    // 过小缓冲区要么抛异常（offset 越界），要么返回 0 tags（找不到 APP1）
    // 两种情况都意味着部分读取失败，需要回退完整读取
    let threw = false;
    let tagCount = 0;
    try {
      const r = exifParser.create(tinyBuf).parse();
      tagCount = Object.keys(r.tags || {}).length;
    } catch {
      threw = true;
    }
    // 至少满足一种失败模式
    expect(threw || tagCount === 0).toBe(true);
  });
});
