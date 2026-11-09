import assert from "node:assert/strict";
import test from "node:test";
import { BIRTHDAY_STEPS, GUIDE_STAR, INTRO_DURATION, INTRO_STEPS, BirthdayTimeline, IntroTimeline, getBirthdayFrame, getIntroFrame, projectStar } from "../scene.js";

test("the cinematic pacing leaves time to read each message", () => {
  for (const step of INTRO_STEPS.slice(0, -1)) {
    assert.ok(step.duration >= 4000);
  }
  assert.ok(INTRO_STEPS.at(-1).duration >= 2500);
  assert.equal(INTRO_DURATION, 19800);
});

test("opening messages arrive from mist, hold clearly, then dissolve completely", () => {
  const timeline = new IntroTimeline();
  assert.equal(getIntroFrame(timeline).opacity, 0);
  assert.equal(getIntroFrame(timeline).blur, 7);
  timeline.advance(1800);
  assert.equal(getIntroFrame(timeline).opacity, 1);
  assert.equal(getIntroFrame(timeline).blur, 0);
  timeline.advance(2700);
  assert.ok(getIntroFrame(timeline).opacity > 0 && getIntroFrame(timeline).opacity < 1);
  assert.ok(getIntroFrame(timeline).blur > 0);
  timeline.advance(500);
  assert.equal(getIntroFrame(timeline).opacity, 0);
});

test("each word change happens in darkness, including the final reveal boundary", () => {
  const timeline = new IntroTimeline();
  for (const step of INTRO_STEPS) {
    timeline.advance(step.duration - 350);
    assert.equal(getIntroFrame(timeline).opacity, 0);
    timeline.advance(350);
    assert.equal(getIntroFrame(timeline).opacity, 0);
  }
  assert.equal(timeline.finished, true);
});

test("fog transitions stay continuous and pause without drifting", () => {
  const timeline = new IntroTimeline();
  let previous = getIntroFrame(timeline);
  for (let time = 0; time < INTRO_DURATION; time += 10) {
    timeline.advance(10);
    const next = getIntroFrame(timeline);
    assert.ok(Math.abs(next.opacity - previous.opacity) < 0.02);
    assert.ok(next.opacity >= 0 && next.opacity <= 1);
    previous = next;
  }
  timeline.restart();
  timeline.advance(800);
  const frame = getIntroFrame(timeline);
  timeline.paused = true;
  timeline.advance(10000);
  assert.deepEqual(getIntroFrame(timeline), frame);
});

test("the opening follows all four reference stages in order", () => {
  const timeline = new IntroTimeline();
  assert.equal(timeline.stepIndex, 0);
  assert.equal(timeline.finished, false);

  for (let index = 0; index < INTRO_STEPS.length; index += 1) {
    assert.equal(timeline.stepIndex, index);
    timeline.advance(INTRO_STEPS[index].duration - 1);
    assert.equal(timeline.stepIndex, index);
    assert.equal(timeline.finished, false);
    timeline.advance(1);
  }
  assert.equal(timeline.finished, true);
  assert.equal(timeline.elapsed, INTRO_DURATION);
});

test("pause freezes the opening and resume continues from the same point", () => {
  const timeline = new IntroTimeline();
  const halfStep = INTRO_STEPS[0].duration / 2;
  timeline.advance(halfStep);
  timeline.paused = true;
  timeline.advance(10000);
  assert.equal(timeline.elapsed, halfStep);
  assert.equal(timeline.stepIndex, 0);
  timeline.paused = false;
  timeline.advance(halfStep);
  assert.equal(timeline.stepIndex, 1);
});

test("skip reveals the birthday immediately, including while paused", () => {
  const timeline = new IntroTimeline();
  timeline.paused = true;
  timeline.skip();
  assert.equal(timeline.finished, true);
  assert.equal(timeline.stepIndex, 3);
  assert.equal(timeline.paused, true);
});

