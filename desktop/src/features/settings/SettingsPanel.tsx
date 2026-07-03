import type { TranslationKey } from "../../i18n/i18n";
import type { SettingsSectionId } from "./settingsRoutes";
import { settingsGroups } from "./settingsRoutes";
import { useI18n } from "../../i18n/i18n";

type SettingsPanelProps = {
  activeSection: SettingsSectionId;
  configPath: string;
  onSelectSection: (section: SettingsSectionId) => void;
};

export function SettingsPanel({
  activeSection,
  configPath,
  onSelectSection
}: SettingsPanelProps) {
  const { t } = useI18n();

  function renderSectionButton(section: { id: SettingsSectionId; i18nKey: TranslationKey }) {
    return (
      <button
        className={activeSection === section.id ? "secondary active" : "secondary"}
        key={section.id}
        type="button"
        onClick={() => onSelectSection(section.id)}
      >
        {t(section.i18nKey)}
      </button>
    );
  }

  return (
    <section className="settings-groups">
      {settingsGroups.map((group) => (
        <article className="settings-group-card" key={group.id}>
          <strong>{t(group.i18nKey)}</strong>
          <div>{group.sections.map(renderSectionButton)}</div>
        </article>
      ))}
      <span className="settings-config-path">{configPath || t("config.notLoaded")}</span>
    </section>
  );
}
