import assert from "node:assert/strict";
import test from "node:test";
import { AmbientComets } from "../ambient-comets.js";

test("random comets never appear immediately on entry", () => {
  const comets = new AmbientComets(() => 0.5);
  comets.advance(4000, true);
  assert.equal(comets.frame, null);
});

test("occasional comets remain sparse and at most one is active", () => {
  const comets = new AmbientComets(() => 0);
  for (let frame = 0; frame < 3750; frame += 1) {
    comets.advance(16, true);
    if (comets.active) assert.ok(!Array.isArray(comets.active));
  }
  assert.ok(comets.spawned >= 1 && comets.spawned <= 6);
});

test("the focused birthday/star flight suppresses new ambient comets", () => {
  const comets = new AmbientComets(() => 0);
  comets.advance(60000, false);
  assert.equal(comets.frame, null);
  assert.equal(comets.spawned, 0);
});

test("a shooting star fades in and out rather than popping", () => {
  const comets = new AmbientComets(() => 0);
  comets.advance(5000, true);
  assert.equal(comets.frame.opacity, 0);
  comets.advance(300, true);
  assert.ok(comets.frame.opacity > 0);
  comets.advance(1200, false);
  assert.equal(comets.frame, null);
});

test("clearing or pausing does not create a burst of overdue comets", () => {
  const comets = new AmbientComets(() => 0);
  comets.advance(5000, true);
  const frozen = { ...comets.frame };
  comets.advance(0, true);
  assert.deepEqual(comets.frame, frozen);
  comets.clear();
  comets.advance(1, true);
  assert.equal(comets.frame, null);
  assert.throws(() => comets.advance(-1, true), RangeError);
});
