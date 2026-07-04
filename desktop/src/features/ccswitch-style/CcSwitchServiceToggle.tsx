/**
 * Service toggle for the ModelGate header.
 * Ported from CC Switch's ProxyToggle / ClaudeDesktopRouteToggle:
 *   flex items-center gap-1 px-1.5 h-8 rounded-lg bg-muted/50
 *   Radio icon (animated green when running) + Switch
 */
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

function RadioIcon({ active, className }: { active: boolean; className?: string }) {
  // Signal/radio SVG equivalent to lucide Radio icon.
  return (
    <svg
      aria-hidden="true"
      className={[
        "ccs-toggle-icon",
        active ? "is-active" : "",
        className ?? ""
      ].filter(Boolean).join(" ")}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      {/* lucide:radio waves */}
      <path d="M2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10S2 17.523 2 12z" opacity="0" />
      <path d="M6.343 6.343a8 8 0 1 0 11.314 11.314" />
      <path d="M17.657 6.343a8 8 0 0 1 0 11.314" opacity="0.6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      aria-hidden="true"
      className="ccs-toggle-spinner"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width="16"
      height="16"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

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
        <SpinnerIcon />
      ) : (
        <RadioIcon active={isRunning && !isExternal} />
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
