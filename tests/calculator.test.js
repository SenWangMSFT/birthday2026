import assert from "node:assert/strict";
import test from "node:test";
import { calculate, easternDateNumber, MagicCalculator } from "../calculator-model.js";
import { MAGIC_REVEAL_DURATION, REDUCED_MAGIC_DURATION, magicRevealFrame } from "../magic-opening.js";

function enter(calculator, keys) {
  let reveal = null;
  for (const key of keys) reveal = calculator.press(key);
  return reveal;
}

const now = () => new Date("2026-11-11T04:20:00Z");
const arm = (calculator) => enter(calculator, ["AC", "AC", "AC"]);

test("Eastern date numbers use the chosen padded MMDDHHmm 24-hour format, not the device timezone", () => {
  assert.deepEqual(easternDateNumber(now()), {
    year: "2026", month: "11", day: "10", hour: "23", minute: "20",
    token: "11102320", label: "2026年11月10日 23:20 · 美东时间",
  });
  assert.equal(easternDateNumber(new Date("2026-11-11T03:00:00Z")).token, "11102200");
  assert.equal(easternDateNumber(new Date("2026-01-01T05:00:00Z")).token, "01010000");
  assert.equal(easternDateNumber(new Date("2026-01-01T04:59:00Z")).token, "12312359");
});

test("Eastern time automatically follows both daylight-saving boundaries", () => {
  assert.equal(easternDateNumber(new Date("2026-03-08T06:59:00Z")).token, "03080159");
  assert.equal(easternDateNumber(new Date("2026-03-08T07:00:00Z")).token, "03080300");
  assert.equal(easternDateNumber(new Date("2026-11-01T05:59:00Z")).token, "11010159");
  assert.equal(easternDateNumber(new Date("2026-11-01T06:00:00Z")).token, "11010100");
  assert.equal(easternDateNumber(new Date("2026-07-10T03:20:00Z")).token, "07092320");
});

test("a fresh calculator is normal and does not consult the clock during ordinary arithmetic", () => {
  const calculator = new MagicCalculator(() => { throw new Error("The normal calculator must not read the clock."); });
  assert.equal(calculator.magic, false);
  assert.equal(enter(calculator, ["1", "2", "+", "3", "4", "="]), null);
  assert.equal(calculator.display, "46");
  assert.equal(calculator.expression, "12 + 34 =");
  assert.equal(enter(calculator, ["AC", "8", "*", "7", "="]), null);
  assert.equal(calculator.display, "56");
});

test("normal decimals are calculated exactly without floating-point artifacts", () => {
  const calculator = new MagicCalculator();
  enter(calculator, ["0", ".", "1", "+", "0", ".", "2", "="]);
  assert.equal(calculator.display, "0.3");
  assert.equal(calculate("1.2", "*", "-0.5"), "-0.6");
  assert.equal(calculate("1", "/", "3"), "0.333333333333");
  assert.equal(calculate("2", "/", "3"), "0.666666666667");
  assert.equal(calculate("10", "/", "4"), "2.5");
  assert.equal(calculate("0", "*", "-10"), "0");
});

test("normal chained operations, operator replacement and repeated equals behave like a basic calculator", () => {
  const calculator = new MagicCalculator();
  enter(calculator, ["2", "+", "3", "*", "4", "="]);
  assert.equal(calculator.display, "20");
  calculator.press("=");
  assert.equal(calculator.display, "80");
  enter(calculator, ["AC", "9", "+", "-", "2", "="]);
  assert.equal(calculator.display, "7");
  enter(calculator, ["AC", "5", "+", "="]);
  assert.equal(calculator.display, "10");
  enter(calculator, ["2"]);
  assert.equal(calculator.display, "2");
});

test("sign, percent, decimal point, backspace and all clear work without activating the trick", () => {
  const calculator = new MagicCalculator();
  enter(calculator, ["1", "2", "3", "backspace", "sign"]);
  assert.equal(calculator.display, "-12");
  calculator.press("sign");
  assert.equal(calculator.display, "12");
  calculator.press("%");
  assert.equal(calculator.display, "0.12");
  enter(calculator, ["AC", ".", ".", "5"]);
  assert.equal(calculator.display, "0.5");
  calculator.press("AC");
  assert.equal(calculator.display, "0");
  assert.equal(calculator.magic, false);
  enter(calculator, ["2", "0", "0", "+", "1", "0", "%", "="]);
  assert.equal(calculator.display, "220");
  enter(calculator, ["AC", "2", "0", "0", "*", "1", "0", "%", "="]);
  assert.equal(calculator.display, "20");
});

