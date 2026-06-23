/**
 * 错误信息提取逻辑单元测试
 * =========================
 * 锁定 toErrMsg 对未知类型异常的安全提取行为。
 * 该 helper 取代散落在 19 处的 `catch (e: any) { e?.message ?? e }` 模式，
 * 将 catch 变量从 any 收敛为 unknown 后，所有错误信息提取都经由这里，
 * 因此必须覆盖 Error / 非 Error / 空值等边界，避免日志与错误提示回归。
 */
import { toErrMsg } from "@/lib/error-utils";

describe("toErrMsg", () => {
  test("Error 实例返回其 message", () => {
    // 标准 Error 对象，直接取 message，与旧 e.message 行为一致
    expect(toErrMsg(new Error("boom"))).toBe("boom");
  });

  test("Error 子类同样返回 message", () => {
    // better-sqlite3 / Node 原生错误多为 Error 子类（如 TypeError），必须兼容
    expect(toErrMsg(new TypeError("bad type"))).toBe("bad type");
  });

  test("字符串原样返回", () => {
    // 部分 IPC / 第三方库会 throw 字符串而非 Error，需保持透传
    expect(toErrMsg("plain string")).toBe("plain string");
  });

  test("数字转为字符串", () => {
    // 防御：极少数代码会 throw 数字，不能返回 "[object Object]" 之类的噪音
    expect(toErrMsg(42)).toBe("42");
  });

  test("普通对象走 String() 转换", () => {
    // 非 Error 对象没有可靠的 message，统一用 String() 兜底，
    // 与旧 `e?.message ?? e` 中 message 为 undefined 时回退到 e 的行为对齐
    expect(toErrMsg({ code: 500 })).toBe("[object Object]");
  });

  test("null 返回字符串 'null' 而非抛异常", () => {
    // catch 变量理论上不会是 null，但 helper 必须对任何输入都不抛
    expect(toErrMsg(null)).toBe("null");
  });

  test("undefined 返回字符串 'undefined' 而非抛异常", () => {
    // 同上，保证 toErrMsg 自身永不抛异常是日志/错误处理链路的不变量
    expect(toErrMsg(undefined)).toBe("undefined");
  });

  test("带 message 属性的鸭子类型对象不当作 Error（避免误信）", () => {
    // 故意只判断 instanceof Error：普通对象即使有 message 字段也不可信，
    // 走 String() 兜底，避免把任意 { message } 当成真实错误信息输出
    expect(toErrMsg({ message: "fake" })).toBe("[object Object]");
  });
});
