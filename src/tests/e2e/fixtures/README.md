# E2E 测试图片 fixture

本目录用于 **CI 环境** 下的 E2E 测试图片 fixture。

## 已包含的图片

本目录已包含 3 张从真实相机照片缩小的 JPG（`e2e_test_1.jpg` ~ `e2e_test_3.jpg`，每张 ~130-200KB），足以触发完整的后端检测流程（IQA 评分 + 人脸检测 + 分组）。

## 本地开发

本地开发时 E2E 默认使用 `<repo>/dev/imgs_to test` 目录的图片（见 `src/tests/e2e/helpers/electronApp.ts`），**无需**往本目录放图。

## CI 环境

CI 通过环境变量 `E2E_TEST_IMAGES_DIR` 指向本目录下的 `images/` 子目录。测试代码会**动态扫描**该目录下所有图片文件（.jpg/.png/.webp/.bmp/.tiff），文件名任意，无需匹配特定列表。

如需替换 fixture 图片，放入 3-5 张 JPG（单张 1-5MB）即可。未放置图片时，依赖照片的用例自动跳过（`TEST_IMAGE_COUNT === 0` 守卫），不阻塞 release 流水线。
