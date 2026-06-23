/**
 * 文件扩展名替换逻辑单元测试
 * =============================
 * 锁定 changeFileExtension 的正则行为 /\.[^/.]+$/：
 * 匹配最后一个 dot 后的非 dot/非斜杠字符序列并替换。
 * 该函数被 copyPhotos 用于 RAW 文件路径生成（.NEF/.CR3 等），
 * 正则行为偏移会导致 RAW 文件查找路径错误。
 */
import { changeFileExtension } from "@/lib/system";

describe("changeFileExtension", () => {
  test("正常替换单扩展名", () => {
    expect(changeFileExtension("photo.jpg", ".png")).toBe("photo.png");
  });

  test("仅替换最后一个扩展名（多 dot 文件名）", () => {
    // 正则用 $ 锚定末尾，只匹配最后的 .c
    expect(changeFileExtension("archive.tar.gz", ".zip")).toBe(
      "archive.tar.zip",
    );
  });

  test("无扩展名时原样返回（正则不匹配）", () => {
    // "README" 无 dot，正则不匹配，replace 返回原字符串
    // 注意：不会自动追加扩展名
    expect(changeFileExtension("README", ".md")).toBe("README");
  });

  test("尾部 dot 无字符时不匹配（[^/.]+ 需至少 1 字符）", () => {
    // "file." 的 dot 后无字符，正则不匹配
    expect(changeFileExtension("file.", ".jpg")).toBe("file.");
  });

  test("带路径的文件名正确替换末尾扩展名", () => {
    expect(changeFileExtension("C:/photos/IMG_001.JPG", ".NEF")).toBe(
      "C:/photos/IMG_001.NEF",
    );
  });

  test("替换为空字符串相当于删除扩展名", () => {
    expect(changeFileExtension("photo.jpg", "")).toBe("photo");
  });
});
