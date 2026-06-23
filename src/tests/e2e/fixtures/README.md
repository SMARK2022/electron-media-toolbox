# E2E 测试图片 fixture

本目录用于 **CI 环境** 下的 E2E 测试图片 fixture。

## 本地开发

本地开发时 E2E 默认使用 `<repo>/dev/imgs_to test` 目录的图片（见 `src/tests/e2e/helpers/electronApp.ts`），**无需**往本目录放图。

## CI 环境

CI 通过环境变量 `E2E_TEST_IMAGES_DIR` 指向本目录下的 `images/` 子目录。如需让 CI E2E 真正运行完整流程，请在该子目录放置若干测试图片：

- 建议 3-5 张 JPG
- 单张 1-5MB
- 文件名可任意（`importTestFiles` 按 `TEST_IMAGE_FILES` 列表切片，CI 下未提供列表时会 fallback 到目录扫描）

未放置图片时，依赖照片导入的 E2E 用例会自动降级（`importTestFiles` 返回 0），不会阻塞 publish/release 流水线——release 流水线独立于 E2E。
