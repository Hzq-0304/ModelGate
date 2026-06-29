import { useI18n } from "../i18n/i18n";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();

  return (
    <label className="language-selector">
      <span>{t("language.label")}</span>
      <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
        <option value="en">{t("language.en")}</option>
        <option value="zh-CN">{t("language.zhCN")}</option>
      </select>
    </label>
  );
}
