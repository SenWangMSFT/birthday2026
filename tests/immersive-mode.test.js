import assert from "node:assert/strict";
import test from "node:test";
import { BackgroundMusic } from "../background-music.js";
import { ImmersiveMode } from "../immersive-mode.js";

class FakeAudio extends EventTarget {
  paused = true;
  currentTime = 27;
  playError = null;
  error = null;
  playCalls = 0;
  play() {
    this.playCalls += 1;
    if (this.playError) return Promise.reject(this.playError);
    this.paused = false;
    return Promise.resolve();
  }
  pause() { this.paused = true; }
  load() { this.error = null; }
}

function fixture({ native = true, prefixed = false } = {}) {
  const document = new EventTarget();
  document.body = { dataset: {} };
  document.documentElement = {};
  const button = new EventTarget();
  button.attributes = {};
  button.setAttribute = (name, value) => { button.attributes[name] = value; };
  button.focus = () => { button.focused = true; };
  let nativeCalls = 0;
  let exitCalls = 0;
  if (native) {
    document.documentElement[prefixed ? "webkitRequestFullscreen" : "requestFullscreen"] = async () => {
      nativeCalls += 1;
      document[prefixed ? "webkitFullscreenElement" : "fullscreenElement"] = document.documentElement;
      document.dispatchEvent(new Event(prefixed ? "webkitfullscreenchange" : "fullscreenchange"));
    };
    document[prefixed ? "webkitExitFullscreen" : "exitFullscreen"] = async () => {
      exitCalls += 1;
      document[prefixed ? "webkitFullscreenElement" : "fullscreenElement"] = null;
      document.dispatchEvent(new Event(prefixed ? "webkitfullscreenchange" : "fullscreenchange"));
    };
  }
  const errors = [];
  const notices = [];
  const changes = [];
  const audio = new FakeAudio();
  const sound = new BackgroundMusic(audio, (error) => errors.push(error));
  const immersive = new ImmersiveMode({
    document, button, sound,
    notify: (message) => notices.push(message),
    onChange: (active) => changes.push(active),
  });
  return {
    immersive, document, button, audio, sound, errors, notices, changes,
    nativeCalls: () => nativeCalls, exitCalls: () => exitCalls,
  };
}

function pressEscape(document) {
  const event = new Event("keydown");
  event.key = "Escape";
  document.dispatchEvent(event);
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("fullscreen after the final song has ended keeps the ending silent instead of forcing audio back on", async () => {
  const { immersive, sound, audio, notices } = fixture();
  sound.phase = "birthday";
  sound.birthdayFinished = true;
  await immersive.enter();
  assert.equal(immersive.active, true);
  assert.equal(audio.playCalls, 0);
  assert.equal(sound.enabled, false);
  assert.match(notices.at(-1), /音乐已播放完毕/);
  await immersive.exit();
  assert.equal(audio.playCalls, 0);
});

test("fullscreen begins both music and the native request in the button gesture, then Escape restores the original silent state", async () => {
  const { immersive, document, sound, audio, changes, button, nativeCalls, exitCalls } = fixture();
  const entering = immersive.enter();
  assert.equal(audio.playCalls, 1);
  assert.equal(nativeCalls(), 1);
  assert.equal(immersive.active, true);
  await entering;
  assert.equal(document.body.dataset.immersive, "true");
  assert.equal(sound.enabled, true);
  assert.equal(audio.paused, false);
  assert.equal(button.attributes["aria-pressed"], "true");
  pressEscape(document);
  await flush();
  assert.equal(immersive.active, false);
  assert.equal(exitCalls(), 1);
  assert.equal(document.fullscreenElement, null);
  assert.equal(document.body.dataset.immersive, undefined);
  assert.equal(sound.enabled, false);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 27);
  assert.equal(button.focused, true);
  assert.deepEqual(changes, [true, false]);
});

test("entering a paused scene starts music; leaving restores the previous enabled-but-paused settings", async () => {
  const { immersive, sound, audio } = fixture();
  await sound.setPaused(true);
  await sound.setEnabled(true);
  await immersive.enter();
  assert.equal(sound.paused, false);
  assert.equal(audio.paused, false);
  await immersive.exit();
  assert.equal(sound.enabled, true);
  assert.equal(sound.paused, true);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 27);
});

test("an already playing soundtrack continues at the same position after a native browser exit", async () => {
  const { immersive, document, sound, audio, changes } = fixture();
  await sound.setEnabled(true);
  await immersive.enter();
  await document.exitFullscreen();
  await flush();
  assert.equal(immersive.active, false);
  assert.equal(sound.enabled, true);
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 27);
  assert.deepEqual(changes, [true, false]);
});

