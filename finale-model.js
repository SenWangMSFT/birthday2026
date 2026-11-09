import { soften } from "./scene.js";

export const EYES_CLOSED_DURATION = 30000;
export const FINALE_STEPS = Object.freeze([
  Object.freeze({ key: "arrival", duration: 6000 }),
  Object.freeze({ key: "little-things", duration: 13000 }),
  Object.freeze({ key: "letter", duration: 19000 }),
  Object.freeze({ key: "last", duration: 4000 }),
  Object.freeze({ key: "countdown", duration: EYES_CLOSED_DURATION }),
  Object.freeze({ key: "cake", duration: Infinity }),
]);
const READING_STEPS = new Set(["little-things", "letter", "last"]);
const EXIT_DURATION = 2200;

export class FinalePlayer {
  constructor() {
    this.restart();
  }

  restart() {
    this.index = 0;
    this.elapsed = 0;
    this.target = null;
    this.paused = false;
  }

  get phase() { return FINALE_STEPS[this.index].key; }
  get canPrevious() { return this.phase === "letter" || this.phase === "last"; }
  get canNext() { return READING_STEPS.has(this.phase); }

  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("Finale time must be finite and non-negative.");
    if (this.paused) return;
    this.elapsed += milliseconds;
    while (this.elapsed >= FINALE_STEPS[this.index].duration) {
      this.elapsed -= FINALE_STEPS[this.index].duration;
      this.index = this.target ?? this.index + 1;
      this.target = null;
    }
    if (this.phase === "cake") this.elapsed = Math.min(8000, this.elapsed);
  }

  navigate(direction) {
    if (direction !== 1 && direction !== -1) throw new RangeError("Finale navigation must move one page.");
    if (this.target !== null || (direction === 1 ? !this.canNext : !this.canPrevious)) return;
    this.target = this.index + direction;
    const fadeTime = this.phase === "last" ? 2800 : EXIT_DURATION;
    this.elapsed = Math.max(this.elapsed, FINALE_STEPS[this.index].duration - fadeTime);
  }

  get frame() {
    const phase = this.phase;
    const duration = FINALE_STEPS[this.index].duration;
    const enter = soften(this.elapsed / (phase === "last" ? 900 : 1800));
    const exitDuration = phase === "last" ? 1100 : EXIT_DURATION;
    const exit = Number.isFinite(duration) ? 1 - soften((this.elapsed - duration + exitDuration) / exitDuration) : 1;
    const dark = phase === "last" ? soften((this.elapsed - duration + 1500) / 1500)
      : phase === "countdown" || phase === "cake" ? 1 : 0;
    return {
      phase,
      opacity: phase === "arrival" ? 0 : phase === "little-things" || phase === "letter" ? enter * exit
        : phase === "last" ? enter * exit : phase === "countdown" ? 1 : soften(this.elapsed / 2800),
      paper: phase === "arrival" ? soften(this.elapsed / duration) : 1 - dark,
      journeyOpacity: phase === "arrival" ? 1 - soften(this.elapsed / duration) : 0,
      seconds: phase === "countdown" ? Math.max(1, Math.ceil((EYES_CLOSED_DURATION - this.elapsed) / 1000)) : null,
      audio: phase === "countdown" ? "suspense" : phase === "cake" ? "birthday"
        : phase === "last" ? "quiet" : "story",
    };
  }
}
