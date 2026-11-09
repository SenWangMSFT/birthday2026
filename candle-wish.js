import { soften } from "./scene.js";

export const CANDLE_FLIGHT_DURATION = 7200;
export const REDUCED_CANDLE_DURATION = 2400;
export const CANDLE_STAR = Object.freeze({ x: 0.82, y: 0.19, radius: 1.05, opacity: 0.31 });
export const CANDLE_TRAIL_POINTS = 24;

function validOrigin(origin) {
  return origin && [origin.x, origin.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

function flightPoint(origin, progress) {
  const t = soften(progress);
  const remaining = 1 - t;
  const c1 = { x: Math.max(0, origin.x - 0.08), y: origin.y + (CANDLE_STAR.y - origin.y) * 0.45 };
  const c2 = { x: CANDLE_STAR.x - 0.1, y: origin.y + (CANDLE_STAR.y - origin.y) * 0.8 };
  return {
    x: remaining ** 3 * origin.x + 3 * remaining ** 2 * t * c1.x + 3 * remaining * t * t * c2.x + t ** 3 * CANDLE_STAR.x,
    y: remaining ** 3 * origin.y + 3 * remaining ** 2 * t * c1.y + 3 * remaining * t * t * c2.y + t ** 3 * CANDLE_STAR.y,
  };
}

export class CandleWish {
  constructor() { this.reset(); }

  reset() {
    this.state = "ready";
    this.elapsed = 0;
    this.origin = { x: 0.5, y: 0.5 };
    this.reducedMotion = false;
  }

  get duration() { return this.reducedMotion ? REDUCED_CANDLE_DURATION : CANDLE_FLIGHT_DURATION; }

  setReducedMotion(reduced) {
    if (reduced === this.reducedMotion) return;
    const progress = this.elapsed / this.duration;
    this.reducedMotion = reduced;
    this.elapsed = progress * this.duration;
  }

  launch(origin, reducedMotion = false) {
    if (this.state !== "ready") return false;
    if (!validOrigin(origin)) throw new RangeError("The candle origin must be inside the scene.");
    this.origin = { ...origin };
    this.setReducedMotion(reducedMotion);
    this.state = "flying";
    return true;
  }

  advance(milliseconds, paused = false) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("Candle-flight time must be finite and non-negative.");
    if (paused || this.state !== "flying") return;
    this.elapsed = Math.min(this.duration, this.elapsed + milliseconds);
    if (this.elapsed === this.duration) this.state = "star";
  }

  openGifts() {
    if (this.state !== "star") return false;
    this.state = "gifts";
    return true;
  }

  frame(width, height) {
    if (![width, height].every((value) => Number.isFinite(value) && value > 0)) throw new RangeError("The candle sky needs positive viewport dimensions.");
    if (this.state === "ready") return null;
    const progress = this.elapsed / this.duration;
    const eased = soften(progress);
    const point = this.reducedMotion ? CANDLE_STAR : flightPoint(this.origin, progress);
    const trail = !this.reducedMotion && progress < 1 ? Array.from({ length: CANDLE_TRAIL_POINTS }, (_, index) => {
      const time = Math.max(0, this.elapsed - (CANDLE_TRAIL_POINTS - 1 - index) * 45);
      const previous = flightPoint(this.origin, time / this.duration);
      return { x: previous.x * width, y: previous.y * height };
    }) : [];
    return {
      x: point.x * width,
      y: point.y * height,
      radius: this.reducedMotion ? CANDLE_STAR.radius : 4.1 + (CANDLE_STAR.radius - 4.1) * eased,
      opacity: this.reducedMotion ? CANDLE_STAR.opacity * eased
        : (0.85 + (CANDLE_STAR.opacity - 0.85) * eased) * soften(this.elapsed / 300),
      stretch: this.reducedMotion ? 1 : 1 + 0.4 * (1 - eased),
      warmth: this.reducedMotion ? 0 : 1 - soften((progress - 0.25) / 0.75),
      flameOpacity: 1 - (this.reducedMotion ? eased : soften(this.elapsed / 480)),
      cakeOpacity: 1 - (this.reducedMotion ? eased : soften((progress - 0.06) / 0.65)),
      centerProgress: this.reducedMotion ? Number(progress === 1) : soften((progress - 0.08) / 0.82),
      trailOpacity: this.reducedMotion ? 0 : 0.28 * soften(progress / 0.1) * (1 - soften((progress - 0.7) / 0.3)),
      trail,
      settled: this.state === "star" || this.state === "gifts",
    };
  }
}
