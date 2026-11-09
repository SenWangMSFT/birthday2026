import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BIRTHDAY_MUSIC_URL, BackgroundMusic, SUNSHINE_URL } from "../background-music.js";

class FakeAudio extends EventTarget {
  paused = true;
  currentTime = 42;
  playCalls = 0;
  playError = null;
  error = null;
  pendingPlay = null;
  loadCalls = 0;

  play() {
    this.playCalls += 1;
    if (this.playError) return Promise.reject(this.playError);
    const result = this.pendingPlay ?? Promise.resolve();
    return result.then(() => { this.paused = false; });
  }

  pause() {
    this.paused = true;
  }

  load() {
    this.loadCalls += 1;
    this.error = null;
    this.currentTime = 0;
  }
}

test("the music uses the exact supplied Sunshine MP3", async () => {
  assert.equal(SUNSHINE_URL, new URL("../music/Sunshine - Nikita Kondrashev (320k).mp3", import.meta.url).href);
  const bytes = await readFile(new URL(SUNSHINE_URL));
  assert.ok(bytes.length > 1000000);
  assert.ok(bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
});

test("the cake soundtrack uses the supplied birthday piano MP3 unchanged", async () => {
  const bytes = await readFile(new URL(BIRTHDAY_MUSIC_URL));
  assert.ok(bytes.length > 1000000);
  assert.ok(bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
  assert.match(decodeURIComponent(BIRTHDAY_MUSIC_URL), /Happy Birthday Piano Instrumental/);
});
test("music is opt-in, locally sourced, looped, and not preloaded", () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  assert.equal(music.enabled, false);
  assert.equal(audio.playCalls, 0);
  assert.equal(audio.src, SUNSHINE_URL);
  assert.equal(audio.loop, true);
  assert.equal(audio.preload, "none");
  assert.equal(audio.volume, 0.35);
});

test("the sound toggle plays and pauses without rewinding the song", async () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  await music.toggle();
  assert.equal(music.enabled, true);
  assert.equal(audio.paused, false);
  await music.toggle();
  assert.equal(music.enabled, false);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 42);
  await music.toggle();
  assert.equal(audio.currentTime, 42);
});

test("scene and tab pause suspend music without losing the enabled preference", async () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  await music.toggle();
  await music.setPaused(true);
  assert.equal(audio.paused, true);
  assert.equal(music.enabled, true);
  await music.setPaused(false);
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 42);
});

test("enabling sound during a paused scene waits for resume", async () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  await music.setPaused(true);
  await music.toggle();
  assert.equal(music.enabled, true);
  assert.equal(audio.playCalls, 0);
  await music.setPaused(false);
  assert.equal(audio.paused, false);
});

test("enabling sound allows both tracks to buffer ahead without loading again or losing position", async () => {
  const audio = new FakeAudio();
  const birthday = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {}, "story", birthday);
  assert.equal(audio.preload, "none");
  assert.equal(birthday.preload, "none");
  await music.setPaused(true);
  await music.setEnabled(true);
  assert.equal(audio.preload, "auto");
  assert.equal(birthday.preload, "auto");
  assert.equal(audio.currentTime, 42);
  assert.equal(birthday.currentTime, 42);
  assert.equal(audio.loadCalls, 0);
  assert.equal(birthday.loadCalls, 0);
  assert.equal(audio.playCalls, 0);
  assert.equal(birthday.playCalls, 0);
  await music.setEnabled(false);
  assert.equal(audio.currentTime, 42);
  assert.equal(birthday.currentTime, 42);
});

test("explicitly enabling music is idempotent and preserves its playback position", async () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  await music.setEnabled(true);
  await music.setEnabled(true);
  assert.equal(music.enabled, true);
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 42);
  await music.setEnabled(false);
  assert.equal(music.enabled, false);
  assert.equal(audio.paused, true);
});

test("playback denial is surfaced and resets the enabled state for retry", async () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  const error = new DOMException("Playback requires a gesture.", "NotAllowedError");
  audio.playError = error;
  await assert.rejects(music.toggle(), error);
  assert.equal(music.enabled, false);
  assert.equal(audio.paused, true);
  audio.playError = null;
  await music.toggle();
  assert.equal(audio.paused, false);
});

test("streaming errors report a failure rather than leaving a playing-looking control", async () => {
  const audio = new FakeAudio();
  const errors = [];
  const music = new BackgroundMusic(audio, (error) => errors.push(error));
  await music.toggle();
  audio.error = { code: 3, message: "Audio decoding failed." };
  audio.dispatchEvent(new Event("error"));
  assert.equal(music.enabled, false);
  assert.equal(audio.paused, true);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /decoding failed/);
});

test("a late play completion cannot restart sound after the viewer disables it", async () => {
  const audio = new FakeAudio();
  let resolvePlay;
  audio.pendingPlay = new Promise((resolve) => { resolvePlay = resolve; });
  const music = new BackgroundMusic(audio, () => {});
  const first = music.toggle();
  await music.toggle();
  resolvePlay();
  await first;
  assert.equal(music.enabled, false);
  assert.equal(audio.paused, true);
});

test("retrying a failed media source reloads it before playing again", async () => {
  const audio = new FakeAudio();
  const music = new BackgroundMusic(audio, () => {});
  audio.error = { code: 2, message: "The music could not be fetched." };
  await music.toggle();
  assert.equal(audio.loadCalls, 1);
  assert.equal(audio.error, null);
  assert.equal(music.enabled, true);
  assert.equal(audio.paused, false);
});

test("a cancelled older play request cannot disable a newer resume", async () => {
  const audio = new FakeAudio();
  let rejectPlay;
  audio.pendingPlay = new Promise((resolve, reject) => { rejectPlay = reject; });
  const music = new BackgroundMusic(audio, () => {});
  const first = music.toggle();
  await music.setPaused(true);
  audio.pendingPlay = null;
  await music.setPaused(false);
  rejectPlay(new DOMException("Playback was paused.", "AbortError"));
  await first;
  assert.equal(music.enabled, true);
  assert.equal(audio.paused, false);
});
