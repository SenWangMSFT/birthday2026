import { SOUND_PHASES, SceneSoundscape } from "./scene-soundscape.js";

export const SUNSHINE_URL = new URL("./music/Sunshine - Nikita Kondrashev (320k).mp3", import.meta.url).href;
export const BIRTHDAY_MUSIC_URL = new URL("./music/Happy Birthday Piano Instrumental Happy Birthday Melody No Copyright Music SoulProdMusic - SoulProdMusic (320k).mp3", import.meta.url).href;

export class BackgroundMusic {
  enabled = false;
  paused = false;
  request = 0;
  pendingPlays = 0;
  soundscape = null;
  mediaUnlocked = false;
  cueRequest = 0;
  birthdayUnlocked = false;
  suspenseElapsed = 0;
  birthdayFinishArmed = false;
  birthdayFinished = false;

  constructor(audio, onError, phase = "story", birthdayAudio = null, onStateChange = () => {}) {
    if (!SOUND_PHASES.includes(phase)) throw new TypeError("Unknown soundtrack phase.");
    this.phase = phase;
    this.audio = audio;
    this.onError = onError;
    this.onStateChange = onStateChange;
    this.birthdayAudio = birthdayAudio;
    if (birthdayAudio) {
      birthdayAudio.preload = "none";
      birthdayAudio.loop = true;
      birthdayAudio.volume = 0.35;
      birthdayAudio.src = BIRTHDAY_MUSIC_URL;
      birthdayAudio.addEventListener("ended", () => {
        if (this.phase !== "birthday" || !this.birthdayFinishArmed || this.birthdayFinished) return;
        this.birthdayFinished = true;
        this.stop();
        this.onStateChange();
      });
      birthdayAudio.addEventListener("error", () => {
        if (!this.enabled || this.pendingPlays > 0) return;
        const error = new Error(birthdayAudio.error?.message || "The birthday piano could not play.");
        this.stop();
        this.onError(error);
      });
    }
    audio.preload = "none";
    audio.loop = true;
    audio.volume = 0.35;
    audio.src = SUNSHINE_URL;
    audio.addEventListener("error", () => {
      // Initial loading failures are reported through the play() promise.
      if (!this.enabled || this.pendingPlays > 0) return;
      const error = new Error(audio.error?.message || `Sunshine playback failed (media error ${audio.error?.code ?? "unknown"}).`);
      this.stop();
      this.onError(error);
    });
  }

  stop() {
    this.enabled = false;
    this.request += 1;
    this.cueRequest += 1;
    this.audio.pause();
    this.birthdayAudio?.pause();
    if (this.soundscape) {
      this.soundscape.silence();
      this.soundscape.suspend().catch(this.onError);
    }
  }

  async toggle() {
    await this.setEnabled(!this.enabled);
  }

  async setEnabled(enabled) {
    this.enabled = enabled && !(this.phase === "birthday" && this.birthdayFinished);
    if (!enabled) this.cueRequest += 1;
    if (this.enabled) {
      this.audio.preload = "auto";
      if (this.birthdayAudio) this.birthdayAudio.preload = "auto";
    }
    if (this.enabled && this.audio.error) this.audio.load();
    if (this.enabled && this.birthdayAudio?.error) this.birthdayAudio.load();
    await this.syncPlayback();
  }

  setPaused(paused) {
    this.paused = paused;
    if (paused) this.cueRequest += 1;
    return this.syncPlayback();
  }

  setPhase(phase) {
    if (!SOUND_PHASES.includes(phase)) throw new TypeError("Unknown soundtrack phase.");
    if (phase === "calculator") {
      const completed = this.birthdayFinished;
      this.birthdayFinishArmed = false;
      this.birthdayFinished = false;
      if (this.birthdayAudio) {
        this.birthdayAudio.loop = true;
        if (completed) this.birthdayAudio.currentTime = 0;
      }
    }
    if (this.phase === phase) return Promise.resolve();
    this.phase = phase;
    return this.syncPlayback();
  }

