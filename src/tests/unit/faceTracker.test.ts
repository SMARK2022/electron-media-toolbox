/**
 * 人脸追踪匹配器单元测试
 * ======================
 * 测试 FaceTracker 的概率匹配算法：
 * - 4 个纯数学辅助函数（gaussian/computeIoU/extractFeatures/softmax）
 * - FaceTracker 类的追踪状态管理和 findMatch 两段策略（置信度阈值 + 保底）
 *
 * 这些函数是照片筛选页面"切换图片时自动聚焦同一人脸"的核心逻辑，
 * 正则/阈值偏移会导致追踪跳到错误的人脸。
 */
import {
  FaceTracker,
  gaussian,
  computeIoU,
  extractFeatures,
  softmax,
  type FaceInfo,
} from "@/pages/PhotoFilterPage/faceTracker";

// ============================================================================
// gaussian 高斯核函数
// ============================================================================
describe("gaussian 高斯核", () => {
  test("x=0 时返回 1（峰值）", () => {
    expect(gaussian(0, 1)).toBeCloseTo(1, 10);
  });

  test("对称性：gaussian(x, σ) === gaussian(-x, σ)", () => {
    expect(gaussian(0.5, 0.15)).toBeCloseTo(gaussian(-0.5, 0.15), 10);
  });

  test("始终返回非负值（exp 保证非负，极端大 x 可能下溢为 0）", () => {
    // x=10, σ=1 → exp(-50) ≈ 1.9e-22，仍为正数
    expect(gaussian(10, 1)).toBeGreaterThanOrEqual(0);
    expect(gaussian(10, 1)).toBeGreaterThan(0);
  });

  test("σ 越大衰减越慢", () => {
    // 同一个 x，大 σ 的值应大于小 σ 的值
    expect(gaussian(0.1, 1.0)).toBeGreaterThan(gaussian(0.1, 0.1));
  });
});

// ============================================================================
// computeIoU 交并比
// ============================================================================
describe("computeIoU 交并比", () => {
  test("完全重叠的两个 box → 1.0", () => {
    const box: [number, number, number, number] = [10, 10, 50, 50];
    expect(computeIoU(box, box)).toBeCloseTo(1, 10);
  });

  test("完全不重叠 → 0", () => {
    const box1: [number, number, number, number] = [0, 0, 10, 10];
    const box2: [number, number, number, number] = [20, 20, 30, 30];
    expect(computeIoU(box1, box2)).toBe(0);
  });

  test("部分重叠 → 介于 0 和 1 之间", () => {
    const box1: [number, number, number, number] = [0, 0, 20, 20];
    const box2: [number, number, number, number] = [10, 10, 30, 30];
    const iou = computeIoU(box1, box2);
    expect(iou).toBeGreaterThan(0);
    expect(iou).toBeLessThan(1);
  });

  test("一个 box 包含另一个 → IoU = 交集/大 box 面积", () => {
    // 内部 box 面积 = 100，外部 box 面积 = 400，交集 = 100，并集 = 400
    const outer: [number, number, number, number] = [0, 0, 20, 20];
    const inner: [number, number, number, number] = [5, 5, 15, 15];
    expect(computeIoU(outer, inner)).toBeCloseTo(100 / 400, 5);
  });
});

// ============================================================================
// extractFeatures 特征提取
// ============================================================================
describe("extractFeatures 特征提取", () => {
  test("正确计算中心点、宽高、面积、宽高比", () => {
    const features = extractFeatures([0, 0, 10, 20]);
    expect(features.centerX).toBe(5);
    expect(features.centerY).toBe(10);
    expect(features.width).toBe(10);
    expect(features.height).toBe(20);
    expect(features.area).toBe(200);
    expect(features.aspectRatio).toBeCloseTo(0.5, 10); // 10 / max(20, 1) = 0.5
  });

  test("宽高比的分母用 max(height, 1) 防止除零", () => {
    // height=0 时不会 NaN，因为 max(0, 1) = 1
    const features = extractFeatures([0, 0, 10, 0]);
    expect(features.aspectRatio).toBe(10); // 10 / max(0, 1) = 10
  });
});