test("only three consecutive AC presses arm magic, with no different display, expression or error", () => {
  const calculator = new MagicCalculator(now);
  calculator.press("AC");
  calculator.press("AC");
  assert.equal(calculator.magic, false);
  calculator.press("0");
  calculator.press("AC");
  calculator.press("AC");
  assert.equal(calculator.magic, false);
  const before = [calculator.display, calculator.expression, calculator.error];
  calculator.press("AC");
  assert.equal(calculator.magic, true);
  assert.deepEqual([calculator.display, calculator.expression, calculator.error], before);
  calculator.press("AC");
  assert.equal(calculator.magic, true);
});

test("every second-number tap shows date number minus the first, regardless of which digit is tapped", () => {
  const calculator = new MagicCalculator(now);
  arm(calculator);
  enter(calculator, ["1", "2", "3", "4", "5", "+"]);
  for (const key of ["7", "9", "0", ".", "sign", "%", "backspace"]) {
    assert.equal(calculator.press(key), null);
    assert.equal(calculator.entry, "11089975");
    assert.equal(calculate("12345", "+", calculator.entry), "11102320");
  }
  const reveal = calculator.press("=");
  assert.equal(reveal.token, "11102320");
  assert.equal(calculator.display, "11102320");
  assert.equal(calculator.expression, "12345 + 11089975 =");
});

test("the final current Eastern minute is captured on equals, even if the second number was typed earlier", () => {
  let current = new Date("2026-11-11T04:59:00Z");
  const calculator = new MagicCalculator(() => current);
  arm(calculator);
  enter(calculator, ["7", "+", "6"]);
  assert.equal(calculator.entry, "11102352");
  current = new Date("2026-11-11T05:00:00Z");
  const reveal = calculator.press("=");
  assert.equal(reveal.token, "11110000");
  assert.equal(reveal.label, "2026年11月11日 00:00 · 美东时间");
  assert.equal(calculator.entry, reveal.token);
  assert.equal(calculator.expression, "7 + 11109993 =");
});

test("after the forced operand appears only equals works, including accidental AC, digits and operator presses", () => {
  let date = now();
  const calculator = new MagicCalculator(() => date);
  arm(calculator);
  enter(calculator, ["1", "2", "3", "+", "9"]);
  const state = {
    entry: calculator.entry, accumulator: calculator.accumulator,
    operator: calculator.operator, forcedSecond: calculator.forcedSecond,
    expression: calculator.expression, display: calculator.display, acStreak: calculator.acStreak,
  };
  date = new Date("2026-11-11T04:21:00Z");
  for (const key of ["AC", "AC", "AC", "+", "-", "*", "/", "%", "sign", ".", "backspace", ..."0123456789"]) {
    assert.equal(calculator.press(key), null);
    assert.deepEqual({
      entry: calculator.entry, accumulator: calculator.accumulator,
      operator: calculator.operator, forcedSecond: calculator.forcedSecond,
      expression: calculator.expression, display: calculator.display, acStreak: calculator.acStreak,
    }, state);
  }
  assert.equal(calculator.press("=").token, "11102321");
  assert.equal(calculator.expression, "123 + 11102198 =");
});

test("January results retain all eight digits and split into the same date shown in the clock label", () => {
  const calculator = new MagicCalculator(() => new Date("2026-01-01T05:00:00Z"));
  arm(calculator);
  const reveal = enter(calculator, ["1", "0", "+", "2", "="]);
  assert.equal(calculator.display, "01010000");
  assert.equal(reveal.month, "01");
  assert.equal(reveal.day, "01");
  assert.equal(reveal.hour, "00");
  assert.equal(reveal.minute, "00");
});

