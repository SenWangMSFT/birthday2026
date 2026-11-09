import { BIRTHDAY_STEPS, COMET_LIFETIME, GUIDE_STAR, HIDDEN_WISHES, INTRO_STEPS, BirthdayTimeline, CometTrail, IntroTimeline, getBirthdayFrame, getIntroFrame, projectStar, soften } from "./scene.js";
import { MemoryJourney } from "./journey.js";
import { BirthdayPuzzle } from "./birthday-puzzle.js";
import { STAR_LIGHT_STOPS, createFlybyStars, getStarFlight, projectFlybyStar } from "./starfield.js";
import { BackgroundMusic } from "./background-music.js";
import { AmbientComets } from "./ambient-comets.js";
import { ImmersiveMode } from "./immersive-mode.js";
import { MagicOpening, magicRevealFrame } from "./magic-opening.js";
import { BirthdayFinale } from "./finale.js";

function element(id) {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing scene element: ${id}`);
  return result;
}

const scene = element("scene");
const canvas = element("night-sky");
const cometCanvas = element("comet-trail");
const intro = element("intro");
const introMessage = element("intro-message");
const reveal = element("reveal");
const pauseButton = element("pause-button");
const skipButton = element("skip-button");
const soundButton = element("sound-button");
const fullscreenButton = element("fullscreen-button");
const wishHint = element("wish-hint");
const birthdayButton = element("birthday-button");
const birthdaySequence = element("birthday-sequence");
const birthdayTitle = element("birthday-calligraphy");
const birthdayPuzzle = new BirthdayPuzzle(birthdayTitle, notify);
const birthdayLights = element("birthday-lights");
const progress = [...element("scene-progress").children];
const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");
const timeline = new IntroTimeline();
const birthdayTimeline = new BirthdayTimeline();
const cometTrail = new CometTrail();
const ambientComets = new AmbientComets();
let cometDrawn = false;
let birthdayActive = false;
let journeyActive = false;
let birthdayHold = 0;
let revealDepartureOpacity = 1;
let revealDepartureBlur = 0;
let renderedBirthdayStage = "";
let userPaused = false;
let beforeImmersivePaused = false;
let frameId = null;
let previousTime = 0;
let worldTime = 0;
let renderedStep = -1;
let renderedFinished = null;
let hiddenWishIndex = 0;
let noticeTimeout;
const journeyControls = element("journey-controls");
const journey = new MemoryJourney({
  root: element("journey"),
  host: element("earth-stage"),
  notify,
  onNavigate: () => syncPlayback(),
  onComplete: () => startFinale(),
});
const finale = new BirthdayFinale({
  scene,
  root: element("finale"),
  flightSky: element("candle-flight-sky"),
  backdrop: element("finale-backdrop"),
  controls: element("finale-controls"),
  notify,
  onWish: () => {
    sound.finishBirthdayAtEnd();
    userPaused = false;
    syncPlayback();
    sound.playCandleWish().catch(reportMusicError);
  },
  onAudio: (phase, elapsed) => {
    sound.suspenseElapsed = phase === "suspense" ? elapsed : 0;
    sound.setPhase(phase).catch(reportMusicError);
    renderSoundControl();
  },
  onNavigate: () => syncPlayback(),
  onArrivalComplete: () => {
    journey.hide();
    element("earth-stage").classList.remove("is-finale-transition");
  },
});
const opening = new MagicOpening({
  root: element("magic-opening"),
  notify,
  onComplete: () => {
    delete scene.dataset.mode;
    sound.setPhase("story").catch(reportMusicError);
    renderSoundControl();
    timeline.restart();
    if (motionPreference.matches) timeline.skip();
    renderedStep = -1;
    renderedFinished = null;
    renderTimeline();
    birthdayPuzzle.updateAmbient(motionPreference.matches ? 0 : worldTime, 0);
    if (timeline.finished) birthdayButton.focus({ preventScroll: true });
    else intro.focus({ preventScroll: true });
  },
  onActivity: () => {
    userPaused = false;
    syncPlayback();
  },
  onUnlock: () => sound.playUnlock().catch(reportMusicError),
});

function setIcon(id, name) {
  element(id).querySelector("use").setAttribute("href", `#icon-${name}`);
}

