import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EYES_CLOSED_DURATION, FINALE_STEPS, FinalePlayer } from "../finale-model.js";

function countdown() {
  const player = new FinalePlayer();
  for (const step of FINALE_STEPS) {
    if (step.key === "countdown") break;
    player.advance(step.duration);
  }
  return player;
}

test("after Nanjing the finale visits the supplied scenes in order and holds on the cake", () => {
  const player = new FinalePlayer();
  const phases = [];
  for (const step of FINALE_STEPS) {
    phases.push(player.phase);
    if (step.key !== "cake") player.advance(step.duration);
  }
  assert.deepEqual(phases, ["arrival", "little-things", "letter", "last", "countdown", "cake"]);
  player.advance(9999999);
  assert.equal(player.phase, "cake");
  assert.equal(player.frame.opacity, 1);
  assert.equal(player.frame.audio, "birthday");
  assert.equal(player.canNext, false);
  assert.equal(player.canPrevious, false);
});

test("the Earth-to-paper handoff crossfades smoothly over six seconds without a background gap", () => {
  const player = new FinalePlayer();
  assert.equal(FINALE_STEPS[0].duration, 6000);
  let paper = 0;
  for (let index = 0; index < 600; index += 1) {
    player.advance(10);
    const frame = player.frame;
    assert.ok(frame.paper >= paper);
    assert.ok(frame.paper - paper < 0.003);
    assert.equal(frame.paper + frame.journeyOpacity, 1);
    paper = frame.paper;
  }
  assert.equal(player.phase, "little-things");
  assert.equal(player.frame.paper, 1);
  assert.equal(player.frame.opacity, 0);
});

test("reading pages have slow holds and fade completely before the next page appears", () => {
  const player = new FinalePlayer();
  player.advance(FINALE_STEPS[0].duration);
  for (const step of FINALE_STEPS.slice(1, 4)) {
    player.advance(1800);
    assert.equal(player.phase, step.key);
    assert.equal(player.frame.opacity, 1);
    player.advance(step.duration - 1801);
    assert.ok(player.frame.opacity < 0.00001);
    player.advance(1);
    assert.notEqual(player.phase, step.key);
    if (player.phase !== "countdown") assert.equal(player.frame.opacity, 0);
  }
  assert.deepEqual(FINALE_STEPS.slice(1, 4).map((step) => step.duration), [13000, 19000, 4000]);
});

test("the countdown is exactly thirty active seconds: no cake or birthday soundtrack at 29,999 ms", () => {
  const player = countdown();
  assert.equal(EYES_CLOSED_DURATION, 30000);
  assert.equal(player.frame.audio, "suspense");
  assert.equal(player.frame.seconds, 30);
  assert.equal(player.frame.opacity, 1);
  player.advance(1000);
  assert.equal(player.frame.seconds, 29);
  player.advance(28999);
  assert.equal(player.phase, "countdown");
  assert.equal(player.frame.seconds, 1);
  assert.equal(player.frame.audio, "suspense");
  player.advance(1);
  assert.equal(player.phase, "cake");
  assert.equal(player.elapsed, 0);
  assert.equal(player.frame.audio, "birthday");
  assert.equal(player.frame.opacity, 0);
  player.advance(2800);
  assert.equal(player.frame.opacity, 1);
});

test("Sunshine has a complete fade-out window before the heartbeat begins", () => {
  const player = new FinalePlayer();
  player.advance(FINALE_STEPS.slice(0, 3).reduce((sum, step) => sum + step.duration, 0));
  assert.equal(player.phase, "last");
  assert.equal(player.frame.audio, "quiet");
  player.navigate(1);
  const remaining = FINALE_STEPS[3].duration - player.elapsed;
  assert.ok(remaining >= 2600);
  assert.equal(player.phase, "last");
  player.advance(remaining - 1);
  assert.equal(player.frame.audio, "quiet");
  player.advance(1);
  assert.equal(player.frame.audio, "suspense");
  assert.equal(player.frame.paper, 0);
});

