const easternClock = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
const OPERATORS = new Set(["+", "-", "*", "/"]);
export const CALCULATOR_INPUT_DIGITS = 12;

export function easternDateNumber(date = new Date()) {
  const parts = Object.fromEntries(easternClock.formatToParts(date).map(({ type, value }) => [type, value]));
  const { year, month, day, hour, minute } = parts;
  return {
    year, month, day, hour, minute,
    token: `${month}${day}${hour}${minute}`,
    label: `${year}年${month}月${day}日 ${hour}:${minute} · 美东时间`,
  };
}

function decimal(value) {
  if (!/^-?\d+(?:\.\d*)?$/.test(value)) throw new TypeError("Invalid calculator number.");
  const [whole, fraction = ""] = value.split(".");
  return { coefficient: BigInt(whole + fraction), scale: fraction.length };
}

function decimalString(coefficient, scale) {
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString().padStart(scale + 1, "0");
  if (digits.length > 120) throw new RangeError("计算结果过大，请按 AC 重新开始。");
  const value = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") : digits;
  return `${negative && coefficient !== 0n ? "-" : ""}${value}`;
}

export function calculate(left, operator, right) {
  const a = decimal(left);
  const b = decimal(right);
  const scale = Math.max(a.scale, b.scale);
  const first = a.coefficient * 10n ** BigInt(scale - a.scale);
  const second = b.coefficient * 10n ** BigInt(scale - b.scale);
  if (operator === "+") return decimalString(first + second, scale);
  if (operator === "-") return decimalString(first - second, scale);
  if (operator === "*") return decimalString(a.coefficient * b.coefficient, a.scale + b.scale);
  if (operator !== "/") throw new TypeError("Unknown calculator operator.");
  if (b.coefficient === 0n) throw new RangeError("不能除以零，请按 AC 或输入新数字。");
  const numerator = a.coefficient * 10n ** BigInt(b.scale + 12);
  const denominator = b.coefficient * 10n ** BigInt(a.scale);
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  const absolute = (value) => value < 0n ? -value : value;
  if (absolute(remainder) * 2n >= absolute(denominator)) {
    quotient += (numerator < 0n) !== (denominator < 0n) ? -1n : 1n;
  }
  return decimalString(quotient, 12);
}

export class MagicCalculator {
  constructor(now = () => new Date()) {
    this.now = now;
    this.reset();
  }

  reset() {
    this.magic = false;
    this.acStreak = 0;
    this.clear();
  }

  clear() {
    this.entry = "0";
    this.accumulator = null;
    this.operator = null;
    this.waiting = false;
    this.forcedSecond = false;
    this.result = false;
    this.expression = "";
    this.error = "";
    this.repeat = null;
  }

  get display() {
    if (this.error) return "无法计算";
    return this.entry.length <= 16 ? this.entry : Number(this.entry).toExponential(8);
  }

  forceSecond() {
    this.entry = calculate(this.eastern().token, "-", this.accumulator);
    this.waiting = false;
    this.forcedSecond = true;
  }

  eastern() {
    return easternDateNumber(this.now());
  }

  press(key) {
    if (!/^\d$/.test(key) && !OPERATORS.has(key) &&
        !["AC", ".", "sign", "%", "backspace", "="].includes(key)) {
      throw new TypeError(`Unknown calculator key: ${key}`);
    }
    if (this.magic && this.forcedSecond && key !== "=") return null;
    if (key === "AC") {
      this.acStreak += 1;
      if (this.acStreak >= 3) this.magic = true;
      this.clear();
      return null;
    }
    this.acStreak = 0;
    if (this.error) this.clear();
    try {
      return this.apply(key);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.clear();
      this.error = error.message;
      throw error;
    }
  }

  apply(key) {
    const digit = /^\d$/.test(key);
    if (digit || key === "." || key === "sign" || key === "%" || key === "backspace") {
      if (this.magic && this.operator === "+") {
        this.forceSecond();
        return null;
      }
      if (this.result && (digit || key === ".")) this.clear();
      if (this.waiting) {
        this.entry = "0";
        this.waiting = false;
      }
      if (digit) {
        if (this.entry.replace(/\D/g, "").length < CALCULATOR_INPUT_DIGITS || this.entry === "0") {
          this.entry = this.entry === "0" ? key : this.entry === "-0" ? `-${key}` : this.entry + key;
        }
      } else if (key === "." && !this.entry.includes(".")) this.entry += ".";
      else if (key === "sign") this.entry = this.entry.startsWith("-") ? this.entry.slice(1) : `-${this.entry}`;
      else if (key === "%") {
        const percentage = calculate(this.entry, "/", "100");
        this.entry = this.operator === "+" || this.operator === "-"
          ? calculate(this.accumulator, "*", percentage) : percentage;
      }
      else if (key === "backspace") this.entry = this.entry.slice(0, -1).replace(/^-$/, "") || "0";
      this.result = false;
      this.repeat = null;
      return null;
    }
    if (OPERATORS.has(key)) {
      if (this.operator && !this.waiting) this.entry = calculate(this.accumulator, this.operator, this.entry);
      this.accumulator = this.entry;
      this.operator = key;
      this.waiting = true;
      this.forcedSecond = false;
      this.result = false;
      this.repeat = null;
      this.expression = `${this.accumulator} ${this.operatorLabel(key)}`;
      return null;
    }
    let reveal = null;
    if (this.operator) {
      let second = this.waiting ? this.accumulator : this.entry;
      if (this.magic && this.operator === "+" && this.forcedSecond) {
        reveal = this.eastern();
        second = calculate(reveal.token, "-", this.accumulator);
      }
      const answer = calculate(this.accumulator, this.operator, second);
      this.expression = `${this.accumulator} ${this.operatorLabel(this.operator)} ${second} =`;
      this.repeat = { operator: this.operator, second };
      this.entry = reveal ? reveal.token : answer;
    } else if (this.repeat) {
      this.expression = `${this.entry} ${this.operatorLabel(this.repeat.operator)} ${this.repeat.second} =`;
      this.entry = calculate(this.entry, this.repeat.operator, this.repeat.second);
    }
    this.accumulator = null;
    this.operator = null;
    this.waiting = false;
    this.forcedSecond = false;
    this.result = true;
    return reveal;
  }

  operatorLabel(operator) {
    return { "+": "+", "-": "−", "*": "×", "/": "÷" }[operator];
  }
}
