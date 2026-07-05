import type { RuntimeState } from "./state.js";

export class RatioRefreshScheduler {
  #runtime: RuntimeState;
  #timer: NodeJS.Timeout | undefined;
  #stopped = true;

  constructor(runtime: RuntimeState) {
    this.#runtime = runtime;
  }

  start() {
    if (!this.#stopped) {
      return;
    }
    this.#stopped = false;
    void this.#tick();
  }

  stop() {
    this.#stopped = true;
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  async #tick() {
    if (this.#stopped) {
      return;
    }

    const now = new Date();
    const due = this.#runtime.ratioSources.nextDueSource(now);
    if (due) {
      await this.#runtime.ratioSources.refreshSource(due.id).catch(() => undefined);
    }

    this.#scheduleNext();
  }

  #scheduleNext() {
    if (this.#stopped) {
      return;
    }

    const now = new Date();
    const enabled = this.#runtime.ratioSources.listSources().filter((source) => source.enabled);
    const nextAt = enabled
      .map((source) => {
        if (this.#runtime.ratioSources.isSourceStale(source, now)) {
          return now.getTime();
        }
        if (source.nextRefreshAt) {
          return new Date(source.nextRefreshAt).getTime();
        }
        if (source.lastSuccessAt) {
          return new Date(source.lastSuccessAt).getTime() + source.refreshIntervalMinutes * 60_000;
        }
        return now.getTime();
      })
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b)[0];

    const delay = nextAt === undefined
      ? 60_000
      : Math.max(1_000, Math.min(nextAt - now.getTime(), 60_000));

    this.#timer = setTimeout(() => void this.#tick(), delay);
  }
}
