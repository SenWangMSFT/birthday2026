import assert from "node:assert/strict";
import test from "node:test";
import { COMET_LIFETIME, COMET_MAX_LENGTH, COMET_MAX_POINTS, CometTrail } from "../scene.js";

test("the comet head follows behind the mouse instead of jumping to it", () => {
  const trail = new CometTrail();
  trail.move(30, 50);
  trail.advance(16);
  trail.move(60, 55);
  assert.deepEqual(trail.head, { x: 30, y: 50 });
  trail.advance(16);
  assert.ok(trail.head.x > 30 && trail.head.x < 60);
  trail.move(100, 75);
  trail.advance(16);
  assert.ok(trail.head.x < 100);
  assert.ok(trail.head.y < 75);
  assert.ok(trail.points.length > 2);
  assert.equal(trail.points[0].age, 48);
  assert.equal(trail.points.at(-1).age, 0);
});

test("pointer jitter does not allocate redundant points", () => {
  const trail = new CometTrail();
  trail.move(30, 50);
  for (let index = 0; index < 100; index += 1) trail.move(30.5, 50.5);
  assert.equal(trail.points.length, 1);
});

test("a fast sweep keeps a visible tail without exceeding its maximum length", () => {
  const trail = new CometTrail();
  trail.move(0, 50);
  trail.move(1000, 50);
  for (let frame = 0; frame < 20; frame += 1) trail.advance(16);
  assert.ok(trail.points.length > 2);
  assert.ok(trail.head.x < 1000);
  assert.ok(trail.head.x > 900);
  assert.ok(Math.abs(trail.points[0].x - (trail.points.at(-1).x - COMET_MAX_LENGTH)) < 1e-8);
});

test("long mouse gestures have bounded point counts and tail length", () => {
  const trail = new CometTrail();
  for (let index = 0; index < 10000; index += 1) {
    trail.move(index * 2, Math.sin(index / 10) * 20);
    trail.advance(8);
    assert.ok(trail.points.length <= COMET_MAX_POINTS);
  }
  const length = trail.points.reduce((total, point, index) => {
    const previous = trail.points[index - 1];
    return total + (previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0);
  }, 0);
  assert.ok(length <= COMET_MAX_LENGTH + 1e-8);
});

test("the comet fades away completely when the mouse stops", () => {
  const trail = new CometTrail();
  trail.move(0, 50);
  trail.advance(COMET_LIFETIME - 1);
  assert.equal(trail.points.length, 1);
  trail.advance(1);
  assert.equal(trail.points.length, 0);
  assert.equal(trail.connected, false);
});

test("reentering the scene never draws a line from the old cursor position", () => {
  const trail = new CometTrail();
  trail.move(100, 100);
  trail.disconnect();
  assert.equal(trail.points.length, 1);
  trail.move(900, 600);
  assert.deepEqual(trail.points, [{ x: 900, y: 600, age: 0 }]);
});

test("short pauses preserve the tail instead of abruptly restarting it", () => {
  const trail = new CometTrail();
  trail.move(100, 100);
  trail.advance(200);
  trail.move(900, 600);
  assert.deepEqual(trail.head, { x: 100, y: 100 });
  trail.advance(16);
  assert.equal(trail.points[0].x, 100);
  assert.ok(trail.head.x > 100 && trail.head.x < 900);
});

test("the fuller trail lingers beyond the old lifetime", () => {
  const trail = new CometTrail();
  trail.move(0, 100);
  trail.move(400, 100);
  for (let frame = 0; frame < 70; frame += 1) trail.advance(16);
  assert.ok(trail.points.length > 0);
  assert.ok(COMET_LIFETIME >= 1500);
  assert.ok(COMET_MAX_LENGTH >= 450);
  trail.advance(COMET_LIFETIME * 2);
  assert.equal(trail.points.length, 0);
});

test("cursor following is independent of frame rate", () => {
  const fast = new CometTrail();
  const slow = new CometTrail();
  for (const trail of [fast, slow]) {
    trail.move(0, 100);
    trail.move(400, 300);
  }
  for (let frame = 0; frame < 30; frame += 1) fast.advance(16);
  for (let frame = 0; frame < 15; frame += 1) slow.advance(32);
  assert.ok(Math.hypot(fast.head.x - slow.head.x, fast.head.y - slow.head.y) < 1e-8);
});

test("reset clears the trail and invalid inputs fail explicitly", () => {
  const trail = new CometTrail();
  for (const value of [NaN, Infinity, undefined, "20"]) {
    assert.throws(() => trail.move(value, 20), RangeError);
    assert.throws(() => trail.move(20, value), RangeError);
    assert.throws(() => trail.advance(value), RangeError);
  }
  assert.throws(() => trail.advance(-1), RangeError);
  trail.move(20, 20);
  trail.clear();
  assert.deepEqual(trail.points, []);
  assert.equal(trail.connected, false);
});
