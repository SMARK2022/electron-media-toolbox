/**
 * i18n 翻译资源一致性测试
 * =======================
 * 确保 en/zh 两种语言的翻译资源 key 结构完全一致，
 * 防止新增功能时只加了一种语言的翻译导致 UI 显示 raw key。
 *
 * 同时验证 {{xxx}} 插值占位符在两种语言中都存在，
 * 避免 i18next 渲染时因缺失占位符而显示 undefined。
 */
import i18n from "@/localization/i18n";

// ============================================================================
// 辅助函数：递归收集所有叶子 key 路径
// ============================================================================
function collectKeyPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  const paths: string[] = [];
  for (const key of Object.keys(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      // 嵌套对象递归
      paths.push(...collectKeyPaths(value as Record<string, unknown>, path));
    } else {
      // 叶子节点
      paths.push(path);
    }
  }
  return paths;
}

// 从字符串中提取 {{xxx}} 占位符
function extractPlaceholders(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const matches = value.matchAll(/\{\{(\w+)\}\}/g);
  return [...matches].map((m) => m[1]);
}

// ============================================================================
// 测试
// ============================================================================
describe("i18n en/zh 资源一致性", () => {
  // getResourceBundle 取整个 namespace 资源对象，签名只需 (lng, ns) 两个参数
  const enResource = i18n.getResourceBundle("en", "translation") as Record<
    string,
    unknown
  >;
  const zhResource = i18n.getResourceBundle("zh", "translation") as Record<
    string,
    unknown
  >;

  test("两种语言资源对象都存在且非空", () => {
    // 防止 getResource 返回 undefined（namespace 不匹配等问题）
    expect(enResource).toBeDefined();
    expect(zhResource).toBeDefined();
    expect(Object.keys(enResource).length).toBeGreaterThan(0);
    expect(Object.keys(zhResource).length).toBeGreaterThan(0);
  });

  test("两种语言的 key 路径集合完全一致", () => {
    const enKeys = new Set(collectKeyPaths(enResource));
    const zhKeys = new Set(collectKeyPaths(zhResource));

    const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
    const missingInEn = [...zhKeys].filter((k) => !enKeys.has(k));

    if (missingInZh.length > 0 || missingInEn.length > 0) {
      // 输出缺失的 key 方便定位
      console.error("Missing in zh:", missingInZh);
      console.error("Missing in en:", missingInEn);
    }

    expect(missingInZh).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  test("同一 key 的 {{xxx}} 占位符在两种语言中一致", () => {
    const enKeys = collectKeyPaths(enResource);
    const zhKeys = collectKeyPaths(zhResource);
    const allKeys = new Set([...enKeys, ...zhKeys]);

    const mismatches: { key: string; en: string[]; zh: string[] }[] = [];

    for (const key of allKeys) {
      // 按 dot 路径取值
      const enValue = key.split(".").reduce<unknown>((acc, k) => {
        if (acc && typeof acc === "object")
          return (acc as Record<string, unknown>)[k];
        return undefined;
      }, enResource);
      const zhValue = key.split(".").reduce<unknown>((acc, k) => {
        if (acc && typeof acc === "object")
          return (acc as Record<string, unknown>)[k];
        return undefined;
      }, zhResource);

      const enPlaceholders = new Set(extractPlaceholders(enValue));
      const zhPlaceholders = new Set(extractPlaceholders(zhValue));

      // 比较占位符集合
      const enExtra = [...enPlaceholders].filter((p) => !zhPlaceholders.has(p));
      const zhExtra = [...zhPlaceholders].filter((p) => !enPlaceholders.has(p));

      if (enExtra.length > 0 || zhExtra.length > 0) {
        mismatches.push({
          key,
          en: [...enPlaceholders],
          zh: [...zhPlaceholders],
        });
      }
    }

    if (mismatches.length > 0) {
      console.error(
        "Placeholder mismatches:",
        JSON.stringify(mismatches, null, 2),
      );
    }
    expect(mismatches).toEqual([]);
  });

  test("eyeState 子 key 与 EyeState 类型值一致", () => {
    // EyeState = "open" | "suspicious" | "closed"
    // 翻译资源路径为 filterPage.eyeState.{open|suspicious|closed}
    const eyeStateKeys = ["open", "suspicious", "closed"];
    for (const state of eyeStateKeys) {
      const path = `filterPage.eyeState.${state}`;
      const enValue = path.split(".").reduce<unknown>((acc, k) => {
        if (acc && typeof acc === "object")
          return (acc as Record<string, unknown>)[k];
        return undefined;
      }, enResource);
      const zhValue = path.split(".").reduce<unknown>((acc, k) => {
        if (acc && typeof acc === "object")
          return (acc as Record<string, unknown>)[k];
        return undefined;
      }, zhResource);

      expect(enValue).toBeDefined();
      expect(zhValue).toBeDefined();
      expect(typeof enValue).toBe("string");
      expect(typeof zhValue).toBe("string");
    }
  });
});
