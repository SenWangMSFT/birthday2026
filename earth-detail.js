import { soften } from "./scene.js";

export const EARTH_DETAIL_REGIONS = Object.freeze([
  Object.freeze({
    id: "canada",
    west: -108, south: 27, east: -44, north: 63,
    width: 4096, height: 3072,
    image: new URL("./assets/earth-canada-hd.jpg", import.meta.url).href,
  }),
  Object.freeze({
    id: "china",
    west: 92, south: 16, east: 144, north: 48,
    width: 3072, height: 3072,
    image: new URL("./assets/earth-china-hd.jpg", import.meta.url).href,
  }),
]);

export function containsLocation(region, location) {
  return location.longitude >= region.west && location.longitude <= region.east &&
    location.latitude >= region.south && location.latitude <= region.north;
}

export function findDetailRegion(location) {
  return EARTH_DETAIL_REGIONS.find((region) => containsLocation(region, location));
}

export function regionUvBounds(region) {
  return [
    (region.west + 180) / 360, (region.south + 90) / 180,
    (region.east + 180) / 360, (region.north + 90) / 180,
  ];
}

export function detailBlend(distance) {
  return soften((3.1 - distance) / 1.4);
}

export function detailDimensions(width, height, maxTextureSize) {
  if (![width, height, maxTextureSize].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Texture dimensions must be finite and positive.");
  }
  const scale = Math.min(1, Math.min(4096, maxTextureSize) / Math.max(width, height));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export function earthPixelRatio(width, height, deviceRatio) {
  if (![width, height, deviceRatio].every((value) => Number.isFinite(value) && value > 0)) {
    throw new RangeError("Earth viewport dimensions and pixel ratio must be finite and positive.");
  }
  return Math.min(deviceRatio, 2, Math.max(1, Math.sqrt(6000000 / (width * height))));
}
