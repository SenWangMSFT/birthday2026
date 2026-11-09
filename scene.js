export const INTRO_STEPS = Object.freeze([
  Object.freeze({ message: "正在检测今天……", duration: 5400 }),
  Object.freeze({ message: "发现一个特别的日子", duration: 5400 }),
  Object.freeze({ message: "正在确认主角……", duration: 5400 }),
  Object.freeze({ message: "确认完成", duration: 3600 }),
]);

export const INTRO_DURATION = INTRO_STEPS.reduce((total, step) => total + step.duration, 0);

export const HIDDEN_WISHES = Object.freeze([
  "愿你的每一次出发，都有好风相送。",
  "愿你被爱包围，也永远自由。",
  "愿平凡的日子里，总有小小的惊喜。",
  "愿你眼里有光，心里有热爱。",
  "新的一岁，继续做闪闪发光的自己。",
]);

export const BIRTHDAY_STEPS = Object.freeze([
  Object.freeze({ key: "dark", message: "让惊喜，从一片微光开始。", duration: 1600 }),
  Object.freeze({ key: "fragments", message: "把散落的片段，拼成一句祝福。", duration: 4000 }),
  Object.freeze({ key: "greeting", message: "生日快乐，陈君。", duration: 5200 }),
  Object.freeze({ key: "zoom", message: "穿过这句生日快乐，去找那颗最亮的星。", duration: 5000 }),
  Object.freeze({ key: "star-travel", message: "那颗星一直都在，现在，向它靠近。", duration: 4600 }),
  Object.freeze({ key: "star-dive", message: "再近一点，直到被星光包围。", duration: 4800 }),
  Object.freeze({ key: "illuminate", message: "穿过星光，去往我们的世界。", duration: 4000 }),
]);

export const GUIDE_STAR = Object.freeze({ x: 0.68, y: 0.3, radius: 1.15, opacity: 0.34 });
export const PUZZLE_TIMING = Object.freeze({ start: 3400, stagger: 1400, duration: 3200 });

export const COMET_LIFETIME = 1600;
export const COMET_MAX_LENGTH = 480;
export const COMET_MAX_POINTS = 160;

export class CometTrail {
  points = [];
  connected = false;
  head = null;
  target = null;

  move(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new RangeError("Comet coordinates must be finite numbers.");
    }
    if (!this.connected) {
      this.clear();
      this.head = { x, y };
      this.appendPoint(x, y);
    }
    this.target = { x, y };
    this.connected = true;
  }

  appendPoint(x, y, age = 0) {
    const last = this.points.at(-1);
    if (last && Math.hypot(x - last.x, y - last.y) < 0.8) return;
    this.points.push({ x, y, age });
    if (this.points.length > COMET_MAX_POINTS) this.points.shift();

    let length = 0;
    for (let index = this.points.length - 1; index > 0; index -= 1) {
      const current = this.points[index];
      const previous = this.points[index - 1];
      const segment = Math.hypot(current.x - previous.x, current.y - previous.y);
      if (length + segment > COMET_MAX_LENGTH) {
        const fraction = (COMET_MAX_LENGTH - length) / segment;
        this.points.splice(0, index, {
          x: current.x + (previous.x - current.x) * fraction,
          y: current.y + (previous.y - current.y) * fraction,
          age: previous.age,
        });
        break;
      }
      length += segment;
    }
  }

  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("Comet advancement must be finite and non-negative.");
    }
    if (milliseconds >= COMET_LIFETIME * 2) {
      this.clear();
      return;
    }
    for (const point of this.points) point.age += milliseconds;
    if (milliseconds > 0 && this.connected && this.head && this.target) {
      const from = this.head;
      const distance = Math.hypot(this.target.x - from.x, this.target.y - from.y);
      if (distance > 0.25) {
        const follow = 1 - Math.exp(-milliseconds / 90);
        const remaining = distance * (1 - follow);
        this.head = remaining < 0.25 ? { ...this.target } : {
          x: from.x + (this.target.x - from.x) * follow,
          y: from.y + (this.target.y - from.y) * follow,
        };
        const steps = Math.min(COMET_MAX_POINTS, Math.ceil(Math.hypot(this.head.x - from.x, this.head.y - from.y) / 6));
        for (let index = 1; index <= steps; index += 1) {
          const fraction = index / steps;
          this.appendPoint(
            from.x + (this.head.x - from.x) * fraction,
            from.y + (this.head.y - from.y) * fraction,
            milliseconds * (1 - fraction),
          );
        }
      }
    }
    this.points = this.points.filter((point) => point.age < COMET_LIFETIME);
    if (!this.points.length) this.clear();
  }

  disconnect() {
    this.connected = false;
    this.head = null;
    this.target = null;
  }

  clear() {
    this.points = [];
    this.connected = false;
    this.head = null;
    this.target = null;
  }
}