test("replay resets a completed opening without changing the pause preference", () => {
  const timeline = new IntroTimeline();
  timeline.skip();
  timeline.paused = true;
  timeline.restart();
  assert.equal(timeline.elapsed, 0);
  assert.equal(timeline.stepIndex, 0);
  assert.equal(timeline.finished, false);
  assert.equal(timeline.paused, true);
});

test("a slow frame cannot advance beyond the final reveal", () => {
  const timeline = new IntroTimeline();
  timeline.advance(INTRO_DURATION * 10);
  timeline.advance(1000);
  assert.equal(timeline.elapsed, INTRO_DURATION);
  assert.equal(timeline.finished, true);
});

test("invalid time increments fail explicitly without changing the timeline", () => {
  const timeline = new IntroTimeline();
  for (const invalid of [-1, NaN, Infinity, -Infinity, "100", undefined]) {
    assert.throws(() => timeline.advance(invalid), RangeError);
  }
  assert.equal(timeline.elapsed, 0);
});

test("the birthday button continuation follows every new reference state", () => {
  const timeline = new BirthdayTimeline();
  const stages = [];
  for (const step of BIRTHDAY_STEPS) {
    stages.push(getBirthdayFrame(timeline).stage);
    timeline.advance(step.duration);
  }
  assert.deepEqual(stages, ["dark", "fragments", "greeting", "zoom", "star-travel", "star-dive", "illuminate"]);
  assert.equal(timeline.duration, 29200);
  assert.equal(timeline.finished, true);
});

test("the continuation lights the actual puzzle pieces before they assemble", () => {
  const timeline = new BirthdayTimeline();
  const first = getBirthdayFrame(timeline);
  assert.equal(first.puzzleSettled, false);
  assert.deepEqual(first.lights, [0, 0, 0]);
  assert.equal(first.wash, 0);
  timeline.advance(4000);
  assert.equal(getBirthdayFrame(timeline).puzzleSettled, false);
  timeline.advance(3999);
  assert.equal(getBirthdayFrame(timeline).puzzleSettled, false);
  timeline.advance(1);
  assert.equal(getBirthdayFrame(timeline).puzzleSettled, true);
});

test("the greeting zooms completely through the frame before fading away", () => {
  const timeline = new BirthdayTimeline();
  timeline.advance(10000);
  assert.equal(getBirthdayFrame(timeline).puzzleSettled, true);
  assert.equal(getBirthdayFrame(timeline).zoom, 1);
  assert.equal(getBirthdayFrame(timeline).titleOpacity, 1);
  timeline.advance(5000);
  assert.ok(getBirthdayFrame(timeline).zoom > 29);
  assert.equal(getBirthdayFrame(timeline).titleOpacity, 1);
  timeline.advance(800);
  const stars = getBirthdayFrame(timeline);
  assert.equal(stars.stage, "star-travel");
  assert.equal(stars.zoom, 32);
  assert.equal(stars.titleOpacity, 0);
  assert.equal(stars.puzzleSettled, true);
  assert.equal(stars.wash, 0);
});

test("the guide star stays at its existing position until the camera travels to it", () => {
  const timeline = new BirthdayTimeline();
  for (const [width, height] of [[1440, 900], [834, 1194]]) {
    const resting = projectStar(GUIDE_STAR.x, GUIDE_STAR.y, width, height);
    const afterClick = projectStar(GUIDE_STAR.x, GUIDE_STAR.y, width, height, getBirthdayFrame(timeline));
    assert.deepEqual(afterClick, resting);
    assert.equal(resting.x, width * GUIDE_STAR.x);
    assert.equal(resting.y, height * GUIDE_STAR.y);
  }
  assert.ok(getBirthdayFrame(timeline).heroOpacity > 0);
  timeline.advance(20400);
  const arrived = getBirthdayFrame(timeline);
  assert.equal(arrived.starTravel, 1);
  assert.equal(arrived.starZoom, 3.2);
  assert.deepEqual(projectStar(GUIDE_STAR.x, GUIDE_STAR.y, 1440, 900, arrived), { x: 720, y: 450 });
});

