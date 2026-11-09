import assert from "node:assert/strict";
import test from "node:test";
import { BIRTHDAY_MUSIC_URL, BackgroundMusic } from "../background-music.js";
import { AMBIENCE_VOLUME, BIRTHDAY_FADE, CANDLE_CHIME_NOTES, CANDLE_CHIME_TAIL, HEARTBEAT_DURATION, HEARTBEAT_RELEASE, MUSIC_VOLUME, QUIET_FADE, SOUND_CROSSFADE, SceneSoundscape, fadeCurve, heartbeatPhase, heartbeatSamples, unlockSamples } from "../scene-soundscape.js";
import { MAGIC_REVEAL_DURATION, MAGIC_UNLOCK_TIME, REDUCED_MAGIC_DURATION, MagicOpening } from "../magic-opening.js";

class FakeParam {
  value = 0;
  events = [];
  cancelAndHoldAtTime(time) { this.events.push(["hold", time]); }
  cancelScheduledValues(time) { this.events.push(["cancel", time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(["set", value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(["ramp", value, time]); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push(["exponential", value, time]); }
  setValueCurveAtTime(curve, time, duration) {
    this.value = curve.at(-1);
    this.events.push(["curve", curve, time, duration]);
  }
}

class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  pan = new FakeParam();
  delayTime = new FakeParam();
  detune = new FakeParam();
  connections = [];
  starts = [];
  stops = 0;
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; }
  start(time = 0, offset) {
    this.starts.push(time);
    this.offset = offset;
  }
  stop(time) { this.stops += 1; this.stopTime = time; }
}

class FakeContext {
  state = "suspended";
  currentTime = 8;
  sampleRate = 8000;
  destination = new FakeNode();
  mediaSources = 0;
  bufferSources = 0;
  resumeWait = null;
  resumeError = null;
  async resume() {
    if (this.resumeError) throw this.resumeError;
    await this.resumeWait;
    this.state = "running";
  }
  async suspend() { this.state = "suspended"; }
  createGain() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createDelay() { return new FakeNode(); }
  createStereoPanner() { return new FakeNode(); }
  createBufferSource() { this.bufferSources += 1; return new FakeNode(); }
  createMediaElementSource() { this.mediaSources += 1; return new FakeNode(); }
  createBuffer(channels, length, sampleRate) {
    return {
      length, duration: length / sampleRate, sampleRate,
      copyToChannel(samples) { this.samples = samples; },
    };
  }
}

class FakeAudio extends EventTarget {
  currentTime = 42;
  paused = true;
  error = null;
  playCalls = 0;
  pendingPlay = null;
  ended = false;
  play() {
    this.playCalls += 1;
    return (this.pendingPlay ?? Promise.resolve()).then(() => { this.paused = false; this.ended = false; });
  }
  pause() { this.paused = true; }
}

function fixture() {
  const audio = new FakeAudio();
  const context = new FakeContext();
  const errors = [];
  const music = new BackgroundMusic(audio, (error) => errors.push(error), "calculator");
  music.soundscape = new SceneSoundscape(audio, () => context);
  return { audio, context, music, graph: music.soundscape, errors };
}

function finaleFixture(onStateChange = () => {}) {
  const audio = new FakeAudio();
  const birthday = new FakeAudio();
  const context = new FakeContext();
  const errors = [];
  const music = new BackgroundMusic(audio, (error) => errors.push(error), "calculator", birthday, onStateChange);
  music.soundscape = new SceneSoundscape(audio, () => context, birthday);
  return { audio, birthday, context, music, graph: music.soundscape, errors };
}

test("the calculator ambience contains no noise buffer or granular source, only five smooth sine voices", () => {
  const { graph, context } = fixture();
  assert.equal(context.bufferSources, 0);
  assert.equal(graph.ambience.voices.length, 5);
  assert.ok(graph.ambience.voices.every(({ oscillator }) => oscillator.type === "sine"));
  assert.deepEqual(graph.ambience.voices.map(({ oscillator }) => oscillator.frequency.value),
    [110, 110.055, 164.8138, 220.07, 440.03]);
});

test("the unlock sound is a short, quiet latch and chime with silent boundaries and no clipping", () => {
  const samples = unlockSamples(48000);
  assert.equal(samples.length, 48000 * 1.5);
  assert.equal(samples[0], 0);
  assert.ok(Math.abs(samples.at(-1)) < 0.00001);
  let peak = 0;
  for (const sample of samples) {
    assert.ok(Number.isFinite(sample));
    peak = Math.max(peak, Math.abs(sample));
  }
  assert.ok(peak > 0.03 && peak < 0.25);
  for (const invalid of [-1, 0, NaN, 4000, 1000000, 44100.5]) {
    assert.throws(() => unlockSamples(invalid), RangeError);
  }
});

test("one graph starts muted, softens the pad with filters, and binds the Sunshine media element only once", () => {
  const { graph, context, audio } = fixture();
  assert.equal(graph.musicGain.gain.value, 0);
  assert.equal(graph.noiseGain.gain.value, 0);
  assert.equal(context.mediaSources, 1);
  assert.equal(audio.volume, 1);
  const lowpass = graph.ambience.pad.connections[0];
  const highpass = lowpass.connections[0];
  assert.equal(lowpass.type, "lowpass");
  assert.equal(lowpass.frequency.value, 900);
  assert.equal(highpass.type, "highpass");
  assert.equal(highpass.frequency.value, 40);
  assert.equal(highpass.connections[0], graph.ambience.breath);
  assert.equal(graph.ambience.breath.connections[0], graph.noiseGain);
});

test("the mystery pad has slow swells, gentle pitch drift, a distant glass voice and restrained echoes", () => {
  const { graph } = fixture();
  const { breath, echo, feedback, drift, breathMotion, shimmerMotion, voices } = graph.ambience;
  assert.equal(breath.gain.value, 0.78);
  assert.equal(echo.delayTime.value, 0.83);
  assert.ok(feedback.gain.value > 0 && feedback.gain.value < 0.3);
  assert.equal(drift.frequency.value, 0.015);
  assert.equal(breathMotion.frequency.value, 0.038);
  assert.equal(shimmerMotion.frequency.value, 0.025);
  assert.ok(voices.every(({ level }) => level.gain.value > 0 && level.gain.value <= 0.14));
  assert.ok([...voices.map(({ oscillator }) => oscillator), drift, breathMotion, shimmerMotion]
    .every((node) => node.starts.length === 1));
  assert.ok(drift.connections.every((node, index) => node.connections[0] === voices[index].oscillator.detune &&
    Math.abs(node.gain.value) <= 3));
  assert.ok(voices.some(({ position }) => position.pan.value < 0));
  assert.ok(voices.some(({ position }) => position.pan.value > 0));
});

test("all mystery layers share the one ambience fader, so silence and the Sunshine handoff cannot leak a drone or echo", async () => {
  const { music, graph, context } = fixture();
  await music.setEnabled(true);
  const bed = graph.ambience.breath;
  assert.deepEqual(bed.connections, [graph.noiseGain]);
  assert.ok(graph.ambience.voices.every(({ position }) => position.connections[0] === graph.ambience.pad));
  assert.equal(graph.ambience.highpass.connections[0], bed);
  assert.equal(graph.ambience.echo.connections[0].connections[0], bed);
  await music.setPhase("story");
  assert.equal(graph.noiseGain.gain.value, 0);
  await music.setPaused(true);
  assert.equal(context.state, "suspended");
  music.stop();
  assert.equal(graph.noiseGain.gain.value, 0);
  assert.equal(graph.musicGain.gain.value, 0);
});

test("enabling calculator sound primes the MP3 in the same gesture but keeps it inaudible and paused afterward", async () => {
  const { music, graph, context, audio } = fixture();
  const enabling = music.setEnabled(true);
  assert.equal(audio.playCalls, 1);
  assert.equal(graph.musicGain.gain.value, 0);
  await enabling;
  assert.equal(context.state, "running");
  assert.equal(graph.phase, "calculator");
  assert.ok(Math.abs(graph.noiseGain.gain.value - AMBIENCE_VOLUME) < 1e-7);
  assert.equal(graph.musicGain.gain.value, 0);
  assert.equal(audio.paused, true);
  assert.equal(audio.currentTime, 42);
  const calls = audio.playCalls;
  await music.setPaused(false);
  await music.setEnabled(false);
  await music.setEnabled(true);
  assert.equal(audio.playCalls, calls);
  assert.equal(audio.paused, true);
  assert.equal(context.mediaSources, 1);
});

test("only the unlocked handoff crossfades ambience into Sunshine, without restarting its playback position", async () => {
  const { music, graph, context, audio } = fixture();
  await music.setEnabled(true);
  await music.setPhase("story");
  assert.equal(graph.phase, "story");
  assert.equal(audio.paused, false);
  assert.equal(audio.currentTime, 42);
  assert.deepEqual(graph.musicGain.gain.events.at(-1), ["curve", fadeCurve(0, MUSIC_VOLUME), context.currentTime, SOUND_CROSSFADE]);
  assert.equal(graph.noiseGain.gain.events.at(-1)[1].at(-1), 0);
  const rampCount = graph.musicGain.gain.events.length;
  await music.setPaused(false);
  await music.setPhase("story");
  assert.equal(graph.musicGain.gain.events.length, rampCount);
});

test("replay fades back to ambience and pauses the MP3 only after its audio-clock fade finishes", async () => {
  const { music, graph, context, audio } = fixture();
  await music.setEnabled(true);
  await music.setPhase("story");
  context.currentTime += SOUND_CROSSFADE;
  await music.setPhase("calculator");
  assert.equal(graph.musicGain.gain.value, 0);
  assert.ok(Math.abs(graph.noiseGain.gain.value - AMBIENCE_VOLUME) < 1e-7);
  assert.equal(audio.paused, false);
  assert.deepEqual(graph.pauseMarker.starts, [context.currentTime + SOUND_CROSSFADE]);
  graph.pauseMarker.onended();
  assert.equal(audio.paused, true);
  assert.equal(graph.pauseMarker, null);
  assert.equal(audio.currentTime, 42);
});

test("a stale replay fade cannot pause Sunshine after a newer handoff", async () => {
  const { music, graph, audio, context } = fixture();
  await music.setEnabled(true);
  await music.setPhase("story");
  context.currentTime += SOUND_CROSSFADE;
  await music.setPhase("calculator");
  const marker = graph.pauseMarker;
  await music.setPhase("story");
  assert.equal(marker.onended, null);
  assert.equal(marker.stops, 1);
  assert.equal(graph.pauseMarker, null);
  assert.equal(audio.paused, false);
});

test("gain automation retargets from the actual curved envelope, not a stale AudioParam value", () => {
  const { graph, context } = fixture();
  const gain = graph.musicGain.gain;
  gain.cancelAndHoldAtTime = undefined;
  gain.value = 0.12;
  graph.ramp(gain, MUSIC_VOLUME, SOUND_CROSSFADE);
  assert.deepEqual(gain.events, [
    ["cancel", 0],
    ["set", 0.12, context.currentTime],
    ["curve", fadeCurve(0.12, MUSIC_VOLUME), context.currentTime, SOUND_CROSSFADE],
  ]);
  context.currentTime += SOUND_CROSSFADE / 2;
  gain.value = 0;
  graph.ramp(gain, 0, SOUND_CROSSFADE);
  const held = gain.events.at(-2)[1];
  assert.ok(Math.abs(held - (0.12 + MUSIC_VOLUME) / 2) < 1e-8);
  assert.ok(Math.abs(gain.events.at(-1)[1][0] - held) < 1e-8);
  assert.throws(() => graph.mix("unknown"), TypeError);
});

test("soundtrack fade curves have gentle endpoints and bounded sample-to-sample changes", () => {
  const incoming = fadeCurve(0, MUSIC_VOLUME);
  const outgoing = fadeCurve(MUSIC_VOLUME, 0);
  assert.ok(SOUND_CROSSFADE >= 4);
  assert.ok(BIRTHDAY_FADE >= 3);
  assert.equal(incoming.length, 129);
  assert.equal(incoming[0], 0);
  assert.ok(Math.abs(incoming.at(-1) - MUSIC_VOLUME) < 1e-7);
  assert.equal(outgoing.at(-1), 0);
  assert.ok(incoming[1] < MUSIC_VOLUME * 0.001);
  assert.ok(incoming.at(-1) - incoming.at(-2) < MUSIC_VOLUME * 0.001);
  for (let index = 1; index < incoming.length; index += 1) {
    assert.ok(incoming[index] >= incoming[index - 1]);
    assert.ok(incoming[index] - incoming[index - 1] < 0.005);
    assert.ok(Math.abs(incoming[index] + outgoing[index] - MUSIC_VOLUME) < 1e-7);
  }
  assert.throws(() => fadeCurve(NaN, 0), RangeError);
});

test("pause freezes the audio clock, fades and cue without clearing them; mute cancels active cues", async () => {
  const { music, graph, context, audio } = fixture();
  await music.setEnabled(true);
  await music.playUnlock();
  assert.equal(graph.cues.size, 1);
  const cue = [...graph.cues][0];
  await music.setPaused(true);
  assert.equal(context.state, "suspended");
  assert.equal(graph.cues.size, 1);
  assert.equal(cue.stops, 0);
  await music.setPaused(false);
  assert.equal(context.state, "running");
  assert.equal(graph.cues.size, 1);
  await music.setEnabled(false);
  assert.equal(cue.stops, 1);
  assert.equal(graph.cues.size, 0);
  assert.equal(context.state, "suspended");
  assert.equal(audio.paused, true);
  await music.playUnlock();
  assert.equal(graph.cues.size, 0);
});

test("unlock nodes are disposed when the short sound ends and story scenes cannot trigger the cue", async () => {
  const { music, graph } = fixture();
  await music.setEnabled(true);
  await music.playUnlock();
  const cue = [...graph.cues][0];
  cue.onended();
  assert.equal(graph.cues.size, 0);
  assert.deepEqual(cue.connections, []);
  await music.setPhase("story");
  await music.playUnlock();
  assert.equal(graph.cues.size, 0);
});

test("a late pending media play cannot resurrect Sunshine or ambience after mute", async () => {
  const { music, graph, context, audio } = fixture();
  let resolve;
  audio.pendingPlay = new Promise((complete) => { resolve = complete; });
  const enabling = music.setEnabled(true);
  await music.setEnabled(false);
  resolve();
  await enabling;
  assert.equal(music.enabled, false);
  assert.equal(audio.paused, true);
  assert.equal(context.state, "suspended");
  assert.equal(graph.musicGain.gain.value, 0);
  assert.equal(graph.noiseGain.gain.value, 0);
});

test("a pending unlock cue is cancelled by mute, but not lost to a same-frame story handoff", async () => {
  const { music, context, graph } = fixture();
  await music.setEnabled(true);
  let resume;
  context.state = "suspended";
  context.resumeWait = new Promise((resolve) => { resume = resolve; });
  const cancelled = music.playUnlock();
  await music.setEnabled(false);
  resume();
  await cancelled;
  assert.equal(graph.cues.size, 0);
  assert.equal(context.state, "suspended");
  context.resumeWait = null;
  await music.setEnabled(true);
  const cue = music.playUnlock();
  await music.setPhase("story");
  await cue;
  assert.equal(graph.cues.size, 1);
});

test("audio resume failures explicitly disable playback and silence every layer", async () => {
  const { music, graph, context } = fixture();
  context.resumeError = new Error("Audio permission denied");
  await assert.rejects(music.setEnabled(true), /Audio permission denied/);
  assert.equal(music.enabled, false);
  assert.equal(graph.phase, null);
  assert.equal(graph.musicGain.gain.value, 0);
  assert.equal(graph.noiseGain.gain.value, 0);
  assert.throws(() => music.setPhase("unknown"), TypeError);
});

test("the suspense buffer is exactly thirty seconds, with slower heartbeats and a long soft release", () => {
  const samples = heartbeatSamples(48000);
  assert.equal(HEARTBEAT_DURATION, 30);
  assert.equal(samples.length, 48000 * 30);
  assert.equal(samples[0], 0);
  assert.ok(Math.abs(samples.at(-1)) < 0.0001);
  let peak = 0;
  let step = 0;
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(Number.isFinite(samples[index]));
    peak = Math.max(peak, Math.abs(samples[index]));
    step = Math.max(step, Math.abs(samples[index] - samples[index - 1]));
  }
  assert.ok(peak > 0.15 && peak < 0.6);
  assert.ok(step < 0.02);
  assert.throws(() => heartbeatSamples(0), RangeError);
  assert.throws(() => heartbeatPhase(-1), RangeError);
  assert.throws(() => heartbeatPhase(31), RangeError);
  assert.ok(heartbeatPhase(1) < 0.7);
  assert.ok(heartbeatPhase(30) - heartbeatPhase(29) < 0.8);
  assert.ok(heartbeatPhase(30) < 22);
  let earlyTail = 0;
  let lateTail = 0;
  for (let index = 26 * 48000; index < 27 * 48000; index += 1) earlyTail += samples[index] ** 2;
  for (let index = 29 * 48000; index < 30 * 48000; index += 1) lateTail += samples[index] ** 2;
  assert.ok(lateTail < earlyTail * 0.1);
});

test("birthday piano is primed silently in the enabling gesture, not audibly played during the calculator or story", async () => {
  const { music, birthday, graph, context } = finaleFixture();
  assert.equal(birthday.src, BIRTHDAY_MUSIC_URL);
  assert.equal(birthday.loop, true);
  const enabling = music.setEnabled(true);
  assert.equal(birthday.playCalls, 1);
  assert.equal(graph.birthdayGain.gain.value, 0);
  await enabling;
  assert.equal(birthday.paused, true);
  assert.equal(context.mediaSources, 2);
  await music.setPhase("story");
  assert.equal(birthday.paused, true);
  assert.equal(birthday.playCalls, 1);
  assert.equal(graph.birthdayGain.gain.value, 0);
});

test("Sunshine fades away before suspense; heartbeat starts at the current scene offset and birthday music only at cake", async () => {
  const { music, audio, birthday, graph, context } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("story");
  context.currentTime += SOUND_CROSSFADE;
  await music.setPhase("quiet");
  assert.equal(graph.musicGain.gain.value, 0);
  assert.equal(graph.musicGain.gain.events.at(-1)[3], QUIET_FADE);
  context.currentTime += QUIET_FADE;
  graph.pauseMarker.onended();
  assert.equal(graph.heartbeat ?? null, null);
  music.suspenseElapsed = 3500;
  await music.setPhase("suspense");
  assert.equal(graph.heartbeat.buffer.duration, 30);
  assert.equal(graph.heartbeat.offset, 3.5);
  assert.ok(Math.abs(graph.suspenseGain.gain.value - 0.4) < 1e-7);
  assert.equal(birthday.paused, true);
  const heart = graph.heartbeat;
  await music.setPhase("birthday");
  assert.equal(heart.stops, 1);
  assert.equal(heart.stopTime, context.currentTime + HEARTBEAT_RELEASE);
  heart.onended();
  assert.equal(graph.heartbeat, null);
  assert.equal(graph.suspenseGain.gain.value, 0);
  assert.equal(audio.paused, true);
  assert.equal(birthday.paused, false);
  assert.ok(Math.abs(graph.birthdayGain.gain.value - MUSIC_VOLUME) < 1e-7);
  assert.equal(birthday.currentTime, 42);
});

test("pausing preserves the current heartbeat; muting cancels it and enabling resumes at the remaining countdown position", async () => {
  const { music, graph, context } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("suspense");
  const heart = graph.heartbeat;
  await music.setPaused(true);
  assert.equal(graph.heartbeat, heart);
  assert.equal(heart.stops, 0);
  assert.equal(context.state, "suspended");
  await music.setPaused(false);
  assert.equal(graph.heartbeat, heart);
  await music.setEnabled(false);
  assert.equal(heart.stops, 1);
  assert.equal(graph.heartbeat, null);
  music.suspenseElapsed = 9000;
  await music.setEnabled(true);
  assert.equal(graph.heartbeat.offset, 9);
  assert.notEqual(graph.heartbeat, heart);
});

test("late birthday playback cannot restart after mute or after replaying the calculator", async () => {
  const { music, birthday, context, graph } = finaleFixture();
  await music.setEnabled(true);
  let resolve;
  birthday.pendingPlay = new Promise((complete) => { resolve = complete; });
  const playing = music.setPhase("birthday");
  await music.setEnabled(false);
  resolve();
  await playing;
  assert.equal(birthday.paused, true);
  assert.equal(context.state, "suspended");
  birthday.pendingPlay = null;
  await music.setEnabled(true);
  assert.equal(birthday.paused, false);
  context.currentTime += BIRTHDAY_FADE;
  await music.setPhase("calculator");
  assert.equal(birthday.paused, false);
  assert.deepEqual(graph.birthdayPauseMarker.starts, [context.currentTime + SOUND_CROSSFADE]);
  graph.birthdayPauseMarker.onended();
  assert.equal(birthday.paused, true);
});

test("replay lets birthday piano finish fading and a newer cake reveal cancels its pending stop", async () => {
  const { music, graph, context, birthday } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  context.currentTime += BIRTHDAY_FADE;
  await music.setPhase("calculator");
  const marker = graph.birthdayPauseMarker;
  assert.equal(birthday.paused, false);
  context.currentTime += 1;
  await music.setPhase("birthday");
  assert.equal(marker.onended, null);
  assert.equal(marker.stops, 1);
  assert.equal(birthday.paused, false);
  assert.equal(graph.birthdayPauseMarker, null);
});

test("pausing an outgoing birthday fade preserves its marker and resumes the remainder without a premature media stop", async () => {
  const { music, graph, context, birthday } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  context.currentTime += BIRTHDAY_FADE;
  await music.setPhase("calculator");
  const marker = graph.birthdayPauseMarker;
  context.currentTime += 1;
  await music.setPaused(true);
  assert.equal(context.state, "suspended");
  assert.equal(birthday.paused, true);
  assert.equal(graph.birthdayPauseMarker, marker);
  await music.setPaused(false);
  assert.equal(birthday.paused, false);
  assert.equal(graph.birthdayPauseMarker, marker);
  assert.deepEqual(marker.starts, [context.currentTime - 1 + SOUND_CROSSFADE]);
  marker.onended();
  assert.equal(birthday.paused, true);
});

test("replay stops any suspense immediately and a consumed countdown cannot spawn another heartbeat", async () => {
  const { music, graph } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("suspense");
  const heart = graph.heartbeat;
  await music.setPhase("calculator");
  assert.equal(heart.stops, 1);
  assert.equal(graph.heartbeat, null);
  music.suspenseElapsed = 30000;
  await music.setPhase("suspense");
  assert.equal(graph.heartbeat, null);
  assert.throws(() => graph.startHeartbeat(-1), RangeError);
});

test("the candle cue schedules a gentle rising chime, ducks the piano and restores it when the tail ends", async () => {
  const { music, graph, context } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  context.currentTime += BIRTHDAY_FADE;
  await music.playCandleWish();
  const cue = graph.wishCue;
  assert.equal(cue.sources.length, 12);
  assert.ok(Math.abs(CANDLE_CHIME_NOTES.at(-1).delay + CANDLE_CHIME_TAIL - 7.2) < 1e-8);
  assert.ok(CANDLE_CHIME_NOTES.every((note, index) => !index ||
    note.frequency > CANDLE_CHIME_NOTES[index - 1].frequency));
  assert.ok(Math.abs(graph.birthdayGain.gain.value - 0.18) < 1e-7);
  for (const [index, note] of CANDLE_CHIME_NOTES.entries()) {
    const voice = cue.sources[index * 2];
    assert.equal(voice.type, "sine");
    assert.equal(voice.frequency.value, note.frequency);
    assert.deepEqual(voice.starts, [context.currentTime + note.delay]);
    assert.equal(voice.stopTime, context.currentTime + note.delay + CANDLE_CHIME_TAIL);
  }
  await music.playCandleWish();
  assert.equal(graph.wishCue, cue);
  for (const source of [...cue.sources]) source.onended();
  assert.equal(graph.wishCue, null);
  assert.ok(Math.abs(graph.birthdayGain.gain.value - MUSIC_VOLUME) < 1e-7);
  assert.ok(cue.nodes.every((node) => !node.connections.length));
});

test("pause preserves the magical cue; mute and replay clear every scheduled voice without a late chime", async () => {
  const { music, graph, context } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  await music.playCandleWish();
  const cue = graph.wishCue;
  await music.setPaused(true);
  assert.equal(context.state, "suspended");
  assert.equal(graph.wishCue, cue);
  await music.setPaused(false);
  assert.equal(graph.wishCue, cue);
  await music.setEnabled(false);
  assert.equal(graph.wishCue, null);
  assert.ok(cue.sources.every((source) => source.onended === null && !source.connections.length));
  assert.ok(cue.nodes.every((node) => !node.connections.length));
  await music.playCandleWish();
  assert.equal(graph.wishCue, null);
  await music.setEnabled(true);
  await music.playCandleWish();
  const replayed = graph.wishCue;
  await music.setPhase("calculator");
  assert.equal(graph.wishCue, null);
  assert.ok(replayed.sources.every((source) => source.onended === null));
  await music.playCandleWish();
  assert.equal(graph.wishCue, null);
});

test("a first cake gesture can chime before media priming completes without losing the piano duck", async () => {
  const { music, graph } = finaleFixture();
  music.enabled = true;
  music.phase = "birthday";
  assert.equal(graph.phase, null);
  await music.playCandleWish();
  assert.equal(graph.wishCue.sources.length, 12);
  graph.mix("birthday");
  assert.ok(Math.abs(graph.birthdayGain.gain.value - 0.18) < 1e-7);
  assert.equal(graph.wishCue.sources.length, 12);
});
function openingFixture(reduced = false) {
  const calls = { unlock: 0, complete: 0 };
  const opening = {
    active: true, revealing: true, elapsed: 0, unlockPlayed: false, reduced,
    root: { hidden: false },
    renderReveal() {},
    setReducedMotion: MagicOpening.prototype.setReducedMotion,
    onUnlock() { calls.unlock += 1; },
    onComplete() { calls.complete += 1; },
  };
  const advance = (delta, paused = false) => MagicOpening.prototype.advance.call(opening, delta, paused, reduced);
  return { opening, calls, advance };
}

test("the unlock cue fires exactly once at the shackle opening, not on calculator digits or equals", () => {
  const { opening, calls, advance } = openingFixture();
  advance(MAGIC_UNLOCK_TIME - 1);
  assert.equal(calls.unlock, 0);
  advance(1000, true);
  assert.equal(calls.unlock, 0);
  advance(1);
  assert.equal(calls.unlock, 1);
  advance(100);
  assert.equal(calls.unlock, 1);
  advance(MAGIC_REVEAL_DURATION);
  advance(1000);
  assert.equal(calls.unlock, 1);
  assert.equal(calls.complete, 1);
  assert.equal(opening.root.hidden, true);
});

test("candle activation disables looping but does not stop, restart or seek the current birthday track", async () => {
  const { music, birthday } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  const calls = birthday.playCalls;
  const position = birthday.currentTime;
  music.finishBirthdayAtEnd();
  music.finishBirthdayAtEnd();
  assert.equal(birthday.loop, false);
  assert.equal(birthday.paused, false);
  assert.equal(birthday.playCalls, calls);
  assert.equal(birthday.currentTime, position);
  assert.equal(music.birthdayFinishArmed, true);
  assert.equal(music.birthdayFinished, false);
});

test("the native birthday end stops every sound once and no pause, visibility or sound-enable request can restart it", async () => {
  let updates = 0;
  const { music, birthday, audio, graph, context } = finaleFixture(() => { updates += 1; });
  await music.setEnabled(true);
  await music.setPhase("birthday");
  music.finishBirthdayAtEnd();
  await music.playCandleWish();
  const cue = graph.wishCue;
  birthday.ended = true;
  birthday.dispatchEvent(new Event("ended"));
  await Promise.resolve();
  assert.equal(music.birthdayFinished, true);
  assert.equal(music.enabled, false);
  assert.equal(birthday.paused, true);
  assert.equal(audio.paused, true);
  assert.equal(context.state, "suspended");
  assert.equal(graph.wishCue, null);
  assert.ok(cue.sources.every((source) => source.onended === null && !source.connections.length));
  assert.equal(graph.birthdayGain.gain.value, 0);
  assert.equal(graph.musicGain.gain.value, 0);
  const calls = birthday.playCalls;
  await music.setPaused(true);
  await music.setPaused(false);
  await music.setEnabled(true);
  await music.setPhase("birthday");
  await music.playCandleWish();
  birthday.dispatchEvent(new Event("ended"));
  assert.equal(birthday.playCalls, calls);
  assert.equal(music.enabled, false);
  assert.equal(updates, 1);
});

test("a natural end before candle activation is ignored, but an already-ended armed track completes immediately", async () => {
  let updates = 0;
  const { music, birthday } = finaleFixture(() => { updates += 1; });
  await music.setEnabled(true);
  await music.setPhase("birthday");
  birthday.dispatchEvent(new Event("ended"));
  assert.equal(music.birthdayFinished, false);
  assert.equal(music.enabled, true);
  birthday.ended = true;
  music.finishBirthdayAtEnd();
  assert.equal(music.birthdayFinished, true);
  assert.equal(music.enabled, false);
  assert.equal(updates, 1);
});

test("replay resets the completed-track guard and restores looping for the new cake", async () => {
  const { music, birthday } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  music.finishBirthdayAtEnd();
  birthday.ended = true;
  birthday.dispatchEvent(new Event("ended"));
  await music.setPhase("calculator");
  assert.equal(music.birthdayFinishArmed, false);
  assert.equal(music.birthdayFinished, false);
  assert.equal(birthday.loop, true);
  assert.equal(birthday.currentTime, 0);
  await music.setEnabled(true);
  await music.setPhase("birthday");
  assert.equal(birthday.paused, false);
});

test("a replayed muted cake does not inherit the previous round's ended flag before its first playback", async () => {
  const { music, birthday } = finaleFixture();
  await music.setEnabled(true);
  await music.setPhase("birthday");
  music.finishBirthdayAtEnd();
  birthday.ended = true;
  birthday.dispatchEvent(new Event("ended"));
  await music.setPhase("calculator");
  await music.setPhase("birthday");
  music.finishBirthdayAtEnd();
  assert.equal(birthday.currentTime, 0);
  assert.equal(music.birthdayFinished, false);
  assert.equal(birthday.loop, false);
  await music.setEnabled(true);
  assert.equal(birthday.paused, false);
  assert.equal(birthday.ended, false);
});

test("a late pending play promise cannot resurrect the birthday track after its native end", async () => {
  const { music, birthday, context } = finaleFixture();
  await music.setEnabled(true);
  let resolve;
  birthday.pendingPlay = new Promise((complete) => { resolve = complete; });
  const starting = music.setPhase("birthday");
  music.finishBirthdayAtEnd();
  birthday.ended = true;
  birthday.dispatchEvent(new Event("ended"));
  resolve();
  await starting;
  assert.equal(music.birthdayFinished, true);
  assert.equal(music.enabled, false);
  assert.equal(birthday.paused, true);
  assert.equal(context.state, "suspended");
});
test("reduced motion keeps the same relative unlock moment and a slow frame cannot repeat the cue", () => {
  const { calls, advance } = openingFixture(true);
  const cueTime = MAGIC_UNLOCK_TIME / MAGIC_REVEAL_DURATION * REDUCED_MAGIC_DURATION;
  advance(cueTime - 1);
  assert.equal(calls.unlock, 0);
  advance(2);
  assert.equal(calls.unlock, 1);
  advance(REDUCED_MAGIC_DURATION * 10);
  assert.equal(calls.unlock, 1);
  assert.equal(calls.complete, 1);
  const fresh = openingFixture();
  fresh.advance(MAGIC_REVEAL_DURATION * 10);
  assert.equal(fresh.calls.unlock, 1);
  assert.equal(fresh.calls.complete, 1);
});