function notify(message) {
  const notice = element("notice");
  clearTimeout(noticeTimeout);
  notice.textContent = message;
  notice.classList.add("is-visible");
  noticeTimeout = setTimeout(() => {
    notice.classList.remove("is-visible");
  }, 4600);
}

const FRAGMENT_PATHS = [
  "M-.6-.55H.6V-.12H-.08V.6H-.6Z",
  "M-.65-.22 .62-.3 .57.16-.58.25Z",
  "M-.58-.6H.5V.02H.12V.56H-.25V-.18H-.58Z",
  "M-.55-.5Q.65-.65.6.1L.2.55Q-.5.6-.55-.5Z",
  "M-.65-.5 .55-.35 .12.3-.1.58-.28.08Z",
  "M-.65-.14H-.16V-.6H.2V-.14H.6V.22H.2V.6H-.16V.22H-.65Z",
  "M-.55-.6 .2-.52 .58-.1 .22.16-.1.58-.35.2Z",
  "M-.5-.5H.5V-.05H.04V.5H-.5Z",
].map((path) => new Path2D(path));

function drawStar(context, x, y, radius, opacity) {
  const spread = radius * 3;
  const light = context.createRadialGradient(x, y, 0, x, y, spread);
  for (const stop of STAR_LIGHT_STOPS) {
    light.addColorStop(stop.offset, stop.color);
  }
  context.globalAlpha = opacity;
  context.fillStyle = light;
  context.fillRect(x - spread, y - spread, spread * 2, spread * 2);
}

