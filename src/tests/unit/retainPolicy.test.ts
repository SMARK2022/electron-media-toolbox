/**
 * 保留策略纯函数单元测试
 * =====================
 * 锁定 computeRetentionPolicy 的组内排序与切分语义：
 * - IQA 依据：按 photo.info(实为 IQA 数值串) 降序保留前 N 张
 * - 睁眼依据：闭眼/疑似数少的优先，再按 IQA 降序
 * - eyeStats 缺失时降级为 IQA，避免空数据导致误判
 * - keepCount 越界钳制，保证每组至少保留 1 张
 *
 * 这些不变量被 fnDisableRedundantInGroups 与右侧预览摘要共同依赖，
 * 改动排序逻辑会导致"预览所见"与"实际弃用"不一致。
 */
import {
  computeRetentionPolicy,
  parseIQA,
  type RetentionPolicy,
} from "@/helpers/store/usePhotoFilterStore";
import type { Photo } from "@/helpers/ipc/database/db";
import type { EyeStatistics } from "@/helpers/store/usePhotoFilterStore";

// 构造 Photo 的辅助：info 字段承载 IQA 数值（与 PhotoService.toPhoto 写入一致）
const mk = (filePath: string, iqa: number, enabled = true): Photo => ({
  fileName: filePath,
  fileUrl: "",
  filePath,
  info: iqa.toString(),
  isEnabled: enabled,
});

// 构造 [filePath, EyeStatistics] 元组，供 new Map(entries) 使用
const mkEye = (
  filePath: string,
  closed: number,
  suspicious: number,
  open: number,
): [string, EyeStatistics] => [
  filePath,
  {
    filePath,
    closedEyesCount: closed,
    suspiciousCount: suspicious,
    openEyesCount: open,
  },
];

// ============================================================================
// parseIQA 守卫：info 非数字时不得污染排序（与 PhotoGrid 缩略图配色同源契约）
// ============================================================================
describe("parseIQA 守卫", () => {
  test("数字串正常解析", () => {
    expect(parseIQA("82.5")).toBe(82.5);
  });

  test("空串/undefined/null 返回 0，不抛异常", () => {
    // 后端可能写入空 info，排序时需退化为最低分而非崩溃
    expect(parseIQA("")).toBe(0);
    expect(parseIQA(undefined)).toBe(0);
    expect(parseIQA(null as unknown as undefined)).toBe(0);
  });

  test("非数字串返回 0", () => {
    expect(parseIQA("N/A")).toBe(0);
  });
});

// ============================================================================
// IQA 依据：按 IQA 降序保留前 N
// ============================================================================
describe("IQA 依据保留", () => {
  test("保留 IQA 最高的 N 张，其余弃用", () => {
    const group = [mk("a", 70), mk("b", 95), mk("c", 80)];
    const policy: RetentionPolicy = { criteria: "iqa", keepCount: 1 };
    const { keep, disable, groupCount } = computeRetentionPolicy(
      [group],
      policy,
      new Map(),
    );
    // 保留者必须是组内 IQA 最高，弃用者按 IQA 降序排后
    expect(keep.map((p) => p.filePath)).toEqual(["b"]);
    expect(disable.map((p) => p.filePath).sort()).toEqual(["a", "c"]);
    expect(groupCount).toBe(1);
  });

  test("keepCount=2 保留前两张", () => {
    const group = [mk("a", 70), mk("b", 95), mk("c", 80)];
    const { keep, disable } = computeRetentionPolicy(
      [group],
      { criteria: "iqa", keepCount: 2 },
      new Map(),
    );
    expect(keep.map((p) => p.filePath)).toEqual(["b", "c"]);
    expect(disable.map((p) => p.filePath)).toEqual(["a"]);
  });

  test("保留顺序与后端已按 IQA 降序的分组一致（回归契约）", () => {
    // 后端 getPhotosExtendByCriteria ORDER BY IQA DESC，group[0] 本就是最高。
    // 纯函数必须保持该不变量：keep[0] 应为 IQA 最高者
    const group = [mk("first", 99), mk("second", 50)];
    const { keep } = computeRetentionPolicy(
      [group],
      { criteria: "iqa", keepCount: 1 },
      new Map(),
    );
    expect(keep[0].filePath).toBe("first");
  });
});

