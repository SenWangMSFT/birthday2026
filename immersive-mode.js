export class ImmersiveMode {
  constructor({ document, button, sound, notify, onChange }) {
    this.document = document;
    this.root = document.documentElement;
    this.button = button;
    this.sound = sound;
    this.notify = notify;
    this.onChange = onChange;
    this.active = false;
    this.session = null;
    this.lastTouch = null;
    button.addEventListener("click", () => this.enter());
    const changed = () => {
      if (!this.session || this.session.fallback) return;
      if (this.fullscreenElement === this.root) this.session.nativeEntered = true;
      else if (this.session.nativeEntered) this.exit();
    };
    document.addEventListener("fullscreenchange", changed);
    document.addEventListener("webkitfullscreenchange", changed);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && this.session) this.exit();
    });
    document.addEventListener("pointerup", (event) => {
      if (!this.session?.fallback || event.pointerType !== "touch" ||
          event.target.closest("button, a")) return;
      const previous = this.lastTouch;
      this.lastTouch = { time: event.timeStamp, x: event.clientX, y: event.clientY };
      if (previous && event.timeStamp - previous.time < 450 &&
          Math.hypot(event.clientX - previous.x, event.clientY - previous.y) < 40) this.exit();
    });
  }

  get fullscreenElement() {
    return this.document.fullscreenElement ?? this.document.webkitFullscreenElement;
  }

  async leaveNative() {
    if (this.fullscreenElement !== this.root) return;
    const exit = this.document.exitFullscreen ?? this.document.webkitExitFullscreen;
    await exit.call(this.document);
  }

  async enter() {
    if (this.session || this.button.disabled) return;
    const request = this.root.requestFullscreen ?? this.root.webkitRequestFullscreen;
    const session = {
      fallback: !request,
      nativeEntered: false,
      soundEnabled: this.sound.enabled,
      soundPaused: this.sound.paused,
    };
    this.session = session;
    this.button.disabled = true;
    try {
      // Start both privileged operations in the original button gesture.
      this.sound.paused = false;
      const completed = this.sound.phase === "birthday" && this.sound.birthdayFinished;
      const playback = this.sound.setEnabled(!completed);
      let fullscreen;
      try {
        fullscreen = request ? Promise.resolve(request.call(this.root)).then(async () => {
          if (this.session !== session && !this.session) await this.leaveNative();
        }) : Promise.resolve();
      } catch (error) {
        fullscreen = Promise.reject(error);
      }
      this.active = true;
      this.document.body.dataset.immersive = "true";
      this.button.setAttribute("aria-pressed", "true");
      this.onChange(true);
      await Promise.all([playback, fullscreen]);
      if (this.session !== session) {
        if (!this.session) await this.leaveNative();
        return;
      }
      if (!session.fallback && this.fullscreenElement !== this.root) {
        throw new Error("The browser did not enter fullscreen.");
      }
      session.nativeEntered = !session.fallback;
      const musicFinished = this.sound.phase === "birthday" && this.sound.birthdayFinished;
      const musicStatus = musicFinished ? "音乐已播放完毕" : "音乐已开启";
      this.notify(session.fallback
        ? `浏览器不支持原生全屏，已开启沉浸显示，${musicStatus}。Esc 或双击屏幕可退出。`
        : `沉浸全屏 · ${musicStatus} · 按 Esc 或使用系统手势退出。`);
    } catch (error) {
      console.error("Unable to enter immersive fullscreen with music.", error);
      if (this.session === session) {
        await this.exit();
        this.notify("无法开启带音乐的全屏播放，请检查浏览器全屏权限和声音设置后重试。");
      } else if (!this.session) {
        try {
          await this.leaveNative();
        } catch (exitError) {
          console.error("Unable to exit a cancelled fullscreen request.", exitError);
          this.notify("请按 Esc 或使用浏览器退出手势离开全屏。");
        }
      }
    } finally {
      this.button.disabled = false;
    }
  }

  async exit({ restoreMusic = true } = {}) {
    const session = this.session;
    if (!session) return;
    this.session = null;
    this.active = false;
    this.lastTouch = null;
    delete this.document.body.dataset.immersive;
    this.button.setAttribute("aria-pressed", "false");
    this.sound.paused = session.soundPaused;
    const playback = this.sound.setEnabled(restoreMusic && session.soundEnabled);
    this.onChange(false);
    this.button.focus({ preventScroll: true });
    try {
      await Promise.all([this.leaveNative(), playback]);
    } catch (error) {
      console.error("Unable to restore the browser or music after fullscreen.", error);
      this.notify("控件已恢复。如未退出全屏，请使用浏览器退出手势；音乐可通过声音按钮重试。");
    }
  }
}
