export const SOUND_CROSSFADE = 4;
export const QUIET_FADE = 2.6;
export const BIRTHDAY_FADE = 3.6;
export const HEARTBEAT_RELEASE = 1.6;
export const AMBIENCE_VOLUME = 0.16;
export const MUSIC_VOLUME = 0.35;
export const SOUND_PHASES = Object.freeze(["calculator", "story", "quiet", "suspense", "birthday"]);
export const HEARTBEAT_DURATION = 30;
export const CANDLE_CHIME_NOTES = Object.freeze([
  [0, 523.251], [0.72, 659.255], [1.6, 783.991],
  [2.7, 1046.502], [3.9, 1318.51], [5.1, 1567.982],
].map(([delay, frequency]) => Object.freeze({ delay, frequency })));
export const CANDLE_CHIME_TAIL = 2.1;

export function heartbeatPhase(time) {
  if (!Number.isFinite(time) || time < 0 || time > HEARTBEAT_DURATION) throw new RangeError("Heartbeat time must be inside the countdown.");
  return time / 1.5 + 0.0015 * time * time;
}

export function fadeCurve(from, to) {
  if (![from, to].every((value) => Number.isFinite(value) && value >= 0)) throw new RangeError("Fade gains must be finite and non-negative.");
  return Float32Array.from({ length: 129 }, (_, index) =>
    from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * index / 128)));
}

function noiseGenerator() {
  let state = 0x71a4c391;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  };
}

export function unlockSamples(sampleRate) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new RangeError("Unsupported audio sample rate.");
  }
  const noise = noiseGenerator();
  return Float32Array.from({ length: Math.ceil(sampleRate * 1.5) }, (_, index) => {
    const time = index / sampleRate;
    const click = noise() * 0.22 * (1 - Math.exp(-time / 0.0008)) * Math.exp(-time / 0.009);
    const latchTime = time - 0.11;
    const latch = latchTime > 0 ? noise() * 0.12 * (1 - Math.exp(-latchTime / 0.001)) * Math.exp(-latchTime / 0.014) : 0;
    const ringTime = Math.max(0, time - 0.16);
    const envelope = (1 - Math.exp(-ringTime / 0.025)) * Math.exp(-ringTime / 0.32) *
      Math.min(1, (1.5 - time) / 0.12);
    const ring = (Math.sin(2 * Math.PI * 659.255 * ringTime) +
      0.36 * Math.sin(2 * Math.PI * 987.767 * ringTime) +
      0.12 * Math.sin(2 * Math.PI * 1318.51 * ringTime)) * 0.075 * envelope;
    return click + latch + ring;
  });
}

export function heartbeatSamples(sampleRate) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) {
    throw new RangeError("Unsupported audio sample rate.");
  }
  const pulse = (time, frequency, volume) => time >= 0 && time < 0.5
    ? Math.sin(2 * Math.PI * frequency * time) * (1 - Math.exp(-time / 0.018)) * Math.exp(-time / 0.085) * volume : 0;
  return Float32Array.from({ length: sampleRate * HEARTBEAT_DURATION }, (_, index) => {
    const time = index / sampleRate;
    const phase = heartbeatPhase(time);
    const beat = (phase % 1) / (1 / 1.5 + 0.003 * time);
    const heart = pulse(beat, 52, 0.38) + pulse(beat - 0.28, 64, 0.22);
    const swell = 0.4 + 0.6 * Math.sin(Math.PI * time / (HEARTBEAT_DURATION * 2));
    const suspense = (Math.sin(2 * Math.PI * 55 * time) * 0.035 +
      Math.sin(2 * Math.PI * 82.4 * time) * 0.018 +
      Math.sin(2 * Math.PI * 110.1 * time) * 0.012) * swell;
    const smooth = (value) => {
      const progress = Math.max(0, Math.min(1, value));
      return progress * progress * (3 - 2 * progress);
    };
    const envelope = smooth(time / 1.5) * smooth((HEARTBEAT_DURATION - time) / 3.5);
    return (heart + suspense) * envelope;
  });
}

