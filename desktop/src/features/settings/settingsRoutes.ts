import type { TranslationKey } from "../../i18n/i18n";

export type SettingsSectionId = "providers" | "aliases" | "entrypoints" | "integrations" | "pricing";

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
      { id: "entrypoints", i18nKey: "settings.entrypoints" }
    ]
  },
  {
    id: "billing-usage",
    i18nKey: "settings.billingUsage",
    sections: [
      { id: "pricing", i18nKey: "settings.pricing" }
    ]
  }
];