test("pause freezes the countdown and it resumes for only the remaining time", () => {
  const player = countdown();
  player.advance(6500);
  player.paused = true;
  const frame = player.frame;
  player.advance(999999);
  assert.deepEqual(player.frame, frame);
  assert.equal(player.elapsed, 6500);
  player.paused = false;
  player.advance(23499);
  assert.equal(player.phase, "countdown");
  player.advance(1);
  assert.equal(player.phase, "cake");
});

test("reading controls fade forward and backward without jumping and cannot skip a started countdown", () => {
  const player = new FinalePlayer();
  player.navigate(1);
  assert.equal(player.phase, "arrival");
  player.advance(6000 + 3000);
  player.navigate(1);
  assert.equal(player.phase, "little-things");
  assert.equal(player.frame.opacity, 1);
  const elapsed = player.elapsed;
  player.navigate(1);
  assert.equal(player.elapsed, elapsed);
  player.advance(2200);
  assert.equal(player.phase, "letter");
  player.advance(3000);
  player.navigate(-1);
  player.advance(2200);
  assert.equal(player.phase, "little-things");
  player.navigate(1);
  player.advance(2200);
  player.navigate(1);
  player.advance(2200);
  assert.equal(player.phase, "last");
  player.navigate(1);
  player.advance(2800);
  assert.equal(player.phase, "countdown");
  player.navigate(1);
  player.navigate(-1);
  assert.equal(player.elapsed, 0);
  assert.equal(player.phase, "countdown");
});

test("replay resets a completed ending without leaving a stale transition target", () => {
  const player = countdown();
  player.advance(30000);
  player.restart();
  assert.equal(player.phase, "arrival");
  assert.equal(player.elapsed, 0);
  assert.equal(player.target, null);
  assert.equal(player.frame.audio, "story");
  assert.equal(player.frame.paper, 0);
  for (const time of [-1, NaN, Infinity, "15"]) assert.throws(() => player.advance(time), RangeError);
  assert.throws(() => player.navigate(2), RangeError);
});

test("the two reading pages use photo-based birthday wording without the generic friendship or farewell copy", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const things = html.split('data-finale-page="little-things"')[1].split("</section>")[0];
  const letter = html.split('data-finale-page="letter"')[1].split("</section>")[0];
  assert.match(things, /我喜欢的那些<br \/>关于你的小事/);
  const items = [...things.matchAll(/<li><span>(\d+)<\/span><p>([^<]+)<\/p><\/li>/g)];
  assert.deepEqual(items.map((item) => item[1]), ["01", "02", "03", "04"]);
  for (const detail of [/一起做的怪表情/, /两杯饮料/, /球场、雪地/, /落叶的小路/, /旅途中牵着手/]) {
    assert.match(things, detail);
  }
  assert.match(letter, /写给 陈君/);
  assert.match(letter, /蒙特利尔的落日、多伦多的冬夜、渥太华的花，还有南京一起吃过的饭/);
  assert.match(letter, /镜子里挤在一起的我们/);
  assert.match(letter, /生日快乐，陈君。/);
  assert.doesNotMatch(things + letter, /朋友|十年|青春似乎到了尽头|各自奔赴|再次重逢|Mimi/);
});

test("the final prompt still has neither cake nor wish button", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const last = html.split('data-finale-page="last"')[1].split("</section>")[0];
  assert.match(last, /最后，还有一件事。/);
  assert.match(last, /还有一份惊喜，想留到最后。/);
  assert.doesNotMatch(last, /<button|<svg|cake|许愿/);
  const count = html.split('data-finale-page="countdown"')[1].split("</section>")[0];
  assert.match(count, /请轻轻闭上眼睛。/);
  assert.match(count, /三十秒后，再睁开。/);
  assert.doesNotMatch(count, /birthday-cake|<button/);
  assert.match(html, /data-finale-page="cake"[^>]*hidden/);
  assert.doesNotMatch(html, /开始许愿|吹蜡烛/);
});

test("the three reading chapters are consecutive 04, 05 and 06 without the reference's numbering gaps", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const numbers = ["little-things", "letter", "last"].map((phase) =>
    html.split(`data-finale-page="${phase}"`)[1].split("</section>")[0]
      .match(/class="finale-eyebrow">(\d+)/)[1]);
  assert.deepEqual(numbers, ["04", "05", "06"]);
});