  finishBirthdayAtEnd() {
    if (!this.birthdayAudio) throw new Error("The birthday soundtrack has not been configured.");
    this.birthdayFinishArmed = true;
    this.birthdayAudio.loop = false;
    if (this.birthdayAudio.ended && this.birthdayAudio.currentTime > 0 && this.phase === "birthday" && !this.birthdayFinished) {
      this.birthdayFinished = true;
      this.stop();
      this.onStateChange();
    }
  }

  async playUnlock() {
    if (!this.enabled || this.paused || this.phase !== "calculator") return;
    const request = this.cueRequest;
    try {
      this.soundscape ??= new SceneSoundscape(this.audio, undefined, this.birthdayAudio);
      await this.soundscape.resume();
      if (request === this.cueRequest && this.enabled && !this.paused) this.soundscape.playUnlock();
      else if (!this.enabled || this.paused) await this.soundscape.suspend();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async playCandleWish() {
    if (!this.enabled || this.paused || this.phase !== "birthday") return;
    const request = this.cueRequest;
    try {
      this.soundscape ??= new SceneSoundscape(this.audio, undefined, this.birthdayAudio);
      await this.soundscape.resume();
      if (request === this.cueRequest && this.enabled && !this.paused && this.phase === "birthday") {
        this.soundscape.playCandleWish();
      } else if (!this.enabled || this.paused) await this.soundscape.suspend();
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async syncPlayback() {
    const request = ++this.request;
    if (!this.enabled || this.paused || (this.phase === "birthday" && this.birthdayFinished)) {
      this.audio.pause();
      this.birthdayAudio?.pause();
      if (this.soundscape) {
        if (!this.enabled) this.soundscape.clearCues();
        try {
          await this.soundscape.suspend();
        } catch (error) {
          this.soundscape.silence();
          this.enabled = false;
          this.cueRequest += 1;
          throw error;
        }
      }
      return;
    }
    this.pendingPlays += 1;
    try {
      if (this.phase !== "story" || this.birthdayAudio) {
        this.soundscape ??= new SceneSoundscape(this.audio, undefined, this.birthdayAudio);
      }
      if (this.phase === "birthday" && !this.birthdayAudio) throw new Error("The birthday soundtrack has not been configured.");
      const resume = this.soundscape?.resume() ?? Promise.resolve();
      // Prime the unmuted media element behind a zero Web Audio gain in the original gesture.
      const playback = this.phase === "story" || !this.mediaUnlocked || this.soundscape?.pauseMarker
        ? this.audio.play().then(() => { this.mediaUnlocked = true; }) : Promise.resolve();
      const birthday = this.birthdayAudio && (this.phase === "birthday" || !this.birthdayUnlocked || this.soundscape?.birthdayPauseMarker)
        ? this.birthdayAudio.play().then(() => {
          this.birthdayUnlocked = true;
          if (this.phase !== "birthday" && !this.soundscape?.birthdayPauseMarker) this.birthdayAudio.pause();
        }) : Promise.resolve();
      await Promise.all([resume, playback, birthday]);
      if (request !== this.request) {
        if (!this.enabled || this.paused) {
          this.audio.pause();
          this.birthdayAudio?.pause();
          if (this.soundscape) await this.soundscape.suspend();
        }
        return;
      }
      this.soundscape?.mix(this.phase);
      if (this.phase !== "story" && !this.soundscape?.pauseMarker) this.audio.pause();
      if (this.phase !== "birthday" && !this.soundscape?.birthdayPauseMarker) this.birthdayAudio?.pause();
      if (this.phase === "suspense") this.soundscape.startHeartbeat(this.suspenseElapsed / 1000);
    } catch (error) {
      if (request !== this.request && error.name === "AbortError") return;
      this.stop();
      throw error;
    } finally {
      this.pendingPlays -= 1;
    }
  }
}