test("Safari's prefixed fullscreen entry and exit use the same immersive behavior", async () => {
  const { immersive, document } = fixture({ prefixed: true });
  await immersive.enter();
  assert.equal(document.webkitFullscreenElement, document.documentElement);
  await immersive.exit();
  assert.equal(document.webkitFullscreenElement, null);
  assert.equal(immersive.active, false);
});

test("without native fullscreen, the explicit viewport fallback supports Escape and keyboard-free double-tap exit", async () => {
  const { immersive, document, notices } = fixture({ native: false });
  await immersive.enter();
  assert.match(notices[0], /不支持原生全屏/);
  assert.equal(immersive.session.fallback, true);
  pressEscape(document);
  await flush();
  assert.equal(immersive.active, false);
  await immersive.enter();
  const target = { closest: () => null };
  const tap = (time, x, y) => {
    const event = new Event("pointerup");
    Object.defineProperties(event, {
      pointerType: { value: "touch" }, target: { value: target },
      timeStamp: { value: time }, clientX: { value: x }, clientY: { value: y },
    });
    document.dispatchEvent(event);
  };
  tap(100, 50, 50);
  tap(300, 200, 200);
  assert.equal(immersive.active, true);
  tap(500, 205, 200);
  await flush();
  assert.equal(immersive.active, false);
});

test("fullscreen denial restores visible controls and original audio settings, with an explicit error", async (t) => {
  const { immersive, document, notices, sound, audio, button } = fixture();
  t.mock.method(console, "error", () => {});
  document.documentElement.requestFullscreen = () => Promise.reject(new Error("Fullscreen denied"));
  await immersive.enter();
  assert.equal(immersive.active, false);
  assert.equal(document.body.dataset.immersive, undefined);
  assert.equal(button.disabled, false);
  assert.equal(sound.enabled, false);
  assert.equal(audio.paused, true);
  assert.match(notices.at(-1), /无法开启/);
});

test("music denial exits fullscreen instead of leaving a silent, control-free experience", async (t) => {
  const { immersive, document, notices, audio } = fixture();
  t.mock.method(console, "error", () => {});
  audio.playError = new DOMException("Playback denied", "NotAllowedError");
  await immersive.enter();
  assert.equal(immersive.active, false);
  assert.equal(document.fullscreenElement, null);
  assert.equal(document.body.dataset.immersive, undefined);
  assert.match(notices.at(-1), /无法开启/);
});

test("Escape during pending entry cannot let a late native request re-enter immersive playback", async () => {
  const { immersive, document, sound, button } = fixture();
  let complete;
  document.documentElement.requestFullscreen = () => new Promise((resolve) => {
    complete = () => {
      document.fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
      resolve();
    };
  });
  const entering = immersive.enter();
  pressEscape(document);
  await flush();
  complete();
  await entering;
  assert.equal(document.fullscreenElement, null);
  assert.equal(immersive.active, false);
  assert.equal(sound.enabled, false);
  assert.equal(button.disabled, false);
});

test("a late native request is also exited after music has already failed", async (t) => {
  const { immersive, document, audio } = fixture();
  t.mock.method(console, "error", () => {});
  let complete;
  document.documentElement.requestFullscreen = () => new Promise((resolve) => {
    complete = () => {
      document.fullscreenElement = document.documentElement;
      document.dispatchEvent(new Event("fullscreenchange"));
      resolve();
    };
  });
  audio.playError = new Error("Broken audio");
  await immersive.enter();
  assert.equal(immersive.active, false);
  complete();
  await flush();
  assert.equal(document.fullscreenElement, null);
});

test("repeated entry and duplicate exit events cannot overwrite saved music settings", async () => {
  const { immersive, document, nativeCalls, sound, changes } = fixture();
  const entering = immersive.enter();
  await immersive.enter();
  await entering;
  assert.equal(nativeCalls(), 1);
  await immersive.exit();
  await immersive.exit();
  document.dispatchEvent(new Event("fullscreenchange"));
  assert.equal(sound.enabled, false);
  assert.deepEqual(changes, [true, false]);
});

test("a streaming error can restore controls without retrying the failed music", async () => {
  const { immersive, sound, audio } = fixture();
  await sound.setEnabled(true);
  await immersive.enter();
  sound.stop();
  const calls = audio.playCalls;
  await immersive.exit({ restoreMusic: false });
  assert.equal(sound.enabled, false);
  assert.equal(audio.playCalls, calls);
  assert.equal(immersive.active, false);
});
