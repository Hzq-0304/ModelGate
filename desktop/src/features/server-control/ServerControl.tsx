import type { ServerProcessStatus } from "../../api";
import { useI18n } from "../../i18n/i18n";

type ServerControlProps = {
  busyAction: string | null;
  serverProcess: ServerProcessStatus | null;
  serverUrl: string;
  onRefresh: () => void;
  onRestart: () => void;
  onStart: () => void;
  onStop: () => void;
};

function lifecycleFromStatus(serverProcess: ServerProcessStatus | null) {
  return serverProcess?.status ?? "stopped";
}

export function ServerControl({
  busyAction,
  serverProcess,
  serverUrl,
  onRefresh,
  onRestart,
  onStart,
  onStop
}: ServerControlProps) {
  const { t } = useI18n();
  const lifecycle = lifecycleFromStatus(serverProcess);
  const isStarting = lifecycle === "starting";
  const isStopping = lifecycle === "stopping";
  const isExternal = lifecycle === "external-running";
  const canStop = serverProcess?.canStop ?? false;
  const canStart = lifecycle === "stopped" || lifecycle === "failed";
  const serverBusy = (busyAction?.startsWith("server:") ?? false) || isStarting || isStopping;
  const startupLog = serverProcess?.startupLog ?? [];
  const recentStderr = serverProcess?.recentStderr ?? [];

  const statusText = lifecycle === "running" || lifecycle === "external-running"
    ? t("advanced.running")
    : lifecycle === "starting"
      ? t("advanced.starting")
      : lifecycle === "stopping"
        ? t("advanced.stopping")
        : lifecycle === "failed"
          ? t("advanced.failed")
          : lifecycle === "stopped"
            ? t("advanced.stopped")
            : t("advanced.unknown");

  const launchModeText = lifecycle === "external-running"
    ? t("advanced.external")
    : lifecycle === "running" || lifecycle === "starting" || lifecycle === "stopping"
      ? t("advanced.managed")
      : lifecycle === "failed"
        ? t("advanced.failed")
        : lifecycle === "stopped"
          ? t("advanced.notRunning")
          : t("advanced.unknown");

  return (
    <section className="card server-card" id="server-control">
      <div className="card-heading">
        <span>{t("advanced.serverControl")}</span>
        <strong>{statusText}</strong>
      </div>
      <dl className="server-details">
        <div>
          <dt>{t("common.status")}</dt>
          <dd>{statusText}</dd>
        </div>
        <div>
          <dt>{t("advanced.launchMode")}</dt>
          <dd>{launchModeText}</dd>
        </div>
        <div>
          <dt>{t("config.endpoint")}</dt>
          <dd>{serverProcess?.endpoint ?? serverUrl}</dd>
        </div>
        <div>
          <dt>{t("advanced.pid")}</dt>
          <dd>{serverProcess?.pid ?? t("advanced.none")}</dd>
        </div>
      </dl>
      {isExternal && (
        <p className="server-hint">
          {t("advanced.externalStopUnavailable")}
        </p>
      )}
      {(serverProcess?.lastError || serverProcess?.message) && (
        <p className={lifecycle === "failed" ? "server-hint bad" : "server-hint"}>
          {serverProcess.lastError ?? serverProcess.message}
        </p>
      )}
      {(serverProcess?.root
        || serverProcess?.configPath
        || serverProcess?.command
        || serverProcess?.exitCode
        || startupLog.length > 0
        || recentStderr.length > 0) && (
        <details className="server-startup-details" open={lifecycle === "failed"}>
          <summary>{t("advanced.startupDetails")}</summary>
          {serverProcess?.root && <p>{t("advanced.root")}: {serverProcess.root}</p>}
          {serverProcess?.configPath && <p>{t("advanced.configPath")}: {serverProcess.configPath}</p>}
          {serverProcess?.command && <p>{t("advanced.command")}: {serverProcess.command}</p>}
          {serverProcess?.exitCode && <p>{t("advanced.exitCode")}: {serverProcess.exitCode}</p>}
          {serverProcess?.endpoint && <p>{t("config.endpoint")}: {serverProcess.endpoint}</p>}
          {startupLog.length > 0 && (
            <>
              <strong>{t("advanced.startupLog")}</strong>
              <ul>
                {startupLog.map((line, index) => (
                  <li key={`startup-${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </>
          )}
          {recentStderr.length > 0 && (
            <>
              <strong>{t("advanced.recentStderr")}</strong>
              <ul>
                {recentStderr.map((line, index) => (
                  <li key={`stderr-${index}-${line}`}>{line}</li>
                ))}
              </ul>
            </>
          )}
        </details>
      )}
      <div className="server-actions">
        <button
          onClick={onStart}
          disabled={busyAction !== null || !canStart}
        >
          {busyAction === "server:start" || isStarting ? t("advanced.starting") : t("advanced.startServer")}
        </button>
        <button
          className="secondary"
          onClick={onStop}
          disabled={busyAction !== null || !canStop || isStopping}
        >
          {busyAction === "server:stop" || isStopping ? t("advanced.stopping") : t("advanced.stopServer")}
        </button>
        <button
          className="secondary"
          onClick={onRestart}
          disabled={busyAction !== null || !canStop || isStarting || isStopping}
        >
          {busyAction === "server:restart" ? t("advanced.restarting") : t("advanced.restartServer")}
        </button>
        <button className="secondary" onClick={onRefresh} disabled={busyAction !== null || serverBusy}>
          {t("common.refresh")}
        </button>
      </div>
    </section>
  );
}
