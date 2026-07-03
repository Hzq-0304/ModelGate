import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/i18n";

type CcSwitchConfirmModalProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  checkboxLabel?: string;
  checkboxDefault?: boolean;
  onCancel: () => void;
  onConfirm: (checkboxChecked: boolean) => void;
};

export function CcSwitchConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  busy = false,
  checkboxLabel,
  checkboxDefault = false,
  onCancel,
  onConfirm
}: CcSwitchConfirmModalProps) {
  const { t } = useI18n();
  const [checked, setChecked] = useState(checkboxDefault);

  useEffect(() => {
    if (open) {
      setChecked(checkboxDefault);
    }
  }, [open, checkboxDefault]);

  if (!open) {
    return null;
  }

  return (
    <div className="ccs-modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}>
      <div className="ccs-modal ccs-confirm-modal" role="alertdialog" aria-label={title}>
        <div className="ccs-confirm-body">
          <h3>{title}</h3>
          <p>{message}</p>
          {checkboxLabel && (
            <label className="ccs-confirm-check">
              <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
              <span>{checkboxLabel}</span>
            </label>
          )}
        </div>
        <div className="ccs-modal-footer ccs-confirm-footer">
          <button className="ccs-modal-btn secondary" onClick={onCancel} type="button">
            {cancelLabel ?? t("common.cancel")}
          </button>
          <button className="ccs-modal-btn danger" onClick={() => onConfirm(checkboxLabel ? checked : false)} type="button" disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
