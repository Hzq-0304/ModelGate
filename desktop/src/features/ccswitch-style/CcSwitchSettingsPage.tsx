import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import type { TranslationKey } from "../../i18n/i18n";
import { useI18n } from "../../i18n/i18n";

export type SettingsPageTabId =
  | "general"
  | "integrations"
  | "modelRouting"
  | "records"
  | "advanced"
  | "about";

type SettingsPageTab = {
  id: SettingsPageTabId;
  i18nKey: TranslationKey;
};

type CcSwitchSettingsPageProps = {
  activeTab: SettingsPageTabId;
  children: ReactNode;
  message?: string;
  messageBad?: boolean;
  onBack: () => void;
  onSelectTab: (tab: SettingsPageTabId) => void;
  tabs: SettingsPageTab[];
  title: string;
};

export function CcSwitchSettingsPage({
  activeTab,
  children,
  message,
  messageBad,
  onBack,
  onSelectTab,
  tabs,
  title
}: CcSwitchSettingsPageProps) {
  const { t } = useI18n();

  return (
    <main className="ccs-settings-page">
      <header className="ccs-settings-page-header" data-tauri-drag-region>
        <button
          aria-label={t("settings.back")}
          className="ccs-settings-back"
          data-tauri-no-drag
          onClick={onBack}
          title={t("settings.back")}
          type="button"
        >
          <ArrowLeft />
        </button>
        <div className="ccs-settings-title">
          <h1>{title}</h1>
          {message && (
            <span className={messageBad ? "ccs-settings-message bad" : "ccs-settings-message"}>
              {message}
            </span>
          )}
        </div>
      </header>

      <nav className="ccs-settings-tabs" aria-label={title}>
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "is-active" : ""}
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            type="button"
          >
            {t(tab.i18nKey)}
          </button>
        ))}
      </nav>

      <section className="ccs-settings-page-content">
        {children}
      </section>
    </main>
  );
}
