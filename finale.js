import { FinalePlayer } from "./finale-model.js";
import { CandleWish } from "./candle-wish.js";
import { STAR_LIGHT_RGB, STAR_LIGHT_STOPS } from "./starfield.js";

const SVG_NS = "http://www.w3.org/2000/svg";

const ANNOUNCEMENTS = {
  "little-things": "我喜欢的那些，关于你的小事。",
  letter: "写给陈君。",
  last: "最后，还有一件事。还有一份惊喜，想留到最后。",
  countdown: "请闭上眼睛。三十秒后，再睁开。听着心跳，等一个惊喜。",
  cake: "陈君，生日快乐。",
};

export class BirthdayFinale {
  constructor({ scene, root, flightSky, backdrop, controls, notify, onAudio, onNavigate, onArrivalComplete, onWish }) {
    this.scene = scene;
    this.root = root;
    this.flightSky = flightSky;
    this.backdrop = backdrop;
    this.controls = controls;
    this.onAudio = onAudio;
    this.onNavigate = onNavigate;
    this.onArrivalComplete = onArrivalComplete;
    this.notify = notify;
    this.onWish = onWish;
    this.player = new FinalePlayer();
    this.wish = new CandleWish();
    this.light = root.querySelector("#candle-flame-holder");
    this.core = root.querySelector(".candle-core");
    this.cakeSvg = root.querySelector(".birthday-cake svg");
    this.heading = root.querySelector("#cake-title");
    this.giftSpace = root.querySelector(".finale-gift-space");
    this.cakeDetails = [...root.querySelectorAll(".cake-secondary")];
    this.headingTranslation = 0;
    this.giftTranslation = 0;
    this.tapHint = root.querySelector("#candle-tap-hint");
    this.giftButton = root.querySelector("#gift-button");
    this.giftMessage = root.querySelector("#gift-message");
    this.point = flightSky.querySelector(".candle-flight-point");
    this.circle = this.point.querySelector("circle");
    this.trail = flightSky.querySelector(".candle-flight-trail");
    this.trailGradient = flightSky.querySelector("#candle-star-trail");
    const profile = flightSky.querySelector("#candle-star-light");
    this.stops = STAR_LIGHT_STOPS.map(({ offset, opacity }) => {
      const stop = root.ownerDocument.createElementNS(SVG_NS, "stop");
      stop.setAttribute("offset", String(offset));
      stop.setAttribute("stop-opacity", String(opacity));
      stop.setAttribute("stop-color", `rgb(${STAR_LIGHT_RGB.join(",")})`);
      profile.append(stop);
      return stop;
    });
    this.active = false;
    this.pages = [...root.querySelectorAll("[data-finale-page]")];
    this.previous = controls.querySelector("#finale-previous");
    this.next = controls.querySelector("#finale-next");
    this.previous.addEventListener("click", () => this.navigate(-1));
    this.next.addEventListener("click", () => this.navigate(1));
    scene.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || event.target.closest("button, a, input, textarea, select")) return;
      this.launchCandle();
    });
    root.querySelector('[data-finale-page="cake"]').addEventListener("keydown", (event) => {
      if (event.repeat || !["Enter", " "].includes(event.key) || event.target.closest("button, a")) return;
      event.preventDefault();
      this.launchCandle();
    });
    this.giftButton.addEventListener("click", () => {
      if (!this.wish.openGifts()) return;
      this.giftMessage.style.animation = this.player.paused ? "none" : "";
      this.renderWish();
      this.giftMessage.focus({ preventScroll: true });
    });
    new ResizeObserver(() => {
      this.lastWishFrame = null;
      if (this.active && this.wish.state !== "ready") {
        this.measureOrigin();
        this.measureComposition();
        this.renderWish();
      }
    }).observe(scene);
  }

  start() {
    this.player.restart();
    this.wish.reset();
    this.giftMessage.style.removeProperty("animation");
    this.lastWishState = null;
    this.lastWishFrame = null;
    this.active = true;
    this.arrived = false;
    this.lastAudio = null;
    this.lastPhase = null;
    this.lastOpacity = null;
    this.lastPaper = null;
    this.root.hidden = false;
    this.backdrop.hidden = false;
    this.render();
  }

  navigate(direction) {
    if (!this.active) return;
    this.player.navigate(direction);
    this.render();
    this.onNavigate();
  }

  update(milliseconds, paused, reducedMotion) {
    if (!this.active) return;
    this.player.paused = paused;
    this.player.advance(milliseconds);
    this.wish.setReducedMotion(reducedMotion);
    this.wish.advance(milliseconds, paused);
    if (this.root.dataset.reducedMotion !== String(reducedMotion)) this.root.dataset.reducedMotion = String(reducedMotion);
    this.render();
  }

  render() {
    const frame = this.player.frame;
    if (!this.arrived && frame.phase !== "arrival") {
      this.arrived = true;
      this.onArrivalComplete();
    }
    if (this.lastOpacity !== frame.opacity) {
      this.lastOpacity = frame.opacity;
      this.root.style.setProperty("--finale-opacity", String(frame.opacity));
    }
    if (this.lastPaper !== frame.paper) {
      this.lastPaper = frame.paper;
      this.backdrop.style.opacity = String(frame.paper);
    }
    const dark = frame.phase === "countdown" || frame.phase === "cake";
    this.root.classList.toggle("is-dark", dark);
    this.controls.hidden = !this.player.canNext;
    this.previous.disabled = !this.player.canPrevious;
    this.next.disabled = !this.player.canNext || this.player.target !== null;
    this.next.querySelector("span").textContent = frame.phase === "last" ? "继续" : "下一页";
    this.controls.querySelector(".finale-page-count").textContent = frame.phase === "little-things" ? "01 / 03"
      : frame.phase === "letter" ? "02 / 03" : "03 / 03";
    if (frame.seconds !== null) {
      const seconds = String(frame.seconds).padStart(2, "0");
      const counter = this.root.querySelector(".finale-seconds");
      if (counter.textContent !== seconds) counter.textContent = seconds;
    }
    if (this.lastPhase !== frame.phase) {
      this.lastPhase = frame.phase;
      this.root.dataset.phase = frame.phase;
      for (const page of this.pages) page.hidden = page.dataset.finalePage !== frame.phase;
      this.root.querySelector(".finale-status").textContent = ANNOUNCEMENTS[frame.phase] ?? "";
      if (frame.phase !== "arrival") {
        this.pages.find((page) => page.dataset.finalePage === frame.phase).focus({ preventScroll: true });
      }
    }
    if (frame.audio !== this.lastAudio) {
      this.lastAudio = frame.audio;
      this.onAudio(frame.audio, this.player.elapsed);
    }
    this.renderWish();
  }

  measureOrigin() {
    try {
      const bounds = this.scene.getBoundingClientRect();
      const box = this.core.getBBox();
      const matrix = this.core.getScreenCTM();
      if (!matrix || !bounds.width || !bounds.height) throw new Error("The candle has no visible scene coordinates.");
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      this.wish.origin = {
        x: (matrix.a * x + matrix.c * y + matrix.e - bounds.left) / bounds.width,
        y: (matrix.b * x + matrix.d * y + matrix.f - bounds.top) / bounds.height,
      };
      return true;
    } catch (error) {
      console.error("Unable to locate the birthday candle in the scene.", error);
      this.notify("暂时无法定位烛光，请稍后再轻触屏幕重试。");
      return false;
    }
  }

  launchCandle() {
    if (!this.active || this.player.phase !== "cake" || this.player.frame.opacity < 0.95 || this.wish.state !== "ready") return;
    if (!this.measureOrigin()) return;
    this.measureComposition();
    if (!this.wish.launch(this.wish.origin, this.root.dataset.reducedMotion === "true")) return;
    this.renderWish();
    this.onWish();
  }

  measureComposition() {
    const scene = this.scene.getBoundingClientRect();
    const heading = this.heading.getBoundingClientRect();
    const gifts = this.giftSpace.getBoundingClientRect();
    const center = scene.top + scene.height / 2;
    this.headingShift = center - (heading.top + heading.height / 2 - this.headingTranslation);
    this.giftShift = center + heading.height / 2 + 56 - (gifts.top + gifts.height / 2 - this.giftTranslation);
  }

  renderWish() {
    if (this.lastWishState !== this.wish.state) {
      this.lastWishState = this.wish.state;
      this.root.dataset.wishState = this.wish.state;
      const ready = this.wish.state === "ready";
      const flying = this.wish.state === "flying";
      this.giftButton.hidden = this.wish.state !== "star";
      this.giftMessage.hidden = this.wish.state !== "gifts";
      this.giftButton.setAttribute("aria-expanded", String(this.wish.state === "gifts"));
      this.tapHint.hidden = !ready && !flying;
      this.tapHint.textContent = ready ? "轻触屏幕，让烛光飞向星空。也可以按回车键。" : "把这一点光，送往星空。";
      if (!ready) {
        this.root.querySelector(".finale-status").textContent = flying ? "烛光正在飞向星空。"
          : this.wish.state === "star" ? "烛光已化作星星。该拆礼物啦。"
            : "现在，去拆为你准备的礼物吧。";
      }
      this.cakeSvg.setAttribute("aria-label", ready ? "一只奶油色花朵生日蛋糕，点着一根温暖的蜡烛"
        : flying ? "一只奶油色花朵生日蛋糕，烛光正飞向星空" : "一只奶油色花朵生日蛋糕，烛光已化作星星");
    }
    const signature = `${this.wish.state}-${this.wish.elapsed}-${this.wish.reducedMotion}-${this.scene.clientWidth}-${this.scene.clientHeight}`;
    if (this.lastWishFrame === signature) return;
    this.lastWishFrame = signature;
    const frame = this.wish.frame(this.scene.clientWidth, this.scene.clientHeight);
    this.flightSky.toggleAttribute("hidden", !frame);
    this.light.style.opacity = frame ? String(frame.flameOpacity) : "1";
    const opacity = frame?.cakeOpacity ?? 1;
    this.root.style.setProperty("--cake-details-opacity", String(opacity));
    for (const detail of this.cakeDetails) {
      detail.style.visibility = opacity === 0 ? "hidden" : "visible";
      detail.setAttribute("aria-hidden", String(opacity === 0));
    }
    this.headingTranslation = frame ? this.headingShift * frame.centerProgress : 0;
    this.giftTranslation = frame ? this.giftShift * frame.centerProgress : 0;
    this.heading.style.transform = `translateY(${this.headingTranslation}px)`;
    this.giftSpace.style.transform = `translateY(${this.giftTranslation}px)`;
    if (!frame) return;
    this.flightSky.setAttribute("viewBox", `0 0 ${this.scene.clientWidth} ${this.scene.clientHeight}`);
    this.flightSky.dataset.state = this.wish.state;
    this.point.classList.toggle("is-settled", frame.settled);
    this.point.setAttribute("transform", `translate(${frame.x} ${frame.y}) scale(1 ${frame.stretch})`);
    this.circle.setAttribute("r", String(frame.radius * 3));
    this.circle.setAttribute("opacity", String(frame.opacity));
    const color = STAR_LIGHT_RGB.map((value, index) => Math.round(value + ([248, 211, 148][index] - value) * frame.warmth));
    for (const stop of this.stops) stop.setAttribute("stop-color", `rgb(${color.join(",")})`);
    this.trail.setAttribute("d", frame.trail.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" "));
    this.trail.setAttribute("opacity", String(frame.trailOpacity));
    const oldest = frame.trail[0] ?? frame;
    for (const [name, value] of Object.entries({ x1: oldest.x, y1: oldest.y, x2: frame.x, y2: frame.y })) {
      this.trailGradient.setAttribute(name, String(value));
    }
  }

  hide() {
    this.active = false;
    this.root.hidden = true;
    this.backdrop.hidden = true;
    this.controls.hidden = true;
    this.player.restart();
    this.wish.reset();
    this.lastWishState = null;
    this.lastWishFrame = null;
    this.renderWish();
    this.flightSky.setAttribute("hidden", "");
  }
}