function audioContext() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (!Context) throw new Error("This browser does not support Web Audio.");
  return new Context();
}

export function createMysteryAmbience(context, output) {
  const breath = context.createGain();
  breath.gain.value = 0.78;
  breath.connect(output);
  const pad = context.createGain();
  const lowpass = context.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 900;
  lowpass.Q.value = 0.3;
  const highpass = context.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = 40;
  pad.connect(lowpass).connect(highpass).connect(breath);

  const echo = context.createDelay(2);
  echo.delayTime.value = 0.83;
  const echoLevel = context.createGain();
  echoLevel.gain.value = 0.28;
  highpass.connect(echo).connect(echoLevel).connect(breath);
  const feedback = context.createGain();
  feedback.gain.value = 0.22;
  const echoFilter = context.createBiquadFilter();
  echoFilter.type = "lowpass";
  echoFilter.frequency.value = 900;
  echo.connect(echoFilter).connect(feedback).connect(echo);

  const breathMotion = context.createOscillator();
  breathMotion.frequency.value = 0.038;
  const breathDepth = context.createGain();
  breathDepth.gain.value = 0.13;
  breathMotion.connect(breathDepth).connect(breath.gain);
  const drift = context.createOscillator();
  drift.frequency.value = 0.015;
  const voices = [
    { frequency: 110, volume: 0.14, pan: -0.3 },
    { frequency: 110.055, volume: 0.12, pan: 0.3 },
    { frequency: 164.8138, volume: 0.075, pan: 0 },
    { frequency: 220.07, volume: 0.05, pan: -0.18 },
    { frequency: 440.03, volume: 0.024, pan: 0.2 },
  ].map(({ frequency, volume, pan }, index) => {
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const level = context.createGain();
    level.gain.value = volume;
    const position = context.createStereoPanner();
    position.pan.value = pan;
    oscillator.connect(level).connect(position).connect(pad);
    const detune = context.createGain();
    detune.gain.value = index % 2 ? -3 : 3;
    drift.connect(detune).connect(oscillator.detune);
    oscillator.start();
    return { oscillator, level, position };
  });
  const shimmerMotion = context.createOscillator();
  shimmerMotion.frequency.value = 0.025;
  const shimmerDepth = context.createGain();
  shimmerDepth.gain.value = 0.012;
  shimmerMotion.connect(shimmerDepth).connect(voices[4].level.gain);
  drift.start();
  breathMotion.start();
  shimmerMotion.start();
  return { pad, lowpass, highpass, breath, echo, feedback, drift, breathMotion, shimmerMotion, voices };
}

