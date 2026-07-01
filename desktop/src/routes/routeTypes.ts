import type { TranslationKey } from "../i18n/i18n";

export type AppRouteId = "switcher" | "settings" | "logs" | "advanced";

export type AppRoute = {
  id: AppRouteId;
  i18nKey: TranslationKey;
};