class NightSky {
  constructor(context) {
    this.context = context;
    this.width = 0;
    this.height = 0;
    this.pointer = { x: 0, y: 0 };
    this.parallax = { x: 0, y: 0 };
    this.bursts = [];
    this.flybyStars = createFlybyStars();
    this.stars = Array.from({ length: 190 }, () => ({
      x: Math.random(),
      y: Math.random(),
      radius: 0.35 + Math.random() * 0.95,
      opacity: 0.08 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  resize() {
    const bounds = scene.getBoundingClientRect();
    this.width = bounds.width;
    this.height = bounds.height;
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(this.width * scale);
    canvas.height = Math.round(this.height * scale);
    this.context.setTransform(scale, 0, 0, scale, 0, 0);
    this.draw(worldTime, 0);
  }

  burst(x, y, count = 18) {
    if (motionPreference.matches) return;
    const available = Math.max(0, 150 - this.bursts.length);
    for (let index = 0; index < Math.min(count, available); index += 1) {
      this.bursts.push({
        x,
        y,
        vx: (Math.random() - 0.5) * (count > 20 ? 450 : 160),
        vy: -100 - Math.random() * (count > 20 ? 390 : 120),
        age: 0,
        lifetime: 3 + Math.random() * 3,
        size: 3 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2,
        shape: FRAGMENT_PATHS[index % FRAGMENT_PATHS.length],
      });
    }
  }

  draw(time, delta) {
    const ctx = this.context;
    const { width, height } = this;
    const birthday = birthdayActive || journeyActive || finale.active ? getBirthdayFrame(birthdayTimeline) : null;
    const camera = birthdayActive ? birthday : null;
    ctx.clearRect(0, 0, width, height);
    this.parallax.x += (this.pointer.x - this.parallax.x) * 0.035;
    this.parallax.y += (this.pointer.y - this.parallax.y) * 0.035;
    const space = journeyActive && journey.player.phase === "entry" ? journey.player.pose.opacity : 1;

    for (const star of this.stars) {
      const projected = projectStar(star.x, star.y, width, height, camera, 0.6 + star.radius * 0.3);
      const x = projected.x + this.parallax.x * star.radius;
      const y = projected.y + this.parallax.y * star.radius;
      if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
      const pulse = 0.75 + Math.sin(time * 0.6 + star.phase) * 0.25;
      const light = opening.active ? 0.65 * (1 - (opening.revealing ? magicRevealFrame(opening.elapsed, opening.reduced).exit : 0)) : birthday
        ? birthday.stars
        : soften((timeline.elapsed - star.x * 6000) / 2800);
      drawStar(ctx, x, y, star.radius, star.opacity * pulse * light * space);
    }

    const flight = birthdayActive ? getStarFlight(birthdayTimeline.elapsed) : null;
    let passingStars = 0;
    let streaks = 0;
    if (flight && flight.opacity > 0 && width > 0 && height > 0) {
      ctx.lineCap = "round";
      for (const star of this.flybyStars) {
        const point = projectFlybyStar(star, flight, width, height);
        if (!point.visible) continue;
        if (point.streak > 1) {
          ctx.globalAlpha = point.opacity * 0.7;
          ctx.strokeStyle = "#e3e7ed";
          ctx.lineWidth = Math.max(0.35, point.radius * 0.65);
          ctx.beginPath();
          ctx.moveTo(point.fromX, point.fromY);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
          streaks += 1;
        }
        drawStar(ctx, point.x, point.y, point.radius, point.opacity);
        passingStars += 1;
      }
    }
    canvas.dataset.flybyStars = String(passingStars);
    canvas.dataset.flybyStreaks = String(streaks);
    canvas.dataset.flightDistance = (flight?.distance ?? 0).toFixed(4);

    if (!journeyActive && !finale.active) {
      const hero = projectStar(GUIDE_STAR.x, GUIDE_STAR.y, width, height, camera);
      const zoom = camera?.starZoom ?? 1;
      const pulse = 0.94 + Math.sin(time * 0.6 + 1.1) * 0.06;
      const visibility = (birthdayActive ? birthday.heroOpacity : GUIDE_STAR.opacity) * pulse;
      drawStar(ctx, hero.x, hero.y, GUIDE_STAR.radius * zoom, visibility);
      canvas.dataset.heroX = hero.x.toFixed(2);
      canvas.dataset.heroY = hero.y.toFixed(2);
      canvas.dataset.starZoom = zoom.toFixed(3);
      canvas.dataset.heroOpacity = visibility.toFixed(4);
    }

    this.bursts = this.bursts.filter((piece) => piece.age < piece.lifetime);
    for (const piece of this.bursts) {
      piece.age += delta;
      piece.x += piece.vx * delta;
      piece.y += piece.vy * delta;
      piece.vy += 100 * delta;
      piece.rotation += delta * 1.5;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - piece.age / piece.lifetime) * 0.8;
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.scale(piece.size, piece.size);
      ctx.fillStyle = "#e4d3ae";
      ctx.fill(piece.shape);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

const context = canvas.getContext("2d");
const cometContext = cometCanvas.getContext("2d");
const sky = context ? new NightSky(context) : null;
const sound = new BackgroundMusic(element("background-music"), reportMusicError, "calculator", element("birthday-music"), renderSoundControl);
const immersive = new ImmersiveMode({
  document,
  button: fullscreenButton,
  sound,
  notify,
  onChange: (active) => {
    if (active) {
      beforeImmersivePaused = userPaused;
      userPaused = false;
    } else {
      userPaused = beforeImmersivePaused;
    }
    renderSoundControl();
    syncPlayback();
  },
});

function renderSoundControl() {
  soundButton.setAttribute("aria-pressed", String(sound.enabled));
  const finished = sound.phase === "birthday" && sound.birthdayFinished;
  soundButton.disabled = finished;
  const track = soundtrackLabel();
  const label = finished ? "生日钢琴曲已播放完毕" : `${sound.enabled ? "关闭" : "开启"}背景声音：${track}`;
  soundButton.setAttribute("aria-label", label);
  soundButton.title = label;
  setIcon("sound-icon", sound.enabled ? "sound" : "muted");
}

function soundtrackLabel() {
  return { calculator: "星空氛围声", story: "Sunshine", quiet: "静候惊喜", suspense: "心跳倒计时", birthday: "生日钢琴曲" }[sound.phase];
}

function reportMusicError(error) {
  console.error("Unable to play the birthday soundtrack.", error);
  if (immersive.active) immersive.exit({ restoreMusic: false });
  renderSoundControl();
  notify("暂时无法播放背景声音，请点击声音按钮重试，或检查浏览器声音设置与音频文件。");
}
if (!sky) {
  console.error("Canvas 2D is unavailable; the animated sky could not be rendered.");
  notify("当前浏览器无法显示星空动画，生日祝福仍可正常开启。");
}
if (!cometContext) {
  console.error("Canvas 2D is unavailable; the pointer comet trail could not be rendered.");
  notify("当前浏览器无法显示鼠标彗星效果，生日场景仍可继续浏览。");
}

function renderComets(milliseconds) {
  cometTrail.advance(milliseconds);
  ambientComets.advance(milliseconds, !birthdayActive && !finale.active && (!journeyActive || journey.player.phase === "memory"));
  const ambient = ambientComets.frame;
  cometCanvas.dataset.ambientComets = ambient ? "1" : "0";
  cometCanvas.dataset.ambientSpawned = String(ambientComets.spawned);
  if (!cometContext || (!cometTrail.points.length && !ambient && !cometDrawn)) return;
  cometContext.clearRect(0, 0, scene.clientWidth, scene.clientHeight);
  cometDrawn = cometTrail.points.length > 0 || ambient !== null;
  if (!cometDrawn) return;
  const fade = (point) => Math.pow(1 - point.age / COMET_LIFETIME, 1.35);
  const points = cometTrail.points;
  cometContext.save();
  if (ambient) {
    const x = ambient.x * scene.clientWidth + ambient.vx * ambient.age / 1000;
    const y = ambient.y * scene.clientHeight + ambient.vy * ambient.age / 1000;
    const speed = Math.hypot(ambient.vx, ambient.vy);
    const length = ambient.length * soften(ambient.age / 300);
    const fromX = x - ambient.vx / speed * length;
    const fromY = y - ambient.vy / speed * length;
    const glow = cometContext.createLinearGradient(fromX, fromY, x, y);
    glow.addColorStop(0, "rgba(227,232,240,0)");
    glow.addColorStop(1, `rgba(239,234,217,${ambient.opacity})`);
    cometContext.strokeStyle = glow;
    cometContext.lineWidth = 1.1;
    cometContext.beginPath();
    cometContext.moveTo(fromX, fromY);
    cometContext.lineTo(x, y);
    cometContext.stroke();
    drawStar(cometContext, x, y, 1.6, ambient.opacity);
  }
  cometContext.globalAlpha = 1;
  cometContext.lineCap = "round";
  cometContext.lineJoin = "round";
  cometContext.shadowColor = "#e0e6f0";
  cometContext.shadowBlur = 12;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const previous = points[index - 2];
    const start = previous ? { x: (previous.x + from.x) / 2, y: (previous.y + from.y) / 2 } : from;
    const end = index === points.length - 1 ? to : { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const taper = index / (points.length - 1);
    const gradient = cometContext.createLinearGradient(start.x, start.y, end.x, end.y);
    gradient.addColorStop(0, `rgba(222, 229, 239, ${0.65 * fade(from) * Math.pow((index - 1) / (points.length - 1), 1.5)})`);
    gradient.addColorStop(1, `rgba(242, 238, 224, ${0.65 * fade(to) * Math.pow(taper, 1.5)})`);
    cometContext.strokeStyle = gradient;
    cometContext.lineWidth = 0.6 + taper * 2.6;
    cometContext.beginPath();
    cometContext.moveTo(start.x, start.y);
    cometContext.quadraticCurveTo(from.x, from.y, end.x, end.y);
    cometContext.stroke();
  }
  cometContext.shadowBlur = 0;
  cometContext.shadowColor = "transparent";
  const head = points.at(-1);
  if (head) drawStar(cometContext, head.x, head.y, 2.7, 0.95 * fade(head));
  cometContext.restore();
}

function resizeSceneCanvases() {
  sky?.resize();
  if (cometContext) {
    const scale = Math.min(devicePixelRatio || 1, 2);
    cometCanvas.width = Math.round(scene.clientWidth * scale);
    cometCanvas.height = Math.round(scene.clientHeight * scale);
    cometContext.setTransform(scale, 0, 0, scale, 0, 0);
  }
  cometTrail.clear();
  cometDrawn = false;
}

function renderTimeline() {
  if (opening.active) {
    intro.hidden = true;
    reveal.hidden = true;
    birthdayPuzzle.hide();
    return;
  }
  if (birthdayActive || journeyActive || finale.active) return;
  const step = timeline.stepIndex;
  const finished = timeline.finished;
  if (!finished) {
    const frame = getIntroFrame(timeline);
    intro.style.setProperty("--intro-opacity", frame.opacity.toFixed(4));
    intro.style.setProperty("--intro-blur", `${frame.blur.toFixed(3)}px`);
    intro.style.setProperty("--intro-drift", `${frame.drift.toFixed(3)}px`);
    intro.style.setProperty("--intro-spacing", `${frame.spacing.toFixed(4)}em`);
  }
  if (renderedStep === step && renderedFinished === finished) return;
  renderedStep = step;
  renderedFinished = finished;

  progress.forEach((item, index) => {
    item.classList.toggle("is-done", finished || index < step);
    if (!finished && index === step) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });

  intro.hidden = finished;
  reveal.hidden = !finished;
  element("skip-label").textContent = finished ? "重看序幕" : "跳过序幕";
  setIcon("skip-icon", finished ? "replay" : "arrow");
  if (!finished) {
    const message = document.createElement("span");
    message.textContent = INTRO_STEPS[step].message;
    introMessage.replaceChildren(message);
    element("waiting-dots").style.visibility = step === 3 ? "hidden" : "visible";
  }
}

function renderBirthday() {
  if (!birthdayActive) return;
  const frame = getBirthdayFrame(birthdayTimeline);
  const reduced = motionPreference.matches;
  scene.dataset.birthdayStage = frame.stage;
  const starCoversControls = frame.heroOpacity > 0.5 &&
    frame.starZoom * GUIDE_STAR.radius > Math.hypot(sky?.width ?? innerWidth, sky?.height ?? innerHeight) * 0.45;
  scene.classList.toggle("is-lit", frame.wash > 0.42 || starCoversControls);
  reveal.style.opacity = String(revealDepartureOpacity * (1 - frame.departure));
  reveal.style.filter = `blur(${revealDepartureBlur + frame.departure * 4}px)`;
  reveal.hidden = frame.departure === 1;
  birthdayPuzzle.update(birthdayTimeline.elapsed, frame, reduced);
  for (const [index, name] of ["one", "two", "three"].entries()) {
    birthdayLights.style.setProperty(`--light-${name}`, frame.lights[index].toFixed(4));
  }
  birthdayLights.style.setProperty("--light-wash", frame.wash.toFixed(4));
  if (renderedBirthdayStage !== frame.stage) {
    renderedBirthdayStage = frame.stage;
    element("birthday-status").textContent = BIRTHDAY_STEPS[birthdayTimeline.stepIndex].message;
  }
}

function startJourney() {
  renderBirthday();
  birthdayActive = false;
  journeyActive = true;
  intro.hidden = true;
  reveal.hidden = true;
  birthdaySequence.hidden = true;
  birthdayPuzzle.hide();
  scene.dataset.mode = "journey";
  journeyControls.hidden = false;
  journey.start(motionPreference.matches);
  birthdayLights.style.opacity = String(journey.player.pose.wash);
  scene.classList.toggle("is-lit", journey.player.pose.wash > 0.5);
  element("journey").focus({ preventScroll: true });
  element("skip-label").textContent = "重看序幕";
  scene.querySelector(".playback-controls").setAttribute("aria-label", "播放控制");
}

function startFinale() {
  if (finale.active) return;
  journeyActive = false;
  journey.setPaused(true);
  journeyControls.hidden = true;
  scene.dataset.mode = "finale";
  birthdayLights.style.opacity = "0";
  scene.classList.remove("is-lit");
  birthdayPuzzle.hide();
  element("earth-stage").classList.add("is-finale-transition");
  finale.start();
}

function tick(time) {
  frameId = null;
  if (timeline.paused) return;
  const delta = Math.max(0, time - previousTime);
  previousTime = time;
  if (opening.active) {
    opening.advance(delta, timeline.paused, motionPreference.matches);
  } else if (finale.active) {
    sound.suspenseElapsed = finale.player.phase === "countdown" ? finale.player.elapsed + delta : 0;
    finale.update(delta, timeline.paused, motionPreference.matches);
    const frame = finale.player.frame;
    scene.style.setProperty("--finale-control-color", frame.paper > 0.5 ? "#585d4e" : "#c7b89d");
    if (frame.phase === "arrival") {
      element("journey").style.opacity = String(frame.journeyOpacity);
      element("earth-stage").style.opacity = String(frame.journeyOpacity);
    }
  } else if (journeyActive) {
    journey.setPaused(timeline.paused);
    journey.update(delta);
    const fade = journey.player.pose.wash;
    birthdayLights.style.opacity = String(fade);
    scene.classList.toggle("is-lit", fade > 0.5);
    if (journey.player.complete) startFinale();
  } else if (birthdayActive) {
    birthdayTimeline.advance(delta);
    if (birthdayTimeline.finished) {
      birthdayHold += delta;
      if (birthdayHold >= (motionPreference.matches ? 2600 : 0)) startJourney();
    }
  }
  else timeline.advance(delta);
  worldTime += Math.min(delta, 64) / 1000;
  renderTimeline();
  renderBirthday();
  if (!opening.active && !birthdayActive && !journeyActive && !finale.active) birthdayPuzzle.updateAmbient(
    motionPreference.matches ? 0 : worldTime,
    soften((timeline.elapsed - 800) / 6500),
  );
  if (!motionPreference.matches) {
    sky?.draw(worldTime, Math.min(delta, 64) / 1000);
    renderComets(delta);
  }
  frameId = requestAnimationFrame(tick);
}

function syncPlayback() {
  timeline.paused = userPaused || document.hidden;
  birthdayTimeline.paused = timeline.paused;
  journey.setPaused(timeline.paused);
  finale.player.paused = timeline.paused;
  if (timeline.paused) cometTrail.disconnect();
  document.body.dataset.paused = String(timeline.paused);
  pauseButton.setAttribute("aria-pressed", String(userPaused));
  pauseButton.setAttribute("aria-label", userPaused ? "继续播放" : "暂停播放");
  pauseButton.title = userPaused ? "继续播放" : "暂停播放";
  setIcon("pause-icon", userPaused ? "play" : "pause");
  sound.setPaused(timeline.paused).catch(reportMusicError);
  if (frameId !== null) {
    cancelAnimationFrame(frameId);
    frameId = null;
  }
  if (!timeline.paused && (!motionPreference.matches || birthdayActive || journeyActive || finale.active || opening.revealing && opening.active)) {
    previousTime = performance.now();
    frameId = requestAnimationFrame(tick);
  }
}

function findWish(x, y) {
  notify(HIDDEN_WISHES[hiddenWishIndex % HIDDEN_WISHES.length]);
  hiddenWishIndex += 1;
  sky?.burst(x, y);
}

pauseButton.addEventListener("click", () => {
  userPaused = !userPaused;
  syncPlayback();
});

skipButton.addEventListener("click", () => {
  if (opening.active) return;
  cometTrail.clear();
  ambientComets.clear();
  renderComets(0);
  if (birthdayActive || journeyActive || finale.active) {
    finale.hide();
    scene.style.removeProperty("--finale-control-color");
    element("earth-stage").classList.remove("is-finale-transition");
    journeyActive = false;
    journey.hide();
    journeyControls.hidden = true;
    birthdayHold = 0;
    birthdayActive = false;
    birthdayTimeline.restart();
    birthdayHold = 0;
    renderedBirthdayStage = "";
    birthdaySequence.hidden = true;
    reveal.inert = false;
    reveal.classList.remove("is-departing");
    reveal.style.removeProperty("opacity");
    reveal.style.removeProperty("filter");
    birthdayButton.setAttribute("aria-expanded", "false");
    birthdayLights.removeAttribute("style");
    scene.classList.remove("is-lit");
    delete scene.dataset.mode;
    delete scene.dataset.birthdayStage;
    renderedStep = -1;
  }
  if (timeline.finished) {
    timeline.restart();
    if (sky) sky.bursts = [];
    opening.reset();
    sound.setPhase("calculator").catch(reportMusicError);
    renderSoundControl();
    scene.dataset.mode = "calculator";
    renderedFinished = null;
    element("magic-opening").querySelector('[data-key="AC"]').focus({ preventScroll: true });
  } else {
    timeline.skip();
  }
  renderTimeline();
  if (!opening.active && !journeyActive && !birthdayActive && !finale.active) {
    birthdayPuzzle.updateAmbient(motionPreference.matches ? 0 : worldTime, soften((timeline.elapsed - 800) / 6500));
  }
  sky?.draw(worldTime, 0);
});

function beginBirthday() {
  if (opening.active || birthdayActive || journeyActive || finale.active) return;
  const revealStyle = getComputedStyle(reveal);
  birthdayPuzzle.begin();
  revealDepartureOpacity = Number(revealStyle.opacity);
  revealDepartureBlur = Number(revealStyle.filter.match(/blur\(([\d.]+)px\)/)?.[1] ?? 0);
  birthdayActive = true;
  birthdayTimeline.restart();
  userPaused = false;
  if (motionPreference.matches) birthdayTimeline.skip();
  journey.prepare();
  scene.dataset.mode = "birthday";
  birthdaySequence.hidden = false;
  reveal.classList.add("is-departing");
  reveal.inert = true;
  birthdayButton.setAttribute("aria-expanded", "true");
  element("notice").classList.remove("is-visible");
  birthdaySequence.focus({ preventScroll: true });
  if (sky) {
    sky.bursts = [];
    sky.resize();
  }
  renderBirthday();
  syncPlayback();
}

birthdayButton.addEventListener("click", beginBirthday);

soundButton.addEventListener("click", async () => {
  soundButton.disabled = true;
  try {
    await sound.toggle();
    renderSoundControl();
    if (sound.enabled) {
      const track = soundtrackLabel();
      notify(timeline.paused ? `${track}已开启，将在场景继续时播放。` : `正在播放${track}。`);
    } else {
      notify("背景声音已关闭。");
    }
  } catch (error) {
    reportMusicError(error);
  } finally {
    renderSoundControl();
  }
});

wishHint.addEventListener("click", () => {
  const bounds = scene.getBoundingClientRect();
  findWish(bounds.width * 0.3, bounds.height * 0.75);
});

scene.addEventListener("pointerdown", (event) => {
  if (!(event.target instanceof Element) || event.target.closest("button, a")) return;
  if (opening.active || journeyActive || finale.active || immersive.active) return;
  const bounds = scene.getBoundingClientRect();
  findWish(event.clientX - bounds.left, event.clientY - bounds.top);
});

scene.addEventListener("pointermove", (event) => {
  if (event.pointerType !== "mouse" || motionPreference.matches || timeline.paused) return;
  const bounds = scene.getBoundingClientRect();
  const x = event.clientX - bounds.left;
  const y = event.clientY - bounds.top;
  if (cometContext) cometTrail.move(x, y);
  if (sky) {
    sky.pointer.x = (x / bounds.width - 0.5) * 10;
    sky.pointer.y = (y / bounds.height - 0.5) * 8;
  }
});

scene.addEventListener("pointerleave", () => {
  cometTrail.disconnect();
  if (sky) sky.pointer = { x: 0, y: 0 };
});

document.addEventListener("visibilitychange", syncPlayback);
motionPreference.addEventListener("change", () => {
  if (motionPreference.matches) {
    cometTrail.clear();
    ambientComets.clear();
    renderComets(0);
    if (!opening.active) timeline.skip();
    if (birthdayActive) birthdayTimeline.skip();
    if (sky) {
      sky.pointer = { x: 0, y: 0 };
      sky.parallax = { x: 0, y: 0 };
      sky.bursts = [];
    }
  }
  journey.player.setReducedMotion(motionPreference.matches || Boolean(journey.failed));
  opening.setReducedMotion(motionPreference.matches);
  if (journeyActive) journey.update(0, true);
  if (finale.active) finale.update(0, timeline.paused, motionPreference.matches);
  renderTimeline();
  renderBirthday();
  if (!opening.active && !birthdayActive && !journeyActive && !finale.active) birthdayPuzzle.updateAmbient(0, 1);
  sky?.draw(worldTime, 0);
  syncPlayback();
});

new ResizeObserver(resizeSceneCanvases).observe(scene);
resizeSceneCanvases();
for (const control of [pauseButton, skipButton, soundButton, wishHint, fullscreenButton]) {
  control.hidden = false;
}
renderTimeline();
renderSoundControl();
syncPlayback();
