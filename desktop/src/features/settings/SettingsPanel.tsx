import type { ReactNode } from "react";
import type { TranslationKey } from "../../i18n/i18n";
import type { SettingsSectionId } from "./settingsRoutes";
import { settingsGroups } from "./settingsRoutes";
import { LanguageSelector } from "../../components/LanguageSelector";
import { useI18n } from "../../i18n/i18n";

type SettingsPanelProps = {
  activeSection: SettingsSectionId;
  busyAction: string | null;
  configPath: string;
  disconnected: boolean;
  onOpenCcSwitchImport: () => void;
  onOpenCodexImport: () => void;
  onOpenLogs: () => void;
  onReload: () => void;
  onSelectSection: (section: SettingsSectionId) => void;
};

export function SettingsPanel({
  activeSection,
  busyAction,
  configPath,
  disconnected,
  onOpenCcSwitchImport,
  onOpenCodexImport,
  onOpenLogs,
  onReload,
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

  const groupActions: Record<string, ReactNode> = {
    integrations: (
      <>
        <button className="secondary" type="button" onClick={onOpenCcSwitchImport}>
          {t("settings.importFromCcSwitch")}
        </button>
        <button className="secondary" type="button" onClick={onOpenCodexImport}>
          {t("settings.importToCodex")}
        </button>
      </>
    ),
    "model-routing": settingsGroups
      .find((group) => group.id === "model-routing")
      ?.sections.map(renderSectionButton),
    "billing-usage": (
      <>
        {settingsGroups
          .find((group) => group.id === "billing-usage")
          ?.sections.map(renderSectionButton)}
        <button className="secondary" type="button" onClick={onOpenLogs}>
          {t("settings.usageRecords")}
        </button>
      </>
    )
  };

  return (
    <section className="settings-groups">
      {settingsGroups.map((group) => (
        <article className="settings-group-card" key={group.id}>
          <strong>{t(group.i18nKey)}</strong>
          <div>{groupActions[group.id]}</div>
        </article>
      ))}
      <article className="settings-group-card">
        <strong>{t("settings.application")}</strong>
        <div>
          <LanguageSelector />
          <button className="secondary" type="button" onClick={onReload} disabled={busyAction !== null || disconnected}>
            {busyAction === "reload" ? t("config.reloading") : t("settings.reloadConfig")}
          </button>
        </div>
        <span>{configPath || t("config.notLoaded")}</span>
      </article>
    </section>
  );
}