test("large, negative and decimal first numbers still yield the exact date number", () => {
  for (const first of ["999999999999", "-12345", "0.00000000001", "123.456"]) {
    const calculator = new MagicCalculator(now);
    arm(calculator);
    const negative = first.startsWith("-");
    enter(calculator, [...first.replace("-", "")]);
    if (negative) calculator.press("sign");
    calculator.press("+");
    calculator.press("9");
    const second = calculator.entry;
    assert.equal(calculate(first, "+", second), "11102320");
    assert.equal(calculator.press("=").token, "11102320");
  }
});

test("armed mode leaves other operators normal, and addition requires a second-number tap before revealing", () => {
  const calculator = new MagicCalculator(now);
  arm(calculator);
  assert.equal(enter(calculator, ["8", "*", "9", "="]), null);
  assert.equal(calculator.display, "72");
  enter(calculator, ["AC", "8", "+"]);
  assert.equal(calculator.press("="), null);
  assert.equal(calculator.display, "16");
});

test("restart disarms magic, clears all pending arithmetic and returns the normal default", () => {
  const calculator = new MagicCalculator(now);
  arm(calculator);
  enter(calculator, ["9", "+", "2"]);
  calculator.reset();
  assert.equal(calculator.magic, false);
  assert.equal(calculator.display, "0");
  assert.equal(calculator.expression, "");
  assert.equal(enter(calculator, ["9", "+", "2", "="]), null);
  assert.equal(calculator.display, "11");
});

test("division by zero is explicit and recoverable without a fake successful result", () => {
  const calculator = new MagicCalculator();
  enter(calculator, ["1", "/", "0"]);
  assert.throws(() => calculator.press("="), /不能除以零/);
  assert.equal(calculator.display, "无法计算");
  assert.match(calculator.error, /不能除以零/);
  calculator.press("2");
  assert.equal(calculator.display, "2");
  assert.equal(calculator.error, "");
  assert.throws(() => calculator.press("eval"), TypeError);
  assert.throws(() => calculate("1", "unknown", "2"), TypeError);
  assert.throws(() => calculate("alert(1)", "+", "2"), TypeError);
});

test("typed input is bounded but ordinary large results stay readable", () => {
  const calculator = new MagicCalculator();
  enter(calculator, "1234567890123456789");
  assert.equal(calculator.display, "123456789012");
  enter(calculator, ["*", ..."999999999999", "="]);
  assert.match(calculator.display, /e\+/);
  assert.ok(calculator.entry.length > 12);
});

test("reveal choreography holds the answer, lifts it, explains the date, creates a key, unlocks, then fades", () => {
  const start = magicRevealFrame(0);
  assert.equal(start.lift, 0);
  assert.equal(start.calculatorFade, 0);
  assert.equal(start.split, 0);
  assert.equal(start.finished, false);
  assert.equal(magicRevealFrame(3200).lift, 1);
  assert.equal(magicRevealFrame(5200).split, 1);
  assert.equal(magicRevealFrame(6200).explain, 1);
  assert.equal(magicRevealFrame(9000).becomeKey, 1);
  assert.equal(magicRevealFrame(10500).keyTravel, 1);
  assert.equal(magicRevealFrame(11800).unlock, 1);
  assert.equal(magicRevealFrame(MAGIC_REVEAL_DURATION).exit, 1);
  assert.equal(magicRevealFrame(MAGIC_REVEAL_DURATION).finished, true);
  assert.deepEqual(magicRevealFrame(REDUCED_MAGIC_DURATION, true), magicRevealFrame(MAGIC_REVEAL_DURATION));
});

test("all reveal curves are continuous, bounded and stable at the end", () => {
  let previous = magicRevealFrame(0);
  for (let time = 16; time <= MAGIC_REVEAL_DURATION; time += 16) {
    const next = magicRevealFrame(time);
    for (const key of ["lift", "calculatorFade", "split", "explain", "becomeKey", "keyTravel", "unlock", "exit"]) {
      assert.ok(next[key] >= 0 && next[key] <= 1);
      assert.ok(Math.abs(next[key] - previous[key]) < 0.03);
    }
    previous = next;
  }
  assert.deepEqual(magicRevealFrame(999999), magicRevealFrame(MAGIC_REVEAL_DURATION));
  assert.throws(() => magicRevealFrame(-1), RangeError);
  assert.throws(() => magicRevealFrame(NaN), RangeError);
});
