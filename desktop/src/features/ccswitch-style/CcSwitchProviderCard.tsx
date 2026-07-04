import { formatAliasTitle, type AccountAlias } from "../account-switcher/accountTypes";
import { useI18n } from "../../i18n/i18n";

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

function Icon({ name }: { name: "check" | "copy" | "drag" | "edit" | "play" | "trash" }) {
  if (name === "drag") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="9" cy="6" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="18" r="1" /><circle cx="15" cy="6" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="18" r="1" /></svg>;
  }
  if (name === "play") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m8 5 11 7-11 7V5Z" /></svg>;
  }
  if (name === "check") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m20 6-11 11-5-5" /></svg>;
  }
  if (name === "edit") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
  }
  if (name === "trash") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /></svg>;
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24"><rect height="14" rx="2" width="14" x="8" y="8" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>;
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
          <Icon name="drag" />
        </span>

        <div className="ccs-provider-avatar" title={providerTitle(provider)}>
          {providerInitial(provider)}
        </div>

        <div className="ccs-provider-body">
          <div className="ccs-provider-title-row">
            <h3>{providerTitle(provider)}</h3>
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
                <Icon name="play" />
                <span>{switching ? t("common.switching") : t("provider.enable")}</span>
              </button>
            )}
            {onEdit && (
              <button className="ccs-action-icon" onClick={() => onEdit(provider.name)} title={t("provider.edit")} type="button">
                <Icon name="edit" />
              </button>
            )}
            <button className="ccs-action-icon" onClick={() => onCopy(provider)} title={t("provider.copyInfo")} type="button">
              <Icon name="copy" />
            </button>
            {onDelete && (
              <button className="ccs-action-icon danger" onClick={() => onDelete(provider.name)} title={t("provider.delete")} type="button">
                <Icon name="trash" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