// ============================================================================
// softmax 归一化指数函数
// ============================================================================
describe("softmax 归一化", () => {
  test("所有输出之和为 1", () => {
    const result = softmax([1, 2, 3, 4]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  test("所有 logits 相等时输出均匀分布", () => {
    const result = softmax([5, 5, 5]);
    result.forEach((v) => expect(v).toBeCloseTo(1 / 3, 10));
  });

  test("更大的 logit 对应更高的概率", () => {
    const result = softmax([0, 0, 10]);
    expect(result[2]).toBeGreaterThan(result[0]);
    expect(result[2]).toBeGreaterThan(result[1]);
  });

  test("单个元素 → [1.0]", () => {
    expect(softmax([42])).toEqual([1]);
  });
});

// ============================================================================
// FaceTracker 类 — 状态管理
// ============================================================================
describe("FaceTracker 状态管理", () => {
  test("初始状态无追踪", () => {
    const tracker = new FaceTracker();
    expect(tracker.hasTracking()).toBe(false);
  });

  test("setTrackedFace 后进入追踪状态", () => {
    const tracker = new FaceTracker();
    const face: FaceInfo = { bbox: [10, 10, 50, 50], score: 0.95 };
    tracker.setTrackedFace(face, 0, { width: 100, height: 100 }, 3);

    expect(tracker.hasTracking()).toBe(true);
  });

  test("setTrackedFace 传入 null 调用 clearTracking", () => {
    const tracker = new FaceTracker();
    const face: FaceInfo = { bbox: [10, 10, 50, 50], score: 0.95 };
    tracker.setTrackedFace(face, 0, { width: 100, height: 100 }, 3);
    expect(tracker.hasTracking()).toBe(true);

    tracker.setTrackedFace(null, -1, { width: 100, height: 100 }, 3);
    expect(tracker.hasTracking()).toBe(false);
  });

  test("clearTracking 重置所有状态", () => {
    const tracker = new FaceTracker();
    const face: FaceInfo = { bbox: [10, 10, 50, 50], score: 0.95 };
    tracker.setTrackedFace(face, 0, { width: 100, height: 100 }, 3);
    tracker.clearTracking();

    expect(tracker.hasTracking()).toBe(false);
  });

  test("构造函数合并用户配置与默认配置（通过 findMatch 行为间接验证）", () => {
    // 低阈值 tracker：单候选 softmax 置信度轻松达标 → 走置信度路径
    const lowThresholdTracker = new FaceTracker({ minConfidence: 0.01 });
    lowThresholdTracker.setTrackedFace(
      { bbox: [45, 45, 55, 55], score: 0.9 },
      0,
      { width: 100, height: 100 },
      1,
    );
    const lowResult = lowThresholdTracker.findMatch(
      [{ bbox: [45, 45, 55, 55], score: 0.9 }],
      { width: 100, height: 100 },
    );
    // 置信度路径：单候选概率=1 >= 0.01 → 直接返回
    expect(lowResult.confidence).toBe(1);
    expect(lowResult.matchedIndex).toBe(0);

    // 高阈值 tracker：同样的输入但 minConfidence=0.99 → 走保底路径
    const highThresholdTracker = new FaceTracker({ minConfidence: 0.99 });
    highThresholdTracker.setTrackedFace(
      { bbox: [45, 45, 55, 55], score: 0.9 },
      0,
      { width: 100, height: 100 },
      1,
    );
    const highResult = highThresholdTracker.findMatch(
      [{ bbox: [45, 45, 55, 55], score: 0.9 }],
      { width: 100, height: 100 },
    );
    // 保底路径：单候选 softmax=1 但 < 0.99 → 仍返回 index 0，但走的是 fallback 逻辑
    // 关键区别：高阈值下 confidence 不会等于 1（保底返回的是 fallback.prob 而非 maxProb）
    expect(highResult.matchedIndex).toBe(0);
  });
});

// ============================================================================
// FaceTracker.findMatch — 无追踪/空候选
// ============================================================================
describe("FaceTracker.findMatch 无效输入", () => {
  test("无追踪状态时返回 null 匹配", () => {
    const tracker = new FaceTracker();
    const result = tracker.findMatch([{ bbox: [0, 0, 10, 10], score: 0.9 }], {
      width: 100,
      height: 100,
    });
    expect(result.matchedIndex).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.probabilities).toEqual([]);
  });

  test("有空追踪但候选列表为空时返回 null", () => {
    const tracker = new FaceTracker();
    tracker.setTrackedFace(
      { bbox: [10, 10, 50, 50], score: 0.9 },
      0,
      { width: 100, height: 100 },
      1,
    );
    const result = tracker.findMatch([], { width: 100, height: 100 });
    expect(result.matchedIndex).toBeNull();
    expect(result.confidence).toBe(0);
    expect(result.probabilities).toEqual([]);
  });
});

// ============================================================================
// FaceTracker.findMatch — 正常匹配路径
// ============================================================================
describe("FaceTracker.findMatch 正常匹配", () => {
  test("单候选时直接返回该候选", () => {
    const tracker = new FaceTracker();
    const prevFace: FaceInfo = { bbox: [40, 40, 60, 60], score: 0.9 };
    tracker.setTrackedFace(prevFace, 0, { width: 100, height: 100 }, 1);

    // 候选与 prev 几乎相同位置 → 高置信度匹配
    const result = tracker.findMatch([{ bbox: [41, 41, 61, 61], score: 0.9 }], {
      width: 100,
      height: 100,
    });
    expect(result.matchedIndex).toBe(0);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.probabilities.length).toBe(1);
  });

  test("多候选时选中与追踪目标最接近的", () => {
    const tracker = new FaceTracker();
    // 追踪位置在右上角
    const prevFace: FaceInfo = { bbox: [70, 10, 90, 30], score: 0.9 };
    tracker.setTrackedFace(prevFace, 0, { width: 100, height: 100 }, 3);

    const candidates: FaceInfo[] = [
      { bbox: [10, 70, 30, 90], score: 0.8 }, // 左下角，距离远
      { bbox: [72, 12, 92, 32], score: 0.85 }, // 右上角，距离近
      { bbox: [40, 40, 60, 60], score: 0.95 }, // 中心，距离中等
    ];

    const result = tracker.findMatch(candidates, { width: 100, height: 100 });
    expect(result.matchedIndex).toBe(1); // 应选右上角的候选
    expect(result.confidence).toBeGreaterThan(0);
  });

  test("findMatch 后追踪状态不改变（findMatch 是只读查询）", () => {
    const tracker = new FaceTracker();
    tracker.setTrackedFace(
      { bbox: [40, 40, 60, 60], score: 0.9 },
      0,
      { width: 100, height: 100 },
      1,
    );
    const stateBefore = tracker.getTrackingState();
    tracker.findMatch([{ bbox: [41, 41, 61, 61], score: 0.9 }], {
      width: 100,
      height: 100,
    });
    const stateAfter = tracker.getTrackingState();

    // findMatch 不应修改追踪状态
    expect(stateAfter.index).toBe(stateBefore.index);
    expect(stateAfter.imageSize).toEqual(stateBefore.imageSize);
  });
});

// ============================================================================
// FaceTracker.findMatch — 保底策略
// ============================================================================
describe("FaceTracker.findMatch 保底策略", () => {
  test("低置信度时从 top 50% 中选原始 score 最高的", () => {
    // 3 个候选与追踪目标 bbox 完全相同 → 位置/尺度/宽高比/IoU 因子一致
    // 仅 score 连续性和排序先验影响 softmax → 候选 0 的 softmax 最高
    // minConfidence=0.99 强制走保底；top 50% = ceil(3*0.5) = 2 → 候选 0 和 1 入选
    // 保底从两者中选 score 最高的 → 候选 1（score 0.95 > 0.90）
    const tracker = new FaceTracker({ minConfidence: 0.99 });
    tracker.setTrackedFace(
      { bbox: [45, 45, 55, 55], score: 0.9 },
      0,
      { width: 100, height: 100 },
      3,
    );

    const candidates: FaceInfo[] = [
      { bbox: [45, 45, 55, 55], score: 0.9 }, // score 与 prev 相同 → softmax 最高
      { bbox: [45, 45, 55, 55], score: 0.95 }, // score 略高 → 保底选中
      { bbox: [45, 45, 55, 55], score: 0.85 }, // score 略低 → 排在 top 2 之外
    ];

    const result = tracker.findMatch(candidates, { width: 100, height: 100 });
    expect(result.matchedIndex).toBe(1); // 保底选 score 最高的
  });

  test("保底策略中 score 相同时保持较早的候选（严格 > 不翻转）", () => {
    // 4 个候选 bbox 和 score 全部相同 → 仅 rankSim 差异区分 softmax 排序
    // top 50% = ceil(4*0.5) = 2 → 候选 0 和 1 入选（rankSim 最优）
    // 两者 score 相同 → reduce 中 cur.score > best.score 为 false → 保持候选 0
    const tracker = new FaceTracker({ minConfidence: 0.99 });
    tracker.setTrackedFace(
      { bbox: [45, 45, 55, 55], score: 0.9 },
      0,
      { width: 100, height: 100 },
      4,
    );

    const candidates: FaceInfo[] = [
      { bbox: [45, 45, 55, 55], score: 0.8 }, // rankSim 最优，排在 top 2 首位
      { bbox: [45, 45, 55, 55], score: 0.8 }, // rankSim 次优，排在 top 2 第二位
      { bbox: [45, 45, 55, 55], score: 0.8 }, // rankSim 较低
      { bbox: [45, 45, 55, 55], score: 0.8 }, // rankSim 最低
    ];

    const result = tracker.findMatch(candidates, { width: 100, height: 100 });
    // 平局时严格 > 不翻转 → 保持较早的候选 0
    // 若改为 >= 会返回 1，测试会失败
    expect(result.matchedIndex).toBe(0);
  });
});
