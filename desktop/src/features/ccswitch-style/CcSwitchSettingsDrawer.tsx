import type { ReactNode } from "react";

type CcSwitchSettingsDrawerProps = {
  title: string;
  message: string;
  messageBad?: boolean;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
};

export function CcSwitchSettingsDrawer({
  title,
  message,
  messageBad,
  closeLabel,
  onClose,
  children
}: CcSwitchSettingsDrawerProps) {
  return (
    <section className="ccs-settings-drawer" aria-label={title}>
      <div className="ccs-settings-heading">
        <div>
          <h2>{title}</h2>
          <span className={messageBad ? "ccs-drawer-message bad" : "ccs-drawer-message"}>
            {message}
          </span>
        </div>
        <button className="ccs-drawer-close" onClick={onClose} type="button">
          {closeLabel}
        </button>
      </div>
      {children}
    </section>
  );
}
