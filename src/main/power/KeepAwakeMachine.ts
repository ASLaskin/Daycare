import { execFile } from "node:child_process";
import type { PowerStatus } from "../../shared/power.ts";
import type { KeepAwake } from "../../shared/settings.ts";
import type { PowerConfig, PowerInput } from "./config.ts";
import {
  AUTH_TIMEOUT_MS,
  clearSentinel,
  disableLidArgs,
  dropSentinel,
  enableLidArgs,
  WATCHDOG_POLL_S,
} from "./pmset.ts";
import type { PowerBlocker } from "./PowerBlocker.ts";

export class KeepAwakeMachine {
  private mode: KeepAwake = "off";
  private activeCount = 0;
  private busyCount = 0;
  private lidClosed = false;
  private blockerId: number | null = null;
  // We turned disablesleep on.
  private lidOn = false;
  // A privileged call is in flight.
  private busy = false;
  // Lid close failed; do not prompt again.
  private lidFailed = false;
  private error: string | null = null;
  // disablesleep was on at launch, not ours.
  private stale = false;
  private lastBusyAt = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastKey = "";

  constructor(
    private readonly config: PowerConfig,
    private readonly blocker: PowerBlocker["Service"],
    private readonly onChange: (status: PowerStatus) => void,
  ) {}

  status(): PowerStatus {
    return {
      mode: this.mode,
      holding: this.holding(),
      activeCount: this.activeCount,
      busyCount: this.busyCount,
      lidClosed: this.lidClosed,
      lidClosedActive: this.lidOn,
      stale: this.stale,
      error: this.error,
    };
  }

  init() {
    clearSentinel(this.config.sentinel);
    // Checks for leftover disablesleep after any old watchdog finishes.
    setTimeout(() => this.detectStale(), WATCHDOG_POLL_S * 3000).unref();
    this.publish();
  }

  apply(next: PowerInput) {
    try {
      this.mode = next.mode;
      this.activeCount = Math.max(0, next.activeCount);
      this.busyCount = Math.max(0, next.busyCount);
      this.lidClosed = next.lidClosed;
      if (this.busyCount > 0) {
        this.lastBusyAt = Date.now();
      }
      this.syncBlocker();
      this.reconcileLid();
      this.scheduleGrace();
    } catch (err) {
      this.error = `Keep awake failed: ${err instanceof Error ? err.message : String(err)}`;
    }
    this.publish();
  }

  // Turns off a stale disablesleep left by an earlier run.
  restore(done: (status: PowerStatus) => void) {
    if (!this.config.isMac || this.busy) {
      return done(this.status());
    }
    this.busy = true;
    dropSentinel(this.config.sentinel, false);
    execFile(
      this.config.osascript,
      disableLidArgs(this.config),
      { timeout: AUTH_TIMEOUT_MS },
      (err) => {
        this.busy = false;
        if (err) {
          this.error =
            "Could not restore normal sleep, run: sudo pmset -a disablesleep 0";
        } else {
          this.lidOn = false;
          this.stale = false;
          this.error = null;
          clearSentinel(this.config.sentinel);
        }
        this.publish();
        done(this.status());
      },
    );
  }

  dismissError() {
    this.error = null;
    this.publish();
  }

  // Releases everything synchronously, safe in an exit handler.
  release() {
    try {
      this.mode = "off";
      if (this.holding()) {
        this.blocker.stop(this.blockerId!);
      }
      this.blockerId = null;
      if (this.graceTimer) {
        clearTimeout(this.graceTimer);
      }
      this.graceTimer = null;
    } catch {}
    if (this.lidOn) {
      this.lidOn = false;
      dropSentinel(this.config.sentinel, true);
    }
    this.publish();
  }

  dropSentinelNow() {
    dropSentinel(this.config.sentinel, true);
  }

  private holding() {
    try {
      return this.blockerId !== null && this.blocker.isStarted(this.blockerId);
    } catch {
      return false;
    }
  }

  private wantBlocker() {
    return (
      this.mode === "always" ||
      (this.mode === "while-running" && this.busyCount > 0)
    );
  }

  private lidWorkWanted() {
    if (this.mode === "always" || this.busyCount > 0) {
      return true;
    }
    return (
      this.lastBusyAt > 0 &&
      Date.now() - this.lastBusyAt < this.config.lidGraceMs
    );
  }

  private wantLid() {
    return (
      this.config.isMac &&
      this.lidClosed &&
      this.mode !== "off" &&
      this.lidWorkWanted()
    );
  }

  private publish() {
    const s = this.status();
    const key = JSON.stringify(s);
    if (key === this.lastKey) {
      return;
    }
    this.lastKey = key;
    this.onChange(s);
  }

  private syncBlocker() {
    const held = this.holding();
    if (this.wantBlocker() && !held) {
      this.blockerId = this.blocker.start();
      return;
    }
    if (!this.wantBlocker() && this.blockerId !== null) {
      if (held) {
        this.blocker.stop(this.blockerId);
      }
      this.blockerId = null;
    }
  }

  // Moves lid close toward wanted; only enabling prompts.
  private reconcileLid() {
    if (this.busy) {
      return;
    }
    const want = this.wantLid();
    if (!want) {
      this.lidFailed = false;
    }
    if (want && this.lidOn) {
      return;
    }
    if (!want && this.lidOn) {
      this.lidOn = false;
      dropSentinel(this.config.sentinel, false);
      this.publish();
      return;
    }
    if (!want || this.lidFailed) {
      return;
    }
    this.busy = true;
    clearSentinel(this.config.sentinel);
    execFile(
      this.config.osascript,
      enableLidArgs(this.config),
      { timeout: AUTH_TIMEOUT_MS },
      (err) => {
        this.busy = false;
        if (err) {
          this.lidFailed = true;
          this.error = "Keep awake with lid closed was cancelled or failed";
        } else {
          this.lidOn = true;
          this.stale = false;
          this.error = null;
        }
        this.publish();
        if (!err) {
          this.reconcileLid();
        }
      },
    );
  }

  // Timer that drops lid close once the grace period ends.
  private scheduleGrace() {
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
    }
    this.graceTimer = null;
    if (!this.lidOn || this.busyCount > 0 || this.mode === "always") {
      return;
    }
    const left = this.config.lidGraceMs - (Date.now() - this.lastBusyAt);
    this.graceTimer = setTimeout(
      () => {
        this.graceTimer = null;
        this.reconcileLid();
        this.publish();
      },
      Math.max(1000, left),
    );
    this.graceTimer.unref();
  }

  // Flags disablesleep left on by an earlier run.
  private detectStale() {
    if (!this.config.isMac) {
      return;
    }
    execFile(this.config.pmset, ["-g"], { timeout: 10000 }, (err, stdout) => {
      if (
        err ||
        this.lidOn ||
        this.busy ||
        !/SleepDisabled\s+1/.test(String(stdout))
      ) {
        return;
      }
      this.stale = true;
      this.error ??= "This Mac is still set not to sleep from an earlier run";
      this.publish();
    });
  }
}
