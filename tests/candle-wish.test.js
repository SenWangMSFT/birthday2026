import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CANDLE_FLIGHT_DURATION, CANDLE_STAR, CANDLE_TRAIL_POINTS, CandleWish, REDUCED_CANDLE_DURATION } from "../candle-wish.js";
import { STAR_LIGHT_RGB, STAR_LIGHT_STOPS } from "../starfield.js";
import { BirthdayFinale } from "../finale.js";

test("the candle starts ready, accepts one launch, and gifts stay unavailable until the light settles", () => {
  const wish = new CandleWish();
  assert.equal(wish.state, "ready");
  assert.equal(wish.frame(1440, 900), null);
  assert.equal(wish.openGifts(), false);
  assert.equal(wish.launch({ x: 0.5, y: 0.52 }), true);
  assert.equal(wish.launch({ x: 0.4, y: 0.4 }), false);
  assert.equal(wish.openGifts(), false);
  wish.advance(CANDLE_FLIGHT_DURATION - 1);
  assert.equal(wish.state, "flying");
  assert.equal(wish.openGifts(), false);
  wish.advance(1);
  assert.equal(wish.state, "star");
  assert.equal(wish.openGifts(), true);
  assert.equal(wish.state, "gifts");
  assert.equal(wish.openGifts(), false);
  assert.equal(wish.launch({ x: 0.5, y: 0.52 }), false);
});

test("the moving light starts at the actual candle and shrinks into an ordinary, neutral star", () => {
  const wish = new CandleWish();
  wish.launch({ x: 0.5, y: 0.52 });
  const first = wish.frame(1440, 900);
  assert.equal(first.x, 720);
  assert.equal(first.y, 468);
  assert.equal(first.opacity, 0);
  assert.equal(first.flameOpacity, 1);
  assert.equal(first.trailOpacity, 0);
  wish.advance(CANDLE_FLIGHT_DURATION);
  const last = wish.frame(1440, 900);
  assert.ok(Math.abs(last.x - 1440 * CANDLE_STAR.x) < 1e-8);
  assert.ok(Math.abs(last.y - 900 * CANDLE_STAR.y) < 1e-8);
  assert.ok(Math.abs(last.radius - CANDLE_STAR.radius) < 1e-8);
  assert.ok(Math.abs(last.opacity - CANDLE_STAR.opacity) < 1e-8);
  assert.equal(last.warmth, 0);
  assert.equal(last.stretch, 1);
  assert.equal(last.flameOpacity, 0);
  assert.equal(last.trailOpacity, 0);
  assert.equal(last.cakeOpacity, 0);
  assert.equal(last.centerProgress, 1);
  assert.deepEqual(last.trail, []);
  assert.ok(last.radius >= 0.35 && last.radius <= 1.3);
  assert.ok(last.opacity <= 0.34);
});

test("the cake fades while the greeting centers, with no sudden change in either composition curve", () => {
  const wish = new CandleWish();
  wish.launch({ x: 0.5, y: 0.52 });
  let previous = wish.frame(1440, 900);
  assert.equal(previous.cakeOpacity, 1);
  assert.equal(previous.centerProgress, 0);
  for (let time = 0; time < CANDLE_FLIGHT_DURATION; time += 16) {
    wish.advance(16);
    const frame = wish.frame(1440, 900);
    assert.ok(frame.cakeOpacity <= previous.cakeOpacity);
    assert.ok(frame.centerProgress >= previous.centerProgress);
    assert.ok(previous.cakeOpacity - frame.cakeOpacity < 0.006);
    assert.ok(frame.centerProgress - previous.centerProgress < 0.005);
    previous = frame;
  }
  assert.equal(previous.cakeOpacity, 0);
  assert.equal(previous.centerProgress, 1);
});

test("heading measurements subtract the current translation so resizing never compounds the center shift", () => {
  const fixture = {
    scene: { getBoundingClientRect: () => ({ top: 0, height: 900 }) },
    heading: { getBoundingClientRect: () => ({ top: 240, height: 68 }) },
    giftSpace: { getBoundingClientRect: () => ({ top: 657, height: 86 }) },
    headingTranslation: 0,
    giftTranslation: 0,
  };
  BirthdayFinale.prototype.measureComposition.call(fixture);
  assert.equal(fixture.headingShift, 176);
  assert.equal(fixture.giftShift, -160);
  fixture.headingTranslation = 88;
  fixture.giftTranslation = -80;
  fixture.heading.getBoundingClientRect = () => ({ top: 328, height: 68 });
  fixture.giftSpace.getBoundingClientRect = () => ({ top: 577, height: 86 });
  BirthdayFinale.prototype.measureComposition.call(fixture);
  assert.equal(fixture.headingShift, 176);
  assert.equal(fixture.giftShift, -160);
});