export class SceneSoundscape {
  constructor(audio, createContext = audioContext, birthdayAudio = null) {
    this.audio = audio;
    this.birthdayAudio = birthdayAudio;
    this.context = createContext();
    this.phase = null;
    this.cues = new Set();
    this.wishCue = null;
    this.pauseMarker = null;
    this.birthdayPauseMarker = null;
    this.envelopes = new Map();
    const context = this.context;
    this.musicGain = context.createGain();
    this.musicGain.gain.value = 0;
    this.musicSource = context.createMediaElementSource(audio);
    this.musicSource.connect(this.musicGain).connect(context.destination);
    audio.volume = 1;
    this.noiseGain = context.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseGain.connect(context.destination);
    this.cueGain = context.createGain();
    this.cueGain.gain.value = 0.5;
    this.cueGain.connect(context.destination);
    this.suspenseGain = context.createGain();
    this.suspenseGain.gain.value = 0;
    this.suspenseGain.connect(context.destination);
    this.birthdayGain = context.createGain();
    this.birthdayGain.gain.value = 0;
    this.birthdayGain.connect(context.destination);
    if (birthdayAudio) {
      this.birthdaySource = context.createMediaElementSource(birthdayAudio);
      this.birthdaySource.connect(this.birthdayGain);
      birthdayAudio.volume = 1;
    }
    this.ambience = createMysteryAmbience(context, this.noiseGain);
    this.unlockBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * 1.5), context.sampleRate);
    this.unlockBuffer.copyToChannel(unlockSamples(context.sampleRate), 0);
  }

  async resume() {
    if (this.context.state !== "running") await this.context.resume();
    if (this.context.state !== "running") throw new Error("The audio context could not resume.");
  }

  suspend() {
    return this.context.suspend();
  }

  ramp(gain, target, duration) {
    const now = this.context.currentTime;
    const previous = this.envelopes.get(gain);
    const progress = previous ? Math.max(0, Math.min(1, (now - previous.start) / previous.duration)) : 0;
    const from = previous ? previous.from + (previous.to - previous.from) * (0.5 - 0.5 * Math.cos(Math.PI * progress)) : gain.value;
    gain.cancelScheduledValues(0);
    gain.setValueAtTime(from, now);
    gain.setValueCurveAtTime(fadeCurve(from, target), now, duration);
    this.envelopes.set(gain, { from, to: target, start: now, duration });
  }

  cancelPauseMarker(key = "pauseMarker") {
    const marker = this[key];
    if (!marker) return;
    marker.onended = null;
    marker.stop();
    marker.disconnect();
    this[key] = null;
  }

  retireMedia(audio, gain, phase, key, duration) {
    if (!audio || this.phase === phase) return;
    if (this.envelopes.get(gain).from <= 0.00001) {
      audio.pause();
      return;
    }
    // Audio-clock markers freeze with the fades when playback or the tab pauses.
    const marker = this.context.createBufferSource();
    marker.buffer = this.context.createBuffer(1, 1, this.context.sampleRate);
    marker.connect(this.context.destination);
    this[key] = marker;
    marker.onended = () => {
      marker.disconnect();
      if (this[key] !== marker) return;
      this[key] = null;
      if (this.phase !== phase) audio.pause();
    };
    marker.start(this.context.currentTime + duration);
  }

  mix(phase) {
    if (!SOUND_PHASES.includes(phase)) throw new TypeError("Unknown soundtrack phase.");
    if (phase === this.phase) return;
    const previous = this.phase;
    this.phase = phase;
    if (phase !== "birthday") this.clearCandleWish();
    this.cancelPauseMarker();
    this.cancelPauseMarker("birthdayPauseMarker");
    const duration = phase === "quiet" ? QUIET_FADE : SOUND_CROSSFADE;
    const birthdayDuration = phase === "birthday" ? BIRTHDAY_FADE : duration;
    const birthdayLevel = this.wishCue ? 0.18 : MUSIC_VOLUME;
    this.ramp(this.noiseGain.gain, phase === "calculator" ? AMBIENCE_VOLUME : 0, duration);
    this.ramp(this.musicGain.gain, phase === "story" ? MUSIC_VOLUME : 0, duration);
    this.ramp(this.birthdayGain.gain, phase === "birthday" ? birthdayLevel : 0, birthdayDuration);
    this.ramp(this.suspenseGain.gain, phase === "suspense" ? 0.4 : 0, phase === "birthday" ? HEARTBEAT_RELEASE : 2);
    if (phase !== "suspense") {
      if (previous === "suspense" && phase === "birthday" && this.heartbeat) {
        this.heartbeat.stop(this.context.currentTime + HEARTBEAT_RELEASE);
      } else this.clearHeartbeat();
    }
    this.retireMedia(this.audio, this.musicGain.gain, "story", "pauseMarker", duration);
    this.retireMedia(this.birthdayAudio, this.birthdayGain.gain, "birthday", "birthdayPauseMarker", birthdayDuration);
  }

  playUnlock() {
    const source = this.context.createBufferSource();
    source.buffer = this.unlockBuffer;
    source.connect(this.cueGain);
    this.cues.add(source);
    source.onended = () => {
      this.cues.delete(source);
      source.disconnect();
    };
    source.start();
  }

  playCandleWish() {
    // AudioContext resume can finish before the gesture's media-prime promises.
    if ((this.phase !== null && this.phase !== "birthday") || this.wishCue) return;
    const context = this.context;
    const cue = { sources: [], nodes: [], ended: 0 };
    this.wishCue = cue;
    this.ramp(this.birthdayGain.gain, 0.18, 0.9);
    for (const [index, note] of CANDLE_CHIME_NOTES.entries()) {
      const start = context.currentTime + note.delay;
      const envelope = context.createGain();
      const panner = context.createStereoPanner();
      panner.pan.value = -0.22 + index * 0.088;
      envelope.gain.setValueAtTime(0, context.currentTime);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.13 - index * 0.008, start + 0.06);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + 1.95);
      envelope.gain.linearRampToValueAtTime(0, start + CANDLE_CHIME_TAIL);
      envelope.connect(panner).connect(this.cueGain);
      cue.nodes.push(envelope, panner);
      for (const harmonic of [1, 2.002]) {
        const voice = context.createOscillator();
        voice.type = "sine";
        voice.frequency.value = note.frequency * harmonic;
        const level = context.createGain();
        level.gain.value = harmonic === 1 ? 1 : 0.24;
        voice.connect(level).connect(envelope);
        cue.nodes.push(level);
        cue.sources.push(voice);
        voice.onended = () => {
          cue.ended += 1;
          if (this.wishCue === cue && cue.ended === CANDLE_CHIME_NOTES.length * 2) this.clearCandleWish();
        };
        voice.start(start);
        voice.stop(start + CANDLE_CHIME_TAIL);
      }
    }
  }

  clearCandleWish() {
    if (!this.wishCue) return;
    const cue = this.wishCue;
    this.wishCue = null;
    for (const source of cue.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    for (const node of cue.nodes) node.disconnect();
    if (this.phase === "birthday") this.ramp(this.birthdayGain.gain, MUSIC_VOLUME, 1.8);
  }

  startHeartbeat(elapsed = 0) {
    if (!Number.isFinite(elapsed) || elapsed < 0) throw new RangeError("Heartbeat offset must be finite and non-negative.");
    if (this.heartbeat || elapsed >= HEARTBEAT_DURATION) return;
    if (!this.heartbeatBuffer) {
      this.heartbeatBuffer = this.context.createBuffer(1, this.context.sampleRate * HEARTBEAT_DURATION, this.context.sampleRate);
      this.heartbeatBuffer.copyToChannel(heartbeatSamples(this.context.sampleRate), 0);
    }
    const source = this.context.createBufferSource();
    source.buffer = this.heartbeatBuffer;
    source.connect(this.suspenseGain);
    this.heartbeat = source;
    source.onended = () => {
      source.disconnect();
      if (this.heartbeat === source) this.heartbeat = null;
    };
    source.start(0, elapsed);
  }

  clearHeartbeat() {
    if (!this.heartbeat) return;
    this.heartbeat.onended = null;
    this.heartbeat.stop();
    this.heartbeat.disconnect();
    this.heartbeat = null;
  }

  clearCues() {
    this.clearCandleWish();
    this.clearHeartbeat();
    for (const source of this.cues) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.cues.clear();
  }

  silence() {
    this.clearCues();
    this.cancelPauseMarker();
    this.cancelPauseMarker("birthdayPauseMarker");
    for (const gain of [this.noiseGain.gain, this.musicGain.gain, this.birthdayGain.gain, this.suspenseGain.gain]) {
      gain.cancelScheduledValues(0);
      gain.setValueAtTime(0, this.context.currentTime);
    }
    this.envelopes.clear();
    this.phase = null;
  }
}
