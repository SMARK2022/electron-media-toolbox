// 导入 i18n 以初始化 react-i18next——ToggleTheme 改用 useTranslation 后需要 t() 可用
import "@/localization/i18n";
import { render } from "@testing-library/react";
import ToggleTheme from "@/components/ToggleTheme";

test("renders ToggleTheme", () => {
  const { getByRole } = render(<ToggleTheme />);
  const isButton = getByRole("button");

  expect(isButton).toBeInTheDocument();
});

test("has icon", () => {
  const { getByRole } = render(<ToggleTheme />);
  const button = getByRole("button");
  const icon = button.querySelector("svg");

  expect(icon).toBeInTheDocument();
});

test("is moon icon", () => {
  const svgIconClassName: string = "lucide-moon";
  const { getByRole } = render(<ToggleTheme />);
  const svg = getByRole("button").querySelector("svg");

  expect(svg?.classList).toContain(svgIconClassName);
});

// a11y：图标按钮必须有无障碍名称，否则读屏器仅读出"button"
test("图标按钮有非空 aria-label", () => {
  const { getByRole } = render(<ToggleTheme />);
  const button = getByRole("button");

  // aria-label 非空——屏幕阅读器据此播报按钮用途
  expect(button.getAttribute("aria-label")).toBeTruthy();
});
