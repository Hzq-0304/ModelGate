import { formatAliasTitle, type AccountAlias } from "../account-switcher/accountTypes";
import { useI18n } from "../../i18n/i18n";
import { Copy, Edit, GripVertical, Play, Trash2 } from "lucide-react";

type CcSwitchProviderCardProps = {
  provider: AccountAlias;
  isCurrent: boolean;
  connectionState: "checking" | "connected" | "disconnected";
  disabled: boolean;
  authWarning?: string;
  switching: boolean;
  onCopy: (provider: AccountAlias) => void;
  onDelete?: (alias: string) => void;
  onEdit?: (alias: string) => void;
  onSwitch: (alias: string) => void;
};

function providerTitle(provider: AccountAlias) {
  return provider.displayName?.trim() || formatAliasTitle(provider.name);
}

function providerInitial(provider: AccountAlias) {
  return providerTitle(provider).charAt(0).toUpperCase() || "M";
}

function providerSubtitle(provider: AccountAlias) {
  return provider.baseUrl
    ?? provider.description
    ?? provider.providerDescription
    ?? provider.model;
}

export function CcSwitchProviderCard({
  provider,
  isCurrent,
  disabled,
  authWarning,
  switching,
  onCopy,
  onDelete,
  onEdit,
  onSwitch
}: CcSwitchProviderCardProps) {
  const { t } = useI18n();
  const subtitle = providerSubtitle(provider);
  const canSwitch = !disabled && !isCurrent;
  const showTitle = provider.providerType !== "mock";

  return (
    <div
      className={[
        "ccs-provider-card",
        "group",
        isCurrent ? "is-current" : "",
        authWarning ? "has-warning" : ""
      ].filter(Boolean).join(" ")}
      aria-current={isCurrent ? "true" : undefined}
    >
      <div className="ccs-provider-active-layer" />
      <div className="ccs-provider-content">
        <div className="ccs-provider-left">
        <span className="ccs-drag-handle" aria-hidden="true">
          <GripVertical />
        </span>

        <div className="ccs-provider-avatar" title={providerTitle(provider)}>
          {providerInitial(provider)}
        </div>

        <div className="ccs-provider-body">
          <div className="ccs-provider-title-row">
            {showTitle && <h3>{providerTitle(provider)}</h3>}
            {provider.providerType === "mock" && (
              <span className="ccs-mini-badge">{t("switcher.managedLocal")}</span>
            )}
            {authWarning && (
              <span className="ccs-mini-badge warning" title={authWarning}>{authWarning}</span>
            )}
          </div>
          <div className="ccs-provider-url" title={subtitle}>{subtitle}</div>
        </div>
        </div>

        <div className="ccs-provider-right">
          <div className="ccs-provider-idle">
            {isCurrent && <span className="ccs-current-dot" aria-hidden="true" />}
          </div>

          <div className="ccs-provider-actions" aria-label={t("provider.more")}>
            {!isCurrent && (
              <button
                className="ccs-action-main"
                disabled={!canSwitch}
                onClick={() => onSwitch(provider.name)}
                title={t("provider.enable")}
                type="button"
              >
                <Play />
                <span>{switching ? t("common.switching") : t("provider.enable")}</span>
              </button>
            )}
            {onEdit && (
              <button className="ccs-action-icon" onClick={() => onEdit(provider.name)} title={t("provider.edit")} type="button">
                <Edit />
              </button>
            )}
            <button className="ccs-action-icon" onClick={() => onCopy(provider)} title={t("provider.copyInfo")} type="button">
              <Copy />
            </button>
            {onDelete && (
              <button className="ccs-action-icon danger" onClick={() => onDelete(provider.name)} title={t("provider.delete")} type="button">
                <Trash2 />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
