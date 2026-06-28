import { Button } from "@/components/ui/button";
import { toggleTheme } from "@/helpers/theme_helpers";
import { Moon } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ToggleTheme() {
  const { t } = useTranslation();
  return (
    // aria-label 必填：按钮内仅有图标，读屏器无文字可播报
    <Button
      onClick={toggleTheme}
      size="icon"
      aria-label={t("common.toggleTheme")}
    >
      <Moon size={16} />
    </Button>
  );
}