test("the star approaches the center monotonically without first drifting away", () => {
  const timeline = new BirthdayTimeline();
  timeline.advance(15800);
  let distance = Infinity;
  for (let frame = 0; frame <= 46; frame += 1) {
    const position = projectStar(GUIDE_STAR.x, GUIDE_STAR.y, 1440, 900, getBirthdayFrame(timeline));
    const next = Math.hypot(position.x - 720, position.y - 450);
    assert.ok(next <= distance + 1e-8);
    distance = next;
    if (frame < 46) timeline.advance(100);
  }
  assert.equal(distance, 0);
});

test("the camera dives into the same star until its diffuse light fills the viewport", () => {
  const timeline = new BirthdayTimeline();
  timeline.advance(20400);
  const start = getBirthdayFrame(timeline);
  timeline.advance(2400);
  const middle = getBirthdayFrame(timeline);
  assert.equal(middle.stage, "star-dive");
  assert.ok(middle.starZoom > start.starZoom * 20);
  timeline.advance(2400);
  const end = getBirthdayFrame(timeline);
  assert.equal(end.stage, "illuminate");
  assert.equal(end.starZoom, 1800);
  assert.ok(GUIDE_STAR.radius * end.starZoom * 3 > 2160);
  assert.deepEqual(projectStar(GUIDE_STAR.x, GUIDE_STAR.y, 834, 1194, end), { x: 417, y: 597 });
});

test("the guide star stays point-sized and only subtly brighter until the dive", () => {
  const timeline = new BirthdayTimeline();
  assert.ok(GUIDE_STAR.radius >= 0.35 && GUIDE_STAR.radius <= 1.3);
  assert.equal(getBirthdayFrame(timeline).heroOpacity, GUIDE_STAR.opacity);
  for (let time = 0; time <= 20400; time += 100) {
    const frame = getBirthdayFrame(timeline);
    assert.ok(frame.heroOpacity >= GUIDE_STAR.opacity);
    assert.ok(frame.heroOpacity <= 0.52);
    timeline.advance(100);
  }
});

test("warm light blooms in separate pools, progressively rather than as a flash", () => {
  const timeline = new BirthdayTimeline();
  timeline.advance(23500);
  assert.ok(getBirthdayFrame(timeline).lights[0] > 0);
  assert.equal(getBirthdayFrame(timeline).lights[1], 0);
  assert.equal(getBirthdayFrame(timeline).lights[2], 0);
  let previous = getBirthdayFrame(timeline);
  while (!timeline.finished) {
    timeline.advance(100);
    const next = getBirthdayFrame(timeline);
    next.lights.forEach((value, index) => {
      assert.ok(value >= previous.lights[index]);
      assert.ok(value - previous.lights[index] < 0.05);
    });
    assert.ok(next.wash >= previous.wash);
    assert.ok(next.wash - previous.wash < 0.05);
    previous = next;
  }
  assert.deepEqual(previous.lights, [1, 1, 1]);
  assert.equal(previous.wash, 0.94);
});

test("pause freezes the birthday lighting; replay returns it to complete darkness", () => {
  const timeline = new BirthdayTimeline();
  timeline.advance(26000);
  timeline.paused = true;
  const paused = getBirthdayFrame(timeline);
  timeline.advance(10000);
  assert.deepEqual(getBirthdayFrame(timeline), paused);
  timeline.restart();
  assert.equal(timeline.paused, true);
  assert.equal(getBirthdayFrame(timeline).stage, "dark");
  assert.equal(getBirthdayFrame(timeline).wash, 0);
});

test("skipping the continuation reaches a stable, fully lit ending", () => {
  const timeline = new BirthdayTimeline();
  timeline.skip();
  const ending = getBirthdayFrame(timeline);
  timeline.advance(10000);
  assert.deepEqual(getBirthdayFrame(timeline), ending);
  assert.deepEqual(ending.lights, [1, 1, 1]);
  assert.equal(timeline.finished, true);
});
