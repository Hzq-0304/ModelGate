import type { TranslationKey } from "../../i18n/i18n";

export type SettingsSectionId =
  | "common"
  | "integrations"
  | "providers"
  | "aliases"
  | "entrypoints"
  | "pricing"
  | "records"
  | "advanced"
  | "language";

export type SettingsGroup = {
  id: string;
  i18nKey: TranslationKey;
  sections: Array<{
    id: SettingsSectionId;
    i18nKey: TranslationKey;
  }>;
};

export const settingsGroups: SettingsGroup[] = [
  {
    id: "common",
    i18nKey: "settings.common",
    sections: [
      { id: "common", i18nKey: "settings.server" }
    ]
  },
  {
    id: "integrations",
    i18nKey: "settings.integrations",
    sections: [
      { id: "integrations", i18nKey: "settings.integrations" }
    ]
  },
  {
    id: "model-routing",
    i18nKey: "settings.modelRouting",
    sections: [
      { id: "providers", i18nKey: "settings.providers" },
      { id: "aliases", i18nKey: "settings.aliases" },
      { id: "entrypoints", i18nKey: "settings.entrypoints" },
      { id: "pricing", i18nKey: "settings.pricing" }
    ]
  },
  {
    id: "billing-usage",
    i18nKey: "settings.records",
    sections: [
      { id: "records", i18nKey: "settings.logs" }
    ]
  },
  {
    id: "advanced",
    i18nKey: "settings.advanced",
    sections: [
      { id: "advanced", i18nKey: "settings.diagnostics" },
      { id: "language", i18nKey: "settings.language" }
    ]
  }
];
