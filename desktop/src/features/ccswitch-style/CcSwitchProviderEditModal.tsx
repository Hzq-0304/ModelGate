import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/i18n";
import { formatAliasTitle, type AccountAlias, type ProviderAuthKind } from "../account-switcher/accountTypes";

export type ProviderEditPatch = {
  originalAlias: string;
  originalProvider: string;
  aliasName: string;
  displayName: string;
  providerName: string;
  model: string;
  baseUrl: string;
  description: string;
  envName: string;
  authKind: ProviderAuthKind;
};

type CcSwitchProviderEditModalProps = {
  open: boolean;
  alias: AccountAlias | null;
  providerNames: string[];
  busy: boolean;
  message: string;
  messageBad?: boolean;
  onClose: () => void;
  onSave: (patch: ProviderEditPatch) => void;
};

type FormState = {
  aliasName: string;
  displayName: string;
  providerName: string;
  model: string;
  baseUrl: string;
  description: string;
  envName: string;
};

function initialForm(alias: AccountAlias | null): FormState {
  return {
    aliasName: alias?.name ?? "",
    displayName: alias?.displayName ?? "",
    providerName: alias?.provider ?? "",
    model: alias?.model ?? "",
    baseUrl: alias?.providerType === "openai-compatible" ? alias?.baseUrl ?? "" : "",
    description: alias?.description ?? "",
    envName: alias?.envName ?? ""
  };
}

export function CcSwitchProviderEditModal({
  open,
  alias,
  providerNames,
  busy,
  message,
  messageBad,
  onClose,
  onSave
}: CcSwitchProviderEditModalProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState>(() => initialForm(alias));

  useEffect(() => {
    if (open) {
      setForm(initialForm(alias));
    }
  }, [open, alias]);

  if (!open || !alias) {
    return null;
  }

  const currentAlias = alias;
  const authKind: ProviderAuthKind = currentAlias.authKind ?? "env";
  const isMock = currentAlias.providerType === "mock";
  const managedAuth = authKind === "ccswitch" || authKind === "ccswitch-snapshot" || authKind === "static-header-ref";
  const canEditEnv = !isMock && !managedAuth;
  const title = isMock ? t("providerEdit.titleAlias") : t("providerEdit.title");

  function update(patch: Partial<FormState>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onSave({
      originalAlias: currentAlias.name,
      originalProvider: currentAlias.provider,
      aliasName: form.aliasName,
      displayName: form.displayName,
      providerName: form.providerName,
      model: form.model,
      baseUrl: form.baseUrl,
      description: form.description,
      envName: form.envName,
      authKind
    });
  }

  return (
    <div className="ccs-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="ccs-modal ccs-edit-modal" onSubmit={handleSubmit}>
        <div className="ccs-modal-header">
          <div>
            <h3>{title}</h3>
            <span className="ccs-modal-subtitle">{form.displayName.trim() || formatAliasTitle(alias.name)}</span>
          </div>
          <button className="ccs-drawer-close" onClick={onClose} type="button">
            {t("common.close")}
          </button>
        </div>

        <div className="ccs-edit-grid">
          <label>
            {t("providerEdit.aliasName")}
            <input value={form.aliasName} onChange={(event) => update({ aliasName: event.target.value })} autoFocus />
          </label>
          <label>
            {t("providerEdit.displayName")}
            <input value={form.displayName} onChange={(event) => update({ displayName: event.target.value })} placeholder={formatAliasTitle(alias.name)} />
          </label>
          <label>
            {t("providerEdit.provider")}
            <input
              value={form.providerName}
              onChange={(event) => update({ providerName: event.target.value })}
              list="ccs-edit-provider-options"
            />
            <datalist id="ccs-edit-provider-options">
              {providerNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>
          <label>
            {t("providerEdit.model")}
            <input value={form.model} onChange={(event) => update({ model: event.target.value })} />
          </label>
          {!isMock && (
            <label className="ccs-edit-span">
              {t("providerEdit.baseUrl")}
              <input value={form.baseUrl} onChange={(event) => update({ baseUrl: event.target.value })} placeholder="https://api.example.com/v1" />
            </label>
          )}
          <label className="ccs-edit-span">
            {t("providerEdit.description")}
            <textarea value={form.description} onChange={(event) => update({ description: event.target.value })} rows={2} />
          </label>
          {canEditEnv && (
            <label className="ccs-edit-span">
              {t("providerEdit.envName")}
              <input value={form.envName} onChange={(event) => update({ envName: event.target.value })} placeholder="OPENAI_API_KEY" />
            </label>
          )}
        </div>

        {managedAuth && (
          <div className="ccs-edit-readonly">
            <span>{t("providerEdit.authSource")}</span>
            <strong>{alias.authSource ?? t("providerEdit.authManaged")}</strong>
            <p className="ccs-modal-hint">{t("providerEdit.authHint")}</p>
          </div>
        )}

        <div className="ccs-modal-footer">
          <span className={messageBad ? "ccs-modal-message bad" : "ccs-modal-message"}>{message}</span>
          <div className="ccs-modal-footer-actions">
            <button className="ccs-modal-btn secondary" onClick={onClose} type="button">
              {t("common.cancel")}
            </button>
            <button className="ccs-modal-btn" type="submit" disabled={busy}>
              {busy ? t("providerEdit.saving") : t("providerEdit.save")}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
