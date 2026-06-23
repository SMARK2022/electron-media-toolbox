# E2E 测试图片 fixture

本目录用于 **CI 环境** 下的 E2E 测试图片 fixture。

## 本地开发

本地开发时 E2E 默认使用 `<repo>/dev/imgs_to test` 目录的图片（见 `src/tests/e2e/helpers/electronApp.ts`），**无需**往本目录放图。

## CI 环境

CI 通过环境变量 `E2E_TEST_IMAGES_DIR` 指向本目录下的 `images/` 子目录。测试代码会**动态扫描**该目录下所有图片文件（.jpg/.png/.webp/.bmp/.tiff），文件名任意，无需匹配特定列表。

放置 3-5 张 JPG（单张 1-5MB）即可启用完整 E2E 流程。未放置图片时，依赖照片的用例自动跳过（`TEST_IMAGE_COUNT === 0` 守卫），不阻塞 release 流水线。
