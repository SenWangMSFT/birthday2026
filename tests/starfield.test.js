import assert from "node:assert/strict";
import test from "node:test";
import { BIRTHDAY_STARTS } from "../scene.js";
import {
  FLYBY_STAR_COUNT, MAX_STAR_STREAK, STAR_DEPTH, STAR_NEAR_PLANE,
  createFlybyStars, getStarFlight, projectFlybyStar,
} from "../starfield.js";

test("the 3D flight uses a fixed, deterministic pool of 960 depth particles", () => {
  const stars = createFlybyStars();
  assert.equal(stars.length, 960);
  assert.equal(stars.length, FLYBY_STAR_COUNT);
  assert.deepEqual(createFlybyStars(), stars);
  assert.equal(new Set(stars.map((star) => star.seed)).size, FLYBY_STAR_COUNT);
  assert.ok(stars.every((star) => star.phase >= 0 && star.phase < STAR_DEPTH));
});

test("stars fade in after the centered word zoom and disappear before the Earth handoff", () => {
  assert.equal(getStarFlight(0).opacity, 0);
  assert.equal(getStarFlight(BIRTHDAY_STARTS.zoom).opacity, 0);
  assert.equal(getStarFlight(BIRTHDAY_STARTS["star-travel"]).opacity, 1);
  assert.equal(getStarFlight(BIRTHDAY_STARTS.illuminate + 2200).opacity, 0);
  assert.equal(getStarFlight(29200).opacity, 0);
});

test("the forward camera accelerates continuously through the star dive", () => {
  const travel = getStarFlight(BIRTHDAY_STARTS["star-travel"] + 1000);
  const dive = getStarFlight(BIRTHDAY_STARTS["star-dive"] + 2000);
  assert.ok(dive.distance > travel.distance);
  assert.ok(dive.distance - dive.previousDistance > travel.distance - travel.previousDistance);
  let previous = 0;
  for (let time = 0; time <= 29200; time += 20) {
    const frame = getStarFlight(time);
    assert.ok(frame.distance >= previous);
    assert.ok(frame.previousDistance <= frame.distance);
    previous = frame.distance;
  }
});

test("nearby stars get larger and move outward faster through perspective", () => {
  const star = { ...createFlybyStars()[20], phase: 7 };
  const flight = getStarFlight(BIRTHDAY_STARTS["star-dive"]);
  const far = projectFlybyStar(star, { ...flight, distance: 0, previousDistance: 0 }, 1440, 900);
  const near = projectFlybyStar(star, { ...flight, distance: 6, previousDistance: 5.95 }, 1440, 900);
  assert.ok(near.depth < far.depth);
  assert.ok(near.radius > far.radius);
  assert.ok(Math.hypot(near.x - 720, near.y - 450) > Math.hypot(far.x - 720, far.y - 450));
  assert.ok((near.x - near.fromX) * (near.x - 720) + (near.y - near.fromY) * (near.y - 450) > 0);
});

test("the field is visibly dense on laptop and portrait iPad layouts", () => {
  const stars = createFlybyStars();
  for (const [width, height] of [[1440, 900], [834, 1194]]) {
    const points = stars.map((star) => projectFlybyStar(star, getStarFlight(22000), width, height));
    const visible = points.filter((point) => point.visible);
    assert.ok(visible.length >= 200);
    assert.ok(visible.filter((point) => point.streak > 2).length >= 80);
    assert.ok(points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(points.every((point) => point.depth >= STAR_NEAR_PLANE && point.depth < STAR_NEAR_PLANE + STAR_DEPTH));
    assert.ok(points.every((point) => point.streak <= MAX_STAR_STREAK));
  }
});

test("stars fade at the near plane and respawn invisibly in the distance", () => {
  const star = { ...createFlybyStars()[20], phase: 7 };
  const flight = getStarFlight(22000);
  const leaving = projectFlybyStar(star, { ...flight, distance: 6.99, previousDistance: 6.98 }, 1440, 900);
  const entering = projectFlybyStar(star, { ...flight, distance: 7.01, previousDistance: 7 }, 1440, 900);
  assert.ok(leaving.opacity < 0.005);
  assert.ok(entering.opacity < 0.005);
  assert.notEqual(leaving.cycle, entering.cycle);
});

test("the flight shares scene time and does not drift while paused", () => {
  const stars = createFlybyStars();
  const first = projectFlybyStar(stars[30], getStarFlight(18000), 1440, 900);
  assert.deepEqual(projectFlybyStar(stars[30], getStarFlight(18000), 1440, 900), first);
  assert.notDeepEqual(projectFlybyStar(stars[30], getStarFlight(19000), 1440, 900), first);
});

test("invalid flight times and viewport dimensions fail explicitly", () => {
  for (const invalid of [-1, NaN, Infinity, "100"]) {
    assert.throws(() => getStarFlight(invalid), RangeError);
  }
  const star = createFlybyStars()[0];
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.throws(() => projectFlybyStar(star, getStarFlight(18000), invalid, 900), RangeError);
    assert.throws(() => projectFlybyStar(star, getStarFlight(18000), 1440, invalid), RangeError);
  }
});
