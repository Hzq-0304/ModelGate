/**
 * Service toggle for the ModelGate header.
 * Ported from CC Switch's ProxyToggle / ClaudeDesktopRouteToggle:
 *   flex items-center gap-1 px-1.5 h-8 rounded-lg bg-muted/50
 *   Radio icon (animated green when running) + Switch
 */
import { Loader2, Radio } from "lucide-react";
import { useI18n } from "../../i18n/i18n";

type ServerLifecycle =
  | "stopped"
  | "starting"
  | "running"
  | "stopping"
  | "failed"
  | "external-running";

type CcSwitchServiceToggleProps = {
  lifecycle: ServerLifecycle;
  busy: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function CcSwitchServiceToggle({
  lifecycle,
  busy,
  onStart,
  onStop
}: CcSwitchServiceToggleProps) {
  const { t } = useI18n();

  const isRunning = lifecycle === "running" || lifecycle === "external-running";
  const isExternal = lifecycle === "external-running";
  const isTransitioning = lifecycle === "starting" || lifecycle === "stopping";
  const isDisabled = busy || isTransitioning || isExternal;
  const checked = isRunning || isTransitioning;

  const tooltipText = isExternal
    ? t("serviceToggle.external")
    : isRunning
      ? t("serviceToggle.running")
      : isTransitioning
        ? t("serviceToggle.transitioning")
        : t("serviceToggle.stopped");

  function handleChange() {
    if (isDisabled) return;
    if (checked) {
      onStop();
    } else {
      onStart();
    }
  }

  return (
    <div
      className={["ccs-service-toggle", isExternal ? "is-external" : ""].filter(Boolean).join(" ")}
      data-tauri-no-drag
      title={tooltipText}
    >
      {isTransitioning || busy ? (
        <Loader2 className="ccs-toggle-spinner" />
      ) : (
        <Radio className={["ccs-toggle-icon", isRunning && !isExternal ? "is-active" : ""].filter(Boolean).join(" ")} />
      )}
      <button
        aria-checked={checked}
        aria-label={tooltipText}
        className={["ccs-toggle-switch", checked ? "is-on" : ""].filter(Boolean).join(" ")}
        disabled={isDisabled}
        data-tauri-no-drag
        onClick={handleChange}
        role="switch"
        type="button"
      >
        <span className="ccs-toggle-thumb" />
      </button>
    </div>
  );
}
