import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CITIES } from "../memories.js";
import {
  EARTH_DETAIL_REGIONS, containsLocation, detailBlend, detailDimensions,
  earthPixelRatio, findDetailRegion, regionUvBounds,
} from "../earth-detail.js";

function jpegDimensions(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    assert.equal(bytes[offset], 0xff);
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += 2 + bytes.readUInt16BE(offset + 2);
  }
  throw new Error("JPEG has no supported frame header.");
}

test("the downloaded regional files contain their full native output dimensions", async () => {
  for (const region of EARTH_DETAIL_REGIONS) {
    const bytes = await readFile(new URL(region.image));
    assert.deepEqual(jpegDimensions(bytes), { width: region.width, height: region.height });
    assert.ok(bytes.length > 100000);
  }
  const global = await readFile(new URL("../assets/earth-blue-marble.jpg", import.meta.url));
  assert.deepEqual(jpegDimensions(global), { width: 2048, height: 1024 });
});

test("regional imagery has at least ten times the source density in both axes", () => {
  for (const region of EARTH_DETAIL_REGIONS) {
    assert.ok(region.width / (region.east - region.west) >= 10 * 2048 / 360);
    assert.ok(region.height / (region.north - region.south) >= 10 * 1024 / 180);
  }
});

test("all four destinations are covered and their geographic UVs are not flipped", () => {
  for (const city of CITIES) {
    const region = findDetailRegion(city);
    assert.ok(region);
    assert.equal(region.id, city.country === "中国" ? "china" : "canada");
    const [west, south, east, north] = regionUvBounds(region);
    const u = (city.longitude + 180) / 360;
    const v = (city.latitude + 90) / 180;
    assert.ok(u > west && u < east && v > south && v < north);
    assert.ok(Math.abs((u - west) / (east - west) - (city.longitude - region.west) / (region.east - region.west)) < 1e-12);
    assert.ok(Math.abs((v - south) / (north - south) - (city.latitude - region.south) / (region.north - region.south)) < 1e-12);
  }
  assert.equal(containsLocation(EARTH_DETAIL_REGIONS[0], CITIES[3]), false);
});

test("detail appears gradually during approach, not at orbital distance", () => {
  assert.equal(detailBlend(12), 0);
  assert.equal(detailBlend(4), 0);
  assert.equal(detailBlend(3.1), 0);
  assert.ok(detailBlend(2.4) > 0 && detailBlend(2.4) < 1);
  assert.equal(detailBlend(1.7), 1);
  assert.equal(detailBlend(1.45), 1);
  let previous = 0;
  for (let distance = 3.1; distance > 1.45; distance -= 0.01) {
    const next = detailBlend(distance);
    assert.ok(next >= previous);
    assert.ok(next - previous < 0.02);
    previous = next;
  }
});

test("the largest active regional texture stays within a 64 MiB mipmapped GPU budget", () => {
  for (const region of EARTH_DETAIL_REGIONS) {
    const size = detailDimensions(region.width, region.height, 16384);
    assert.ok(size.width * size.height * 4 * 4 / 3 <= 64 * 1024 * 1024);
  }
  assert.deepEqual(detailDimensions(4096, 3072, 2048), { width: 2048, height: 1536 });
  assert.deepEqual(detailDimensions(3072, 3072, 2048), { width: 2048, height: 2048 });
});

test("iPad rendering uses full 2x pixels while large screens stay bounded", () => {
  assert.equal(earthPixelRatio(834, 1194, 2), 2);
  assert.equal(earthPixelRatio(1024, 1366, 2), 2);
  assert.equal(earthPixelRatio(1440, 900, 1), 1);
  assert.equal(earthPixelRatio(3840, 2160, 2), 1);
  for (const [width, height] of [[1440, 900], [1920, 1080], [2560, 1440]]) {
    const ratio = earthPixelRatio(width, height, 3);
    assert.ok(ratio <= 2);
    assert.ok(width * height * ratio * ratio <= 6000001);
  }
});

test("invalid texture and viewport limits fail explicitly", () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.throws(() => detailDimensions(4096, 3072, invalid), RangeError);
    assert.throws(() => earthPixelRatio(834, 1194, invalid), RangeError);
  }
});
