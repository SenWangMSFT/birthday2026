import assert from "node:assert/strict";
import test from "node:test";
import { CITIES } from "../memories.js";
import { BirthdayTimeline, getBirthdayFrame } from "../scene.js";
import { CITY_CAMERA_DISTANCE, JOURNEY_DURATIONS, JourneyPlayer, geoNormal } from "../journey-model.js";

function departCurrentCity(player) {
  const remaining = player.cities[player.cityIndex].memories.length - player.memoryIndex;
  for (let index = 0; index < remaining; index += 1) player.next();
}

test("the geographic route is Montreal, Toronto, Ottawa, then Nanjing", () => {
  assert.deepEqual(CITIES.map((city) => city.id), ["montreal", "toronto", "ottawa", "nanjing"]);
  assert.ok(CITIES.slice(0, 3).every((city) => city.longitude < 0));
  assert.ok(CITIES[3].longitude > 0);
  assert.ok(CITIES.every((city) => city.memories.length === 5));
  assert.ok(CITIES.every((city) => city.memories.every((memory) => memory.photos.length > 0)));
});

test("autoplay shows every memory once and pulls out between each city", () => {
  const player = new JourneyPlayer();
  const memories = [];
  const phases = [];
  while (!player.complete) {
    phases.push(player.phase);
    if (player.phase === "memory") memories.push(`${player.cityIndex}-${player.memoryIndex}`);
    player.advance(JOURNEY_DURATIONS[player.phase] - player.elapsed);
  }
  assert.deepEqual(memories, [
    "0-0", "0-1", "0-2", "0-3", "0-4", "1-0", "1-1", "1-2", "1-3", "1-4",
    "2-0", "2-1", "2-2", "2-3", "2-4", "3-0", "3-1", "3-2", "3-3", "3-4",
  ]);
  assert.equal(phases.filter((phase) => phase === "approach").length, 4);
  assert.equal(phases.filter((phase) => phase === "pullback").length, 3);
  assert.equal(phases.filter((phase) => phase === "travel").length, 3);
  assert.equal(player.cityIndex, 3);
  assert.equal(player.memoryIndex, CITIES[3].memories.length - 1);
  assert.equal(player.canNext, false);
});

test("the star-to-Earth entrance settles into orbit before the first city", () => {
  const player = new JourneyPlayer();
  assert.equal(player.phase, "entry");
  assert.equal(player.pose.opacity, 0);
  assert.equal(player.pose.wash, 1);
  assert.equal(player.pose.distance, 12);
  player.advance(JOURNEY_DURATIONS.entry);
  assert.equal(player.phase, "orbit");
  assert.equal(player.pose.opacity, 1);
  assert.equal(player.pose.distance, 4);
  player.advance(JOURNEY_DURATIONS.orbit + JOURNEY_DURATIONS.approach);
  assert.equal(player.phase, "memory");
  assert.equal(player.pose.distance, CITY_CAMERA_DISTANCE);
  assert.equal(player.pose.to.id, "montreal");
});

test("the Earth entry preserves the final star glow instead of resetting it", () => {
  const birthday = new BirthdayTimeline();
  birthday.skip();
  const final = getBirthdayFrame(birthday);
  const player = new JourneyPlayer();
  assert.equal(final.heroOpacity, 0);
  assert.equal(player.pose.opacity, 0);
  assert.equal(final.wash * player.pose.wash, final.wash);
  assert.deepEqual(final.lights, [1, 1, 1]);
});

test("Earth and glow use one continuous seven-second crossfade without a brightness gap", () => {
  const player = new JourneyPlayer();
  let previous = player.pose;
  while (player.phase === "entry") {
    player.advance(16);
    const next = player.pose;
    assert.equal(next.opacity + next.wash, 1);
    assert.ok(next.opacity >= previous.opacity);
    assert.ok(next.wash <= previous.wash);
    assert.ok(next.opacity - previous.opacity < 0.004);
    previous = next;
  }
  assert.equal(player.pose.opacity, 1);
  assert.equal(player.pose.wash, 0);
});

