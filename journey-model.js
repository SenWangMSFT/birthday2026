import { CITIES } from "./memories.js";
import { soften } from "./scene.js";
import { validMemory } from "./memory-model.js";

export const JOURNEY_DURATIONS = Object.freeze({
  entry: 7000,
  orbit: 2400,
  approach: 6200,
  memory: 9000,
  pullback: 4800,
  travel: 3600,
});

export const ORBIT_VIEW = Object.freeze({ latitude: 22, longitude: -65 });
export const CITY_CAMERA_DISTANCE = 1.45;

export function geoNormal(latitude, longitude) {
  const lat = latitude * Math.PI / 180;
  const lon = longitude * Math.PI / 180;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}

export class JourneyPlayer {
  constructor(cities = CITIES) {
    if (!cities.length || cities.some((city) =>
      !Number.isFinite(city.latitude) || Math.abs(city.latitude) > 90 ||
      !Number.isFinite(city.longitude) || Math.abs(city.longitude) > 180 ||
      !city.memories?.length ||
      city.memories.some((memory) => !validMemory(memory)))) {
      throw new TypeError("Each city needs valid geographic coordinates and at least one memory with valid photos, alt text and caption.");
    }
    this.cities = cities;
    this.restart();
  }

  restart(reducedMotion = false) {
    this.cityIndex = 0;
    this.memoryIndex = 0;
    this.fromIndex = 0;
    this.targetIndex = 0;
    this.targetMemory = 0;
    this.approachFrom = ORBIT_VIEW;
    this.elapsed = 0;
    this.paused = false;
    this.complete = false;
    this.reducedMotion = reducedMotion;
    this.phase = reducedMotion ? "memory" : "entry";
  }

  get progress() {
    return Math.min(1, this.elapsed / JOURNEY_DURATIONS[this.phase]);
  }

  get displayIndex() {
    return this.phase === "pullback" ? this.fromIndex : this.targetIndex;
  }

  get canPrevious() {
    return this.phase === "memory" && (this.cityIndex > 0 || this.memoryIndex > 0);
  }

  get canNext() {
    return !(this.phase === "memory" &&
      this.cityIndex === this.cities.length - 1 &&
      this.memoryIndex === this.cities[this.cityIndex].memories.length - 1);
  }

  arrive() {
    this.cityIndex = this.targetIndex;
    this.memoryIndex = this.targetMemory;
    this.phase = "memory";
  }

  depart(targetIndex, targetMemory = 0) {
    this.fromIndex = this.cityIndex;
    this.targetIndex = targetIndex;
    this.targetMemory = targetMemory;
    this.phase = "pullback";
    if (this.reducedMotion) this.arrive();
  }

  transition() {
    if (this.phase === "entry") this.phase = "orbit";
    else if (this.phase === "orbit") this.phase = "approach";
    else if (this.phase === "approach") this.arrive();
    else if (this.phase === "pullback") this.phase = "travel";
    else if (this.phase === "travel") {
      this.approachFrom = this.cities[this.targetIndex];
      this.phase = "approach";
    } else if (this.memoryIndex + 1 < this.cities[this.cityIndex].memories.length) {
      this.memoryIndex += 1;
    } else if (this.cityIndex + 1 < this.cities.length) {
      this.depart(this.cityIndex + 1);
    } else {
      this.complete = true;
      this.elapsed = JOURNEY_DURATIONS.memory;
    }
  }

  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("Journey advancement must be finite and non-negative.");
    }
    if (this.paused || this.complete) return;
    this.elapsed += milliseconds;
    while (!this.complete && this.elapsed >= JOURNEY_DURATIONS[this.phase]) {
      this.elapsed -= JOURNEY_DURATIONS[this.phase];
      this.transition();
    }
  }

  next() {
    if (!this.canNext) return;
    this.complete = false;
    this.elapsed = 0;
    if (this.phase !== "memory") this.arrive();
    else this.transition();
  }

  previous() {
    if (!this.canPrevious) return;
    this.complete = false;
    this.elapsed = 0;
    if (this.memoryIndex > 0) this.memoryIndex -= 1;
    else this.depart(this.cityIndex - 1, this.cities[this.cityIndex - 1].memories.length - 1);
  }

  setReducedMotion(reduced) {
    this.reducedMotion = reduced;
    if (reduced && this.phase !== "memory") {
      this.arrive();
      this.elapsed = 0;
    }
  }

  get pose() {
    const progress = soften(this.progress);
    const city = this.cities[this.targetIndex];
    if (this.phase === "entry") {
      return { from: ORBIT_VIEW, to: ORBIT_VIEW, turn: 1, distance: 12 - 8 * progress,
        opacity: progress, wash: 1 - progress, pin: 0 };
    }
    if (this.phase === "orbit") {
      return { from: ORBIT_VIEW, to: ORBIT_VIEW, turn: 1, distance: 4, opacity: 1, wash: 0, pin: 0 };
    }
    if (this.phase === "pullback") {
      const from = this.cities[this.fromIndex];
      return { from, to: from, turn: 1, distance: CITY_CAMERA_DISTANCE + (4 - CITY_CAMERA_DISTANCE) * progress,
        opacity: 1, wash: 0, pin: 1 - progress };
    }
    if (this.phase === "travel") {
      return { from: this.cities[this.fromIndex], to: city, turn: progress,
        distance: 4, opacity: 1, wash: 0, pin: 0 };
    }
    if (this.phase === "approach") {
      return { from: this.approachFrom, to: city, turn: soften(this.progress / 0.7),
        distance: 4 - (4 - CITY_CAMERA_DISTANCE) * progress, opacity: 1, wash: 0,
        pin: soften((this.progress - 0.65) / 0.35) };
    }
    return { from: city, to: city, turn: 1, distance: CITY_CAMERA_DISTANCE, opacity: 1, wash: 0, pin: 0 };
  }
}
