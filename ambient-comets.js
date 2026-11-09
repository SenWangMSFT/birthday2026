import { soften } from "./scene.js";

export class AmbientComets {
  constructor(random = Math.random) {
    this.random = random;
    this.elapsed = 0;
    this.nextAt = 5000 + random() * 3000;
    this.active = null;
    this.spawned = 0;
  }

  advance(milliseconds, allowed) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("Ambient comet advancement must be finite and non-negative.");
    }
    this.elapsed += milliseconds;
    if (this.active) {
      this.active.age += milliseconds;
      if (this.active.age >= this.active.duration) this.active = null;
    }
    if (!this.active && allowed && this.elapsed >= this.nextAt) {
      const direction = this.random() < 0.5 ? -1 : 1;
      this.active = {
        x: direction > 0 ? 0.05 + this.random() * 0.5 : 0.45 + this.random() * 0.5,
        y: 0.05 + this.random() * 0.22,
        vx: direction * (120 + this.random() * 80),
        vy: 35 + this.random() * 45,
        duration: 1500 + this.random() * 700,
        age: 0,
        length: 95 + this.random() * 65,
      };
      this.nextAt = this.elapsed + this.active.duration + 9000 + this.random() * 8000;
      this.spawned += 1;
    }
  }

  get frame() {
    if (!this.active) return null;
    const star = this.active;
    return {
      ...star,
      opacity: 0.5 * soften(star.age / 220) * (1 - soften((star.age - star.duration + 500) / 500)),
    };
  }

  clear() {
    this.active = null;
    this.nextAt = this.elapsed + 5000 + this.random() * 3000;
  }
}