// ============================================================================
// 睁眼依据：闭眼/疑似少的优先，tiebreak IQA
// ============================================================================
describe("睁眼依据保留", () => {
  test("有闭眼的照片排到弃用区，全睁眼者保留", () => {
    const group = [
      mk("clean", 60), // IQA 较低但无人闭眼
      mk("blink", 95), // IQA 高但有闭眼
    ];
    const eyeStats = new Map<string, EyeStatistics>([
      mkEye("clean", 0, 0, 2),
      mkEye("blink", 1, 0, 1), // 1 闭眼
    ]);
    const { keep, disable } = computeRetentionPolicy(
      [group],
      { criteria: "eye", keepCount: 1 },
      eyeStats,
    );
    // 睁眼优先：clean 保留，高 IQA 但闭眼的 blink 弃用
    expect(keep[0].filePath).toBe("clean");
    expect(disable[0].filePath).toBe("blink");
  });

  test("同为无闭眼时按 IQA 降序 tiebreak", () => {
    const group = [mk("low", 60), mk("high", 90)];
    const eyeStats = new Map<string, EyeStatistics>([
      mkEye("low", 0, 0, 1),
      mkEye("high", 0, 0, 1),
    ]);
    const { keep } = computeRetentionPolicy(
      [group],
      { criteria: "eye", keepCount: 1 },
      eyeStats,
    );
    expect(keep[0].filePath).toBe("high");
  });

  test("疑似闭眼也计入风险（suspicious 叠加排序）", () => {
    const group = [mk("suspect", 90), mk("ok", 70)];
    const eyeStats = new Map<string, EyeStatistics>([
      mkEye("suspect", 0, 1, 1), // 仅疑似
      mkEye("ok", 0, 0, 1),
    ]);
    const { keep } = computeRetentionPolicy(
      [group],
      { criteria: "eye", keepCount: 1 },
      eyeStats,
    );
    expect(keep[0].filePath).toBe("ok");
  });
});

// ============================================================================
// 降级：eyeStats 空 → 退化为 IQA，避免空数据误导
// ============================================================================
describe("eyeStats 缺失降级", () => {
  test("空 eyeStats 时 eye 策略产出与 iqa 策略一致", () => {
    // 启动瞬间 eyeStats 尚未就绪，必须退化为 IQA 而非乱序
    const group = [mk("a", 70), mk("b", 95)];
    const empty = new Map<string, EyeStatistics>();
    const byEye = computeRetentionPolicy(
      [group],
      { criteria: "eye", keepCount: 1 },
      empty,
    );
    const byIqa = computeRetentionPolicy(
      [group],
      { criteria: "iqa", keepCount: 1 },
      empty,
    );
    expect(byEye.keep.map((p) => p.filePath)).toEqual(
      byIqa.keep.map((p) => p.filePath),
    );
  });
});

// ============================================================================
// keepCount 越界钳制
// ============================================================================
describe("keepCount 边界", () => {
  test("keepCount 超过组大小 → 整组保留，弃用为空", () => {
    const group = [mk("a", 70), mk("b", 95)];
    const { keep, disable } = computeRetentionPolicy(
      [group],
      { criteria: "iqa", keepCount: 10 },
      new Map(),
    );
    expect(keep).toHaveLength(2);
    expect(disable).toHaveLength(0);
  });

  test("keepCount=0 钳制为 1，不清空整组", () => {
    // 防止误输入 0 导致整组被弃用
    const group = [mk("a", 70), mk("b", 95)];
    const { keep } = computeRetentionPolicy(
      [group],
      { criteria: "iqa", keepCount: 0 },
      new Map(),
    );
    expect(keep).toHaveLength(1);
    expect(keep[0].filePath).toBe("b"); // 仍保留 IQA 最高
  });

  test("负数 keepCount 钳制为 1", () => {
    const group = [mk("a", 70)];
    const { keep, disable } = computeRetentionPolicy(
      [group],
      { criteria: "iqa", keepCount: -3 },
      new Map(),
    );
    expect(keep).toHaveLength(1);
    expect(disable).toHaveLength(0);
  });
});

// ============================================================================
// 跨组汇总
// ============================================================================
describe("跨组汇总", () => {
  test("多组独立切分，groupCount 正确", () => {
    const groups = [
      [mk("g1a", 30), mk("g1b", 90)],
      [mk("g2a", 50), mk("g2c", 80), mk("g2b", 10)],
    ];
    const { keep, disable, groupCount } = computeRetentionPolicy(
      groups,
      { criteria: "iqa", keepCount: 1 },
      new Map(),
    );
    expect(groupCount).toBe(2);
    expect(keep).toHaveLength(2); // 每组保留 1
    // 各组保留者应为该组 IQA 最高
    expect(keep.map((p) => p.filePath).sort()).toEqual(["g1b", "g2c"]);
    expect(disable).toHaveLength(3);
  });
});