test("every memory stays on the zoomed-in Earth facing its own city", () => {
  const player = new JourneyPlayer();
  player.restart(true);
  const visited = new Set();
  while (!player.complete) {
    const pose = player.pose;
    assert.equal(pose.distance, CITY_CAMERA_DISTANCE);
    assert.ok(pose.distance > 1.1 && pose.distance < 2);
    assert.equal(pose.opacity, 1);
    assert.equal(pose.from, CITIES[player.cityIndex]);
    assert.equal(pose.to, CITIES[player.cityIndex]);
    assert.equal(pose.turn, 1);
    visited.add(pose.to.id);
    player.advance(JOURNEY_DURATIONS.memory);
  }
  assert.equal(visited.size, 4);
});

test("each city zooms out before turning, then smoothly approaches the next city", () => {
  const player = new JourneyPlayer();
  player.next();
  for (let cityIndex = 0; cityIndex < CITIES.length - 1; cityIndex += 1) {
    departCurrentCity(player);
    assert.equal(player.phase, "pullback");
    assert.equal(player.pose.distance, CITY_CAMERA_DISTANCE);
    let distance = player.pose.distance;
    for (let step = 0; step < 100; step += 1) {
      assert.equal(player.pose.from, CITIES[cityIndex]);
      assert.equal(player.pose.to, CITIES[cityIndex]);
      player.advance(JOURNEY_DURATIONS.pullback / 100);
      assert.ok(player.pose.distance >= distance);
      assert.ok(player.pose.distance - distance < 0.05);
      assert.equal(player.pose.opacity, 1);
      distance = player.pose.distance;
    }
    assert.equal(player.phase, "travel");
    assert.equal(distance, 4);
    assert.equal(player.pose.turn, 0);
    player.advance(JOURNEY_DURATIONS.travel);
    assert.equal(player.phase, "approach");
    assert.equal(player.pose.distance, 4);
    assert.equal(player.pose.from, CITIES[cityIndex + 1]);
    distance = 4;
    for (let step = 0; step < 100; step += 1) {
      player.advance(JOURNEY_DURATIONS.approach / 100);
      assert.ok(player.pose.distance <= distance);
      assert.ok(distance - player.pose.distance < 0.05);
      assert.equal(player.pose.opacity, 1);
      distance = player.pose.distance;
    }
    assert.equal(player.phase, "memory");
    assert.equal(player.pose.distance, CITY_CAMERA_DISTANCE);
    assert.equal(player.pose.to, CITIES[cityIndex + 1]);
  }
});
test("zoom-out labels stay with the departing city until travel, including reverse navigation", () => {
  const player = new JourneyPlayer();
  assert.equal(player.displayIndex, 0);
  player.next();
  departCurrentCity(player);
  assert.equal(player.phase, "pullback");
  assert.equal(player.targetIndex, 1);
  assert.equal(player.displayIndex, 0);
  player.advance(JOURNEY_DURATIONS.pullback - 1);
  assert.equal(player.displayIndex, 0);
  player.advance(1);
  assert.equal(player.phase, "travel");
  assert.equal(player.displayIndex, 1);
  player.advance(JOURNEY_DURATIONS.travel);
  assert.equal(player.phase, "approach");
  assert.equal(player.displayIndex, 1);
  player.next();
  assert.equal(player.phase, "memory");
  assert.equal(player.displayIndex, 1);
  player.previous();
  assert.equal(player.phase, "pullback");
  assert.equal(player.targetIndex, 0);
  assert.equal(player.displayIndex, 1);
  player.advance(JOURNEY_DURATIONS.pullback);
  assert.equal(player.phase, "travel");
  assert.equal(player.displayIndex, 0);
  player.next();
  assert.equal(player.phase, "memory");
  assert.equal(player.displayIndex, 0);
});

test("next skips a flight or advances a memory without skipping a city", () => {
  const player = new JourneyPlayer();
  player.next();
  assert.equal(player.phase, "memory");
  assert.equal(player.memoryIndex, 0);
  player.next();
  assert.equal(player.memoryIndex, 1);
  player.next();
  assert.equal(player.memoryIndex, 2);
  player.next();
  assert.equal(player.memoryIndex, 3);
  player.next();
  assert.equal(player.memoryIndex, 4);
  player.next();
  assert.equal(player.phase, "pullback");
  assert.equal(player.fromIndex, 0);
  assert.equal(player.targetIndex, 1);
  player.next();
  assert.equal(player.phase, "memory");
  assert.equal(player.cityIndex, 1);
  assert.equal(player.memoryIndex, 0);
});

