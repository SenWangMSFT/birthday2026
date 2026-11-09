import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { CITIES } from "../memories.js";
import { memoryPhotos, validMemory } from "../memory-model.js";

test("Montréal uses all 23 supplied photos exactly once in five grouped slides", async () => {
  const montreal = CITIES.find((city) => city.id === "montreal");
  assert.equal(montreal.memories.length, 5);
  assert.ok(montreal.memories.length <= 5);
  assert.deepEqual(montreal.memories.map((memory) => memoryPhotos(memory).length), [5, 4, 5, 4, 5]);
  const supplied = (await readdir(new URL("../assets/montreal-web/", import.meta.url)))
    .filter((name) => /\.jpg$/i.test(name))
    .map((name) => name.replace(/\.[^.]+$/, "")).sort();
  const photos = montreal.memories.flatMap(memoryPhotos);
  const used = photos.map((photo) => new URL(photo.src).pathname.split("/").at(-1).replace(/\.jpg$/, "")).sort();
  assert.equal(photos.length, 23);
  assert.equal(new Set(used).size, 23);
  assert.deepEqual(used, supplied);
  assert.ok(montreal.memories.every(validMemory));
});

test("Toronto uses all 20 prepared photos exactly once in no more than five slides", async () => {
  const toronto = CITIES.find((city) => city.id === "toronto");
  assert.equal(toronto.memories.length, 5);
  assert.ok(toronto.memories.length <= 5);
  assert.deepEqual(toronto.memories.map((memory) => memoryPhotos(memory).length), [4, 4, 4, 4, 4]);
  const supplied = (await readdir(new URL("../assets/toronto-web/", import.meta.url)))
    .filter((name) => /\.jpg$/i.test(name)).sort();
  const photos = toronto.memories.flatMap(memoryPhotos);
  const used = photos.map((photo) => new URL(photo.src).pathname.split("/").at(-1)).sort();
  assert.equal(photos.length, 20);
  assert.equal(new Set(used).size, 20);
  assert.deepEqual(used, supplied);
  assert.ok(toronto.memories.every(validMemory));
});

for (const { id, count, groups } of [
  { id: "ottawa", count: 11, groups: [3, 2, 2, 2, 2] },
  { id: "nanjing", count: 26, groups: [5, 6, 5, 5, 5] },
]) {
  test(`${id} uses all ${count} prepared photos exactly once in five grouped slides`, async () => {
    const city = CITIES.find((city) => city.id === id);
    assert.equal(city.memories.length, 5);
    assert.deepEqual(city.memories.map((memory) => memoryPhotos(memory).length), groups);
    const supplied = (await readdir(new URL(`../assets/${id}-web/`, import.meta.url)))
      .filter((name) => /\.jpg$/i.test(name)).sort();
    const photos = city.memories.flatMap(memoryPhotos);
    const used = photos.map((photo) => new URL(photo.src).pathname.split("/").at(-1)).sort();
    assert.equal(photos.length, count);
    assert.equal(new Set(used).size, count);
    assert.deepEqual(used, supplied);
    assert.ok(city.memories.every(validMemory));
  });
}

test("all four cities bundle 80 optimized metadata-free JPEGs below a combined sixteen-MiB budget", async () => {
  const photos = CITIES.flatMap((city) => city.memories.flatMap(memoryPhotos));
  assert.equal(photos.length, 80);
  let total = 0;
  for (const photo of photos) {
    assert.match(photo.src, /\/(?:montreal|toronto|ottawa|nanjing)-web\/[^/]+\.jpg$/);
    const bytes = await readFile(new URL(photo.src));
    assert.equal(bytes.readUInt16BE(0), 0xffd8);
    assert.equal(bytes.readUInt16BE(bytes.length - 2), 0xffd9);
    assert.equal(bytes.includes(Buffer.from("Exif\0\0")), false);
    assert.ok(bytes.length > 10000);
    assert.ok(photo.alt.length > 5);
    total += bytes.length;
  }
  assert.ok(total < 16 * 1024 * 1024);
});

test("single images, placeholders and grouped memories share one validated schema", () => {
  const base = { caption: "A memory", alt: "A photograph" };
  assert.deepEqual(memoryPhotos({ ...base, image: null }), []);
  assert.deepEqual(memoryPhotos({ ...base, image: "/photo.jpg" }), [{ src: "/photo.jpg", alt: base.alt }]);
  const group = { ...base, photos: [{ src: "/one.jpg", alt: "First photo" }, { src: "/two.jpg", alt: "Second photo" }] };
  assert.equal(validMemory(group), true);
  assert.equal(memoryPhotos(group), group.photos);
  assert.equal(validMemory({ ...base, photos: Array.from({ length: 6 }, () => ({ src: "/photo.jpg", alt: "photo" })) }), true);
  for (const invalid of [
    { ...base }, { ...base, photos: [] }, { ...base, photos: null },
    { ...group, image: null }, { ...base, image: "" },
    { ...base, photos: [{ src: "", alt: "photo" }] },
    { ...base, photos: [{ src: "/photo.jpg", alt: "" }] },
    { ...base, photos: [{ src: "/photo.jpg" }] },
    { ...base, photos: Array.from({ length: 7 }, () => ({ src: "/photo.jpg", alt: "photo" })) },
    { ...group, caption: null },
  ]) {
    assert.equal(validMemory(invalid), false);
    assert.throws(() => memoryPhotos(invalid), TypeError);
  }
});
