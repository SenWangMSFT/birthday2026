import { MagicCalculator } from "./calculator-model.js";
import { soften } from "./scene.js";

export const MAGIC_REVEAL_DURATION = 14200;
export const REDUCED_MAGIC_DURATION = 8000;
export const MAGIC_UNLOCK_TIME = 10500;

export function magicRevealFrame(elapsed, reduced = false) {
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("Reveal time must be finite and non-negative.");
  const time = reduced ? elapsed * MAGIC_REVEAL_DURATION / REDUCED_MAGIC_DURATION : elapsed;
  const progress = (start, duration) => soften((time - start) / duration);
  return {
    lift: progress(1000, 2200),
    calculatorFade: progress(1200, 1800),
    split: progress(3200, 1800),
    explain: progress(3900, 1400) * (1 - progress(7400, 1200)),
    becomeKey: progress(7200, 1800),
    keyTravel: progress(9000, MAGIC_UNLOCK_TIME - 9000),
    unlock: progress(MAGIC_UNLOCK_TIME, 1300),
    exit: progress(11800, 2400),
    finished: time >= MAGIC_REVEAL_DURATION,
  };
}

export class MagicOpening {
  constructor({ root, notify, onComplete, onActivity, onUnlock }) {
    this.root = root;
    this.notify = notify;
    this.onComplete = onComplete;
    this.onActivity = onActivity;
    this.onUnlock = onUnlock;
    this.calculator = new MagicCalculator();
    this.card = root.querySelector(".magic-calculator");
    this.keys = root.querySelector(".calculator-keys");
    this.output = root.querySelector("#calculator-value");
    this.expression = root.querySelector(".calculator-expression");
    this.number = root.querySelector(".magic-number");
    this.pairs = [...this.number.querySelectorAll(".magic-pair")];
    this.dateCopy = root.querySelector(".magic-date-copy");
    this.dateLabel = root.querySelector(".magic-date-label");
    this.lock = root.querySelector(".magic-lock");
    this.lockTitle = root.querySelector(".magic-lock-title");
    this.lockNote = root.querySelector(".magic-lock-note");
    this.key = root.querySelector(".magic-key");
    this.status = root.querySelector(".magic-status");
    this.active = true;
    this.revealing = false;
    this.elapsed = 0;
    this.unlockPlayed = false;
    this.keys.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-key]");
      if (button && this.keys.contains(button)) this.press(button.dataset.key);
    });
    document.addEventListener("keydown", (event) => {
      if (!this.active || this.revealing || event.ctrlKey || event.metaKey || event.altKey || event.repeat ||
          event.target.closest("input, textarea, select, [contenteditable]")) return;
      if (event.target.closest("button") && ["Enter", " "].includes(event.key)) return;
      const key = /^\d$/.test(event.key) ? event.key : {
        "+": "+", "-": "-", "*": "*", "/": "/", ".": ".", "%": "%",
        "=": "=", Enter: "=", Backspace: "backspace", Delete: "AC", c: "AC", C: "AC",
      }[event.key];
      if (!key) return;
      event.preventDefault();
      this.output.parentElement.focus({ preventScroll: true });
      this.press(key);
    });
    new ResizeObserver(() => {
      if (this.revealing) {
        this.measure();
        this.renderReveal();
      }
    }).observe(root);
    this.renderCalculator();
  }

  press(key) {
    if (!this.active || this.revealing) return;
    let reveal;
    try {
      reveal = this.calculator.press(key);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      this.notify(error.message);
    }
    this.renderCalculator();
    if (!reveal) return;
    this.revealing = true;
    this.reveal = reveal;
    this.elapsed = 0;
    this.keys.inert = true;
    this.status.textContent = "答案，正在离开计算器。";
    for (const [index, pair] of this.pairs.entries()) {
      pair.querySelector(".magic-pair-digits").textContent = reveal.token.slice(index * 2, index * 2 + 2);
    }
    this.dateLabel.textContent = reveal.label;
    this.measure();
    this.number.hidden = false;
    this.root.dataset.revealing = "true";
    this.renderReveal();
    this.onActivity();
  }

  renderCalculator() {
    this.output.textContent = this.calculator.display;
    this.expression.textContent = this.calculator.expression || "\u00a0";
    this.output.style.fontSize = `${Math.max(20, Math.min(42, 470 / Math.max(8, this.calculator.display.length)))}px`;
    this.status.textContent = this.calculator.error;
  }

  measure() {
    const root = this.root.getBoundingClientRect();
    const source = this.output.getBoundingClientRect();
    const lock = this.root.querySelector(".magic-lock-symbol").getBoundingClientRect();
    this.geometry = {
      sourceX: source.left + source.width / 2 - root.left - root.width / 2,
      sourceY: source.top + source.height / 2 - root.top - root.height / 2,
      sourceFont: parseFloat(getComputedStyle(this.output).fontSize),
      finalFont: parseFloat(getComputedStyle(this.number).fontSize),
      lockX: lock.left + lock.width / 2 - root.left - root.width / 2,
      lockY: lock.top + lock.height * 0.66 - root.top - root.height / 2,
    };
  }

  advance(milliseconds, paused, reduced) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new RangeError("Opening time must be finite and non-negative.");
    this.setReducedMotion(reduced);
    if (!this.active || !this.revealing || paused) return;
    const duration = reduced ? REDUCED_MAGIC_DURATION : MAGIC_REVEAL_DURATION;
    this.elapsed = Math.min(duration, this.elapsed + milliseconds);
    if (!this.unlockPlayed && this.elapsed / duration >= MAGIC_UNLOCK_TIME / MAGIC_REVEAL_DURATION) {
      this.unlockPlayed = true;
      this.onUnlock();
    }
    this.renderReveal();
    if (this.elapsed === duration) {
      this.active = false;
      this.root.hidden = true;
      this.onComplete();
    }
  }

  setReducedMotion(reduced) {
    if (this.reduced === reduced) return;
    if (this.revealing) {
      this.elapsed *= reduced ? REDUCED_MAGIC_DURATION / MAGIC_REVEAL_DURATION
        : MAGIC_REVEAL_DURATION / REDUCED_MAGIC_DURATION;
    }
    this.reduced = reduced;
    if (this.revealing) this.renderReveal();
  }

  renderReveal() {
    const frame = magicRevealFrame(this.elapsed, this.reduced);
    const { sourceX, sourceY, sourceFont, finalFont, lockX, lockY } = this.geometry;
    const sourceScale = sourceFont / finalFont;
    const lift = this.reduced ? 1 : frame.lift;
    this.output.style.opacity = frame.lift > 0 ? "0" : "1";
    this.card.style.opacity = String(1 - frame.calculatorFade);
    this.card.style.transform = this.reduced ? "none" : `translateY(${frame.calculatorFade * 24}px) scale(${1 - frame.calculatorFade * 0.035})`;
    this.number.style.transform = `translate(-50%, -50%) translate(${sourceX * (1 - lift)}px, ${sourceY * (1 - lift) - 30 * lift}px) scale(${sourceScale + (1 - sourceScale) * lift})`;
    this.number.style.opacity = String((frame.lift > 0 ? 1 : 0) * (1 - frame.becomeKey));
    this.number.style.setProperty("--pair-gap", `${(this.reduced ? Number(frame.split > 0) : frame.split) * 0.45}em`);
    this.number.style.setProperty("--pair-label", String(frame.split));
    this.dateCopy.style.opacity = String(frame.explain);
    this.dateCopy.setAttribute("aria-hidden", String(frame.explain === 0));
    this.key.style.opacity = String(frame.becomeKey * (1 - frame.exit));
    this.key.style.transform = this.reduced
      ? "translate(-50%, -50%)"
      : `translate(-50%, -50%) translate(${lockX * frame.keyTravel}px, ${60 + (lockY - 15) * frame.keyTravel}px) rotate(${-25 - 65 * frame.keyTravel + 90 * frame.unlock}deg)`;
    this.lock.style.setProperty("--unlock-angle", `${this.reduced ? 0 : frame.unlock * -35}deg`);
    this.lock.style.setProperty("--unlock-rise", `${this.reduced ? 0 : frame.unlock * -9}px`);
    this.lock.style.setProperty("--unlock-glow", String(frame.unlock * (1 - frame.exit)));
    this.lock.style.opacity = String(1 - frame.exit);
    this.lockTitle.style.opacity = String(1 - frame.becomeKey);
    this.lockNote.style.opacity = String(1 - frame.becomeKey);
    this.root.style.opacity = String(1 - frame.exit);
    const phase = frame.unlock > 0 ? "unlock" : frame.becomeKey > 0 ? "key" : frame.split > 0 ? "date" : "number";
    if (this.phase !== phase) {
      this.phase = phase;
      this.status.textContent = phase === "date" ? `原来，答案就是此刻。${this.reveal.label}`
        : phase === "key" ? "这一刻，化作一把钥匙。" : phase === "unlock" ? "心锁已开启。惊喜，即将到来。" : "答案，正在离开计算器。";
    }
  }

  reset() {
    this.calculator.reset();
    this.active = true;
    this.revealing = false;
    this.elapsed = 0;
    this.phase = null;
    this.unlockPlayed = false;
    this.root.hidden = false;
    this.root.removeAttribute("style");
    delete this.root.dataset.revealing;
    for (const node of [this.card, this.lock, this.lockTitle, this.lockNote, this.number, this.key, this.dateCopy]) node.removeAttribute("style");
    this.output.style.opacity = "1";
    this.keys.inert = false;
    this.number.hidden = true;
    this.dateCopy.setAttribute("aria-hidden", "true");
    this.renderCalculator();
  }
}