test("previous flies back to the last memory in the previous city", () => {
  const player = new JourneyPlayer();
  player.next();
  assert.equal(player.canPrevious, false);
  departCurrentCity(player);
  player.next();
  assert.equal(player.cityIndex, 1);
  player.previous();
  assert.equal(player.phase, "pullback");
  assert.equal(player.fromIndex, 1);
  assert.equal(player.targetIndex, 0);
  assert.equal(player.targetMemory, CITIES[0].memories.length - 1);
  player.advance(JOURNEY_DURATIONS.pullback + JOURNEY_DURATIONS.travel + JOURNEY_DURATIONS.approach);
  assert.equal(player.cityIndex, 0);
  assert.equal(player.memoryIndex, CITIES[0].memories.length - 1);
  player.previous();
  assert.equal(player.memoryIndex, CITIES[0].memories.length - 2);
});

test("pause freezes camera movement and the memory reading time", () => {
  const player = new JourneyPlayer();
  player.advance(3500);
  const pose = player.pose;
  player.paused = true;
  player.advance(99999);
  assert.deepEqual(player.pose, pose);
  player.paused = false;
  player.next();
  player.advance(4000);
  player.paused = true;
  player.advance(99999);
  assert.equal(player.memoryIndex, 0);
  assert.equal(player.elapsed, 4000);
});

test("reduced motion keeps autoplay but removes all camera flights", () => {
  const player = new JourneyPlayer();
  player.restart(true);
  assert.equal(player.phase, "memory");
  player.advance(JOURNEY_DURATIONS.memory * CITIES[0].memories.length);
  assert.equal(player.phase, "memory");
  assert.equal(player.cityIndex, 1);
  assert.equal(player.memoryIndex, 0);
  player.previous();
  assert.equal(player.phase, "memory");
  assert.equal(player.cityIndex, 0);
  assert.equal(player.memoryIndex, CITIES[0].memories.length - 1);
});

test("enabling reduced motion mid-flight arrives at its actual destination", () => {
  const player = new JourneyPlayer();
  player.next();
  departCurrentCity(player);
  assert.equal(player.targetIndex, 1);
  player.setReducedMotion(true);
  assert.equal(player.phase, "memory");
  assert.equal(player.cityIndex, 1);
  assert.equal(player.elapsed, 0);
});

test("the globe coordinates are unit normals with correct east/west orientation", () => {
  assert.deepEqual(geoNormal(0, 0), [1, 0, -0]);
  assert.ok(Math.abs(geoNormal(0, 90)[2] + 1) < 1e-10);
  assert.ok(Math.abs(geoNormal(90, 0)[1] - 1) < 1e-10);
  for (const city of CITIES) {
    assert.ok(Math.abs(Math.hypot(...geoNormal(city.latitude, city.longitude)) - 1) < 1e-10);
  }
});

test("invalid configuration and time increments fail explicitly", () => {
  assert.throws(() => new JourneyPlayer([]), TypeError);
  assert.throws(() => new JourneyPlayer([{ ...CITIES[0], latitude: 100 }]), TypeError);
  assert.throws(() => new JourneyPlayer([{ ...CITIES[0], memories: [] }]), TypeError);
  assert.throws(() => new JourneyPlayer([{ ...CITIES[0], longitude: 200 }]), TypeError);
  const player = new JourneyPlayer();
  for (const value of [-1, NaN, Infinity, "100"]) {
    assert.throws(() => player.advance(value), RangeError);
  }
});

test("Earth destinations do not require maps or skyline photographs", () => {
  const player = new JourneyPlayer();
  player.restart(true);
  assert.equal(player.phase, "memory");
  assert.ok(player.cities.every((city) => city.view === undefined));
});

test("replay resets a completed trip and a slow frame cannot overrun the ending", () => {
  const player = new JourneyPlayer();
  player.advance(9999999);
  assert.equal(player.complete, true);
  assert.equal(player.cityIndex, 3);
  player.restart();
  assert.equal(player.phase, "entry");
  assert.equal(player.cityIndex, 0);
  assert.equal(player.memoryIndex, 0);
  assert.equal(player.elapsed, 0);
  assert.equal(player.complete, false);
});