export const BIRTHDAY_STARTS = {};
let birthdayStart = 0;
for (const step of BIRTHDAY_STEPS) {
  BIRTHDAY_STARTS[step.key] = birthdayStart;
  birthdayStart += step.duration;
}
Object.freeze(BIRTHDAY_STARTS);

class SceneTimeline {
  elapsed = 0;
  paused = false;

  constructor(steps) {
    this.steps = steps;
    this.duration = steps.reduce((total, step) => total + step.duration, 0);
  }

  get finished() {
    return this.elapsed >= this.duration;
  }

  get stepIndex() {
    let end = 0;
    for (let index = 0; index < this.steps.length; index += 1) {
      end += this.steps[index].duration;
      if (this.elapsed < end) return index;
    }
    return this.steps.length - 1;
  }

  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) {
      throw new RangeError("Timeline advancement must be a finite, non-negative number.");
    }
    if (!this.paused) {
      this.elapsed = Math.min(this.duration, this.elapsed + milliseconds);
    }
  }

  skip() {
    this.elapsed = this.duration;
  }

  restart() {
    this.elapsed = 0;
  }
}

export class IntroTimeline extends SceneTimeline {
  constructor() {
    super(INTRO_STEPS);
  }
}

export class BirthdayTimeline extends SceneTimeline {
  constructor() {
    super(BIRTHDAY_STEPS);
  }
}

export function soften(value) {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

export function getIntroFrame(timeline) {
  const index = timeline.stepIndex;
  const start = INTRO_STEPS.slice(0, index).reduce((total, step) => total + step.duration, 0);
  const elapsed = timeline.elapsed - start;
  const duration = INTRO_STEPS[index].duration;
  const arrival = soften((elapsed - 200) / 1400);
  const dissolve = soften((elapsed - (duration - 1500)) / 1100);
  return {
    opacity: arrival * (1 - dissolve),
    blur: (1 - arrival) * 7 + dissolve * 5,
    drift: (1 - arrival) * 6 - dissolve * 3,
    spacing: 0.14 + (1 - arrival) * 0.08 + dissolve * 0.06,
  };
}

export function getBirthdayFrame(timeline) {
  const time = timeline.elapsed;
  const progress = (key) => {
    const step = BIRTHDAY_STEPS.find((item) => item.key === key);
    return Math.max(0, Math.min(1, (time - BIRTHDAY_STARTS[key]) / step.duration));
  };
  const zoom = progress("zoom");
  const travel = soften(progress("star-travel"));
  const dive = soften(progress("star-dive"));
  const glowStart = BIRTHDAY_STARTS["star-dive"] + 2880;
  return {
    stage: BIRTHDAY_STEPS[timeline.stepIndex].key,
    departure: soften(time / 1200),
    stars: 0.06 + 0.94 * soften(time / 5600),
    puzzleSettled: time >= PUZZLE_TIMING.start + PUZZLE_TIMING.stagger + PUZZLE_TIMING.duration,
    zoom: 1 + 31 * soften(zoom),
    titleOpacity: 1 - soften((zoom - 0.84) / 0.16),
    starTravel: travel,
    starZoom: (1 + travel * 2.2) * Math.pow(562.5, dive),
    heroOpacity: (GUIDE_STAR.opacity + 0.18 * soften(time / 2400) + 0.48 * dive) *
      (1 - soften(progress("illuminate") / 0.72)),
    lights: [glowStart, glowStart + 1100, glowStart + 1900]
      .map((start) => soften((time - start) / 3000)),
    wash: 0.94 * soften((time - glowStart) / 3400),
  };
}

export function projectStar(x, y, width, height, frame, depth = 1) {
  const travel = frame?.starTravel ?? 0;
  const zoom = 1 + ((frame?.starZoom ?? 1) - 1) * depth;
  return {
    x: (x - GUIDE_STAR.x) * width * zoom + width * (GUIDE_STAR.x + (0.5 - GUIDE_STAR.x) * travel),
    y: (y - GUIDE_STAR.y) * height * zoom + height * (GUIDE_STAR.y + (0.5 - GUIDE_STAR.y) * travel),
  };
}
