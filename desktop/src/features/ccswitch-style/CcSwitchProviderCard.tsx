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

function providerInitial(provider: AccountAlias) {
  return formatAliasTitle(provider.name).charAt(0).toUpperCase() || "M";
}

function providerSubtitle(provider: AccountAlias) {
  return provider.baseUrl
    ?? provider.description
    ?? provider.providerDescription
    ?? provider.model;
}

function Icon({ name }: { name: "check" | "copy" | "drag" | "edit" | "play" | "trash" }) {
  if (name === "drag") {
    return <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9 5h.01" /><path d="M9 12h.01" /><path d="M9 19h.01" /><path d="M15 5h.01" /><path d="M15 12h.01" /><path d="M15 19h.01" /></svg>;
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
  connectionState,
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
  const statusText = switching
    ? t("common.switching")
    : authWarning
      ? t("switcher.status.missingAuth")
      : connectionState === "disconnected"
        ? t("switcher.status.offline")
        : connectionState === "checking"
          ? t("app.checking")
          : t("switcher.status.ready");
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
        <button className="ccs-drag-handle" disabled type="button" aria-label="Drag handle">
          <Icon name="drag" />
        </button>

        <div className="ccs-provider-avatar" title={formatAliasTitle(provider.name)}>
          {providerInitial(provider)}
        </div>

        <div className="ccs-provider-body">
          <div className="ccs-provider-title-row">
            <h3>{formatAliasTitle(provider.name)}</h3>
            {provider.providerType === "mock" && (
              <span className="ccs-mini-badge">{t("switcher.managedLocal")}</span>
            )}
          </div>
          <div className="ccs-provider-url" title={subtitle}>{subtitle}</div>
          <div className="ccs-provider-meta">
            <span>{provider.provider}</span>
            <span>{provider.model}</span>
          </div>
        </div>
        </div>

        <div className="ccs-provider-right">
          <div className="ccs-provider-idle">
            <span className={[
              "ccs-status-badge",
              authWarning ? "warning" : "",
              connectionState !== "connected" && !authWarning ? "muted" : ""
            ].filter(Boolean).join(" ")}
            >
              {statusText}
            </span>
            {isCurrent && <span className="ccs-current-dot" aria-hidden="true" />}
          </div>

          <div className="ccs-provider-actions" aria-label={t("provider.more")}>
            <button
              className={isCurrent ? "ccs-action-main is-current" : "ccs-action-main"}
              disabled={!canSwitch}
              onClick={() => onSwitch(provider.name)}
              title={isCurrent ? t("provider.ready") : t("provider.setActive")}
              type="button"
            >
              <Icon name={isCurrent ? "check" : "play"} />
              <span>{isCurrent ? t("provider.ready") : t("provider.setActive")}</span>
            </button>
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
