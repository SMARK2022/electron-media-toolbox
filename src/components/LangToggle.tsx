import { setAppLanguage } from "@/helpers/language_helpers";
import langs from "@/localization/langs";

import { useTranslation } from "react-i18next";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

export default function LangToggle() {
  const { t, i18n } = useTranslation();
  const currentLang = i18n.language;

  function onValueChange(value: string) {
    setAppLanguage(value, i18n);
  }

  return (
    // aria-label 必填：ToggleGroup 内仅含图标+文字，读屏器需语义分组名
    <ToggleGroup
      type="single"
      onValueChange={onValueChange}
      value={currentLang}
      aria-label={t("common.language")}
    >
      {langs.map((lang) => (
        <ToggleGroupItem key={lang.key} value={lang.key}>
          {`${lang.prefix} ${lang.nativeName}`}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
