/**
 * 眨眼状态判定逻辑单元测试
 * =========================
 * 锁定 getEyeState 在阈值边界（0.35 / 0.6）的精确语义，
 * 防止后续重构时 `<` 与 `<=` 混淆导致判定偏移。
 */
import {
  getEyeState,
  countEyeStates,
  EYE_THRESHOLD_CLOSED,
  EYE_THRESHOLD_SUSPICIOUS,
} from "@/helpers/store/usePhotoFilterStore";

// ============================================================================
// 阈值常量回归契约
// ============================================================================
describe("眨眼阈值常量", () => {
  test("闭眼阈值为 0.35，疑似阈值为 0.6", () => {
    // 这两个常量被 store、FaceStripBar、PhotoDetailsTable 多处引用，
    // 改动会导致全链路判定不一致，必须锁定
    expect(EYE_THRESHOLD_CLOSED).toBe(0.35);
    expect(EYE_THRESHOLD_SUSPICIOUS).toBe(0.6);
  });
});

// ============================================================================
// getEyeState 边界语义
// 关键不变量：v < 0.35 → closed；0.35 <= v <= 0.6 → suspicious；v > 0.6 → open
// ============================================================================
describe("getEyeState 阈值边界", () => {
  test("undefined 默认为 1.0 → open（未检测到眼睛视为正常）", () => {
    expect(getEyeState(undefined)).toBe("open");
  });

  test("恰好 0.35 → suspicious（闭眼阈值用 < 不含等号）", () => {
    // 0.35 不满足 < 0.35，落入 <= 0.6 分支 → suspicious
    expect(getEyeState(0.35)).toBe("suspicious");
  });

  test("恰好 0.6 → suspicious（疑似阈值用 <= 含等号）", () => {
    expect(getEyeState(0.6)).toBe("suspicious");
  });

  test("0.349 → closed（刚低于闭眼阈值）", () => {
    expect(getEyeState(0.349)).toBe("closed");
  });

  test("0.601 → open（刚高于疑似阈值）", () => {
    expect(getEyeState(0.601)).toBe("open");
  });

  test("负数 → closed（异常值不导致误判为 open）", () => {
    expect(getEyeState(-1)).toBe("closed");
  });

  test("1.0 → open（完全睁眼）", () => {
    expect(getEyeState(1.0)).toBe("open");
  });

  test("0 → closed（完全闭眼）", () => {
    expect(getEyeState(0)).toBe("closed");
  });
});

// ============================================================================
// countEyeStates 聚合统计
// ============================================================================
describe("countEyeStates 统计", () => {
  test("空数组返回全零", () => {
    expect(countEyeStates([])).toEqual({ closed: 0, suspicious: 0, open: 0 });
  });

  test("混合状态正确分类计数", () => {
    const faces = [
      { eye_open: 0.1 }, // closed
      { eye_open: 0.5 }, // suspicious
      { eye_open: 0.9 }, // open
      { eye_open: 0.35 }, // suspicious（边界）
      { eye_open: 0 }, // closed
    ];
    expect(countEyeStates(faces)).toEqual({
      closed: 2,
      suspicious: 2,
      open: 1,
    });
  });

  test("缺失 eye_open 字段计为 open（undefined → 默认 1.0）", () => {
    // 后端可能返回不含 eye_open 的人脸数据，不应导致统计异常
    const faces = [{ score: 0.9 }, { eye_open: 0.2 }, {}];
    const result = countEyeStates(faces);
    expect(result.closed).toBe(1);
    expect(result.open).toBe(2); // 两个缺失 eye_open 的都计为 open
  });
});
