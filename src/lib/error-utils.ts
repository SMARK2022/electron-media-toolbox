/**
 * 安全提取未知类型异常的可读信息。
 *
 * 用于取代散落在 catch 块里的 `e?.message ?? e` 模式：当 catch 变量
 * 从 `any` 收敛为 `unknown` 后，TS 不再允许直接读取 `.message`，
 * 统一经由此 helper 做类型收窄。
 *
 * 不变量：对任何输入都不会抛异常——它本身处于错误处理链路中，
 * 再抛异常会导致日志/退出清理逻辑二次失败。
 */
export function toErrMsg(e: unknown): string {
  // 仅信任真正的 Error（含子类），普通对象即便带 message 字段也不可靠
  if (e instanceof Error) return e.message;
  // 字符串/数字/null/undefined/对象统一走 String() 兜底，
  // 与旧 `e?.message ?? e` 在 message 为 undefined 时的回退语义对齐
  return String(e);
}
