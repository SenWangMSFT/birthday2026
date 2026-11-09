import { BIRTHDAY_STARTS, BIRTHDAY_STEPS, GUIDE_STAR, projectStar, soften } from "./scene.js";

export const FLYBY_STAR_COUNT = 960;
export const STAR_DEPTH = 8;
export const STAR_NEAR_PLANE = 0.18;
export const MAX_STAR_STREAK = 48;
export const STAR_LIGHT_RGB = Object.freeze([235, 237, 232]);
export const STAR_LIGHT_STOPS = Object.freeze([
  [0, 1], [0.14, 0.72], [0.3, 0.28], [0.55, 0.065], [1, 0],
].map(([offset, opacity]) => Object.freeze({ offset, opacity, color: `rgba(${STAR_LIGHT_RGB.join(", ")}, ${opacity})` })));

const travelDuration = BIRTHDAY_STEPS.find((step) => step.key === "star-travel").duration;
const revealStart = BIRTHDAY_STARTS["star-travel"] - 1900;
const fadeStart = BIRTHDAY_STARTS["star-dive"] + 3600;
const fadeEnd = BIRTHDAY_STARTS.illuminate + 2200;
const end = BIRTHDAY_STEPS.reduce((total, step) => total + step.duration, 0);

function noise(seed) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

export function createFlybyStars() {
  return Array.from({ length: FLYBY_STAR_COUNT }, (_, index) => ({
    seed: index + 1,
    phase: noise(index + 1) * STAR_DEPTH,
    brightness: 0.55 + noise(index + 1001) * 0.45,
  }));
}

function distanceAt(elapsed) {
  const seconds = Math.max(0, Math.min(elapsed, end) - revealStart) / 1000;
  const dive = Math.max(0, Math.min(elapsed, end) - BIRTHDAY_STARTS["star-dive"]) / 1000;
  return seconds * 0.7 + seconds * seconds * 0.12 + dive * dive * 0.2;
}

export function getStarFlight(elapsed) {
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new RangeError("Star-flight time must be finite and non-negative.");
  }
  const previous = Math.max(0, elapsed - 32);
  return {
    distance: distanceAt(elapsed),
    previousDistance: distanceAt(previous),
    travel: soften((elapsed - BIRTHDAY_STARTS["star-travel"]) / travelDuration),
    previousTravel: soften((previous - BIRTHDAY_STARTS["star-travel"]) / travelDuration),
    opacity: soften((elapsed - revealStart) / 1900) *
      (1 - soften((elapsed - fadeStart) / (fadeEnd - fadeStart))),
  };
}

export function projectFlybyStar(star, flight, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new RangeError("Star-field viewport dimensions must be finite and positive.");
  }
  const rawDepth = star.phase - flight.distance;
  const cycle = Math.floor(rawDepth / STAR_DEPTH);
  const depth = ((rawDepth % STAR_DEPTH) + STAR_DEPTH) % STAR_DEPTH + STAR_NEAR_PLANE;
  const x = (noise(star.seed + cycle * 37.31) - 0.5) * 10 * width / height;
  const y = (noise(star.seed * 2.71 + cycle * 19.17) - 0.5) * 10;
  const focus = projectStar(GUIDE_STAR.x, GUIDE_STAR.y, width, height, { starTravel: flight.travel, starZoom: 1 });
  const previousFocus = projectStar(GUIDE_STAR.x, GUIDE_STAR.y, width, height, { starTravel: flight.previousTravel, starZoom: 1 });
  const focalLength = height * 0.82;
  const screenX = focus.x + x * focalLength / depth;
  const screenY = focus.y + y * focalLength / depth;
  const previousDepth = depth + flight.distance - flight.previousDistance;
  const previousX = previousFocus.x + x * focalLength / previousDepth;
  const previousY = previousFocus.y + y * focalLength / previousDepth;
  const dx = screenX - previousX;
  const dy = screenY - previousY;
  const length = Math.hypot(dx, dy);
  const streakScale = length > MAX_STAR_STREAK ? MAX_STAR_STREAK / length : 1;
  const near = 1 - (depth - STAR_NEAR_PLANE) / STAR_DEPTH;
  const opacity = flight.opacity * star.brightness * (0.14 + near * 0.34) *
    soften((depth - STAR_NEAR_PLANE) / 0.5) *
    (1 - soften((depth - 6.7) / (STAR_DEPTH + STAR_NEAR_PLANE - 6.7)));
  return {
    x: screenX,
    y: screenY,
    fromX: screenX - dx * streakScale,
    fromY: screenY - dy * streakScale,
    radius: 0.35 + near * near * 1.6,
    opacity,
    depth,
    cycle,
    streak: Math.min(length, MAX_STAR_STREAK),
    visible: opacity > 0.005 && screenX > -60 && screenX < width + 60 &&
      screenY > -60 && screenY < height + 60,
  };
}