test("the flight is smooth, rises continuously and keeps its trail pool bounded", () => {
  const wish = new CandleWish();
  wish.launch({ x: 0.5, y: 0.52 });
  let previous = wish.frame(1440, 900);
  for (let time = 0; time < CANDLE_FLIGHT_DURATION; time += 16) {
    wish.advance(16);
    const frame = wish.frame(1440, 900);
    assert.ok(frame.y <= previous.y + 1e-8);
    assert.ok(Math.hypot(frame.x - previous.x, frame.y - previous.y) < 3);
    assert.ok(frame.x >= 0 && frame.x <= 1440 && frame.y >= 0 && frame.y <= 900);
    assert.ok(frame.trail.length <= CANDLE_TRAIL_POINTS);
    assert.ok(frame.trailOpacity >= 0 && frame.trailOpacity <= 0.28);
    previous = frame;
  }
});

test("pause freezes the candle, resizing preserves normalized geometry, and replay restores the lit candle", () => {
  const wish = new CandleWish();
  wish.launch({ x: 0.5, y: 0.52 });
  wish.advance(3200);
  const before = wish.frame(1440, 900);
  wish.advance(50000, true);
  assert.deepEqual(wish.frame(1440, 900), before);
  const resized = wish.frame(768, 1024);
  assert.ok(Math.abs(resized.x / 768 - before.x / 1440) < 1e-8);
  assert.ok(Math.abs(resized.y / 1024 - before.y / 900) < 1e-8);
  wish.advance(50000);
  const settled = wish.frame(1440, 900);
  wish.advance(50000);
  assert.deepEqual(wish.frame(1440, 900), settled);
  wish.reset();
  assert.equal(wish.state, "ready");
  assert.equal(wish.frame(1440, 900), null);
  assert.equal(wish.launch({ x: 0.5, y: 0.52 }), true);
});

test("reduced motion crossfades at the star's fixed location without a trail or spatial flight", () => {
  const wish = new CandleWish();
  wish.launch({ x: 0.5, y: 0.52 }, true);
  wish.advance(REDUCED_CANDLE_DURATION / 2);
  const frame = wish.frame(768, 1024);
  assert.equal(frame.x, CANDLE_STAR.x * 768);
  assert.equal(frame.y, CANDLE_STAR.y * 1024);
  assert.equal(frame.flameOpacity, 0.5);
  assert.equal(frame.trailOpacity, 0);
  assert.equal(frame.stretch, 1);
  assert.equal(frame.cakeOpacity, 0.5);
  assert.equal(frame.centerProgress, 0);
  assert.deepEqual(frame.trail, []);
  wish.setReducedMotion(false);
  assert.equal(wish.elapsed, CANDLE_FLIGHT_DURATION / 2);
  wish.setReducedMotion(true);
  assert.equal(wish.elapsed, REDUCED_CANDLE_DURATION / 2);
  wish.advance(REDUCED_CANDLE_DURATION / 2);
  assert.equal(wish.state, "star");
  assert.equal(wish.frame(768, 1024).centerProgress, 1);
});

test("the SVG light and existing canvas stars share exactly the same soft profile", async () => {
  assert.deepEqual(STAR_LIGHT_RGB, [235, 237, 232]);
  assert.deepEqual(STAR_LIGHT_STOPS.map(({ offset, opacity }) => [offset, opacity]),
    [[0, 1], [0.14, 0.72], [0.3, 0.28], [0.55, 0.065], [1, 0]]);
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /<g id="candle-flame-holder">/);
  const cake = html.split('data-finale-page="cake"')[1].split("</section>")[0];
  assert.match(cake, /该拆礼物啦/);
  assert.match(cake, /现在，去拆为你准备的礼物吧。/);
  assert.match(cake, /candle-tap-hint/);
  assert.match(cake, /class="sr-only" id="candle-tap-hint"/);
  assert.doesNotMatch(cake, /可以睁开眼睛了|class="candle-tap-hint"/);
  assert.match(cake, /id="gift-button"[^>]*hidden/);
  assert.doesNotMatch(cake, /THIS MOMENT|A LITTLE|time to open|Open gift/i);
});

test("invalid flight dimensions, origins and time fail explicitly", () => {
  for (const origin of [{ x: NaN, y: 0.5 }, { x: -0.1, y: 0.5 }, { x: 0.5, y: 1.1 }, null]) {
    assert.throws(() => new CandleWish().launch(origin), RangeError);
  }
  const wish = new CandleWish();
  for (const time of [-1, NaN, Infinity, "7"]) assert.throws(() => wish.advance(time), RangeError);
  assert.throws(() => wish.frame(0, 900), RangeError);
});
