import { memoryPhotos } from "./memory-model.js";

export const MEMORY_FADE_DURATION = 2800;
export const MEMORY_DUST_COUNT = 18;
const FADE_OPTIONS = { duration: MEMORY_FADE_DURATION, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "both" };

export class MemoryGallery {
  constructor(container, notify, onChange) {
    this.container = container;
    this.document = container.ownerDocument;
    this.notify = notify;
    this.onChange = onChange;
    this.version = 0;
    this.requestedKey = null;
    this.cityId = null;
    this.current = null;
    this.pending = null;
    this.queued = null;
    this.fade = null;
    this.entrance = null;
    this.paused = false;
    this.reducedMotion = false;
    this.manualWhilePaused = false;
    this.hidden = this.document.hidden;
    this.frame = this.document.createElement("article");
    this.frame.className = "memory-card";
    this.frame.hidden = true;
    this.stack = this.document.createElement("div");
    this.stack.className = "memory-slides";
    this.frame.append(this.stack);
    container.replaceChildren(this.frame);
  }

  get waiting() {
    return this.pending !== null || this.queued !== null;
  }

  createSlide(city, index) {
    const memory = city.memories[index];
    const slide = this.document.createElement("div");
    slide.className = "memory-slide";
    slide.dataset.memoryKey = `${city.id}-${index}`;
    const visual = this.document.createElement("div");
    visual.className = "memory-visual";
    const placeholder = this.document.createElement("div");
    placeholder.className = "memory-placeholder";
    const label = this.document.createElement("span");
    label.className = "placeholder-badge";
    label.textContent = "照片占位 · 待替换";
    const drawing = this.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    drawing.setAttribute("viewBox", "0 0 160 110");
    drawing.setAttribute("aria-hidden", "true");
    const line = this.document.createElementNS("http://www.w3.org/2000/svg", "path");
    line.setAttribute("d", "M20 85V20h120v65ZM20 68l34-29 31 30 19-16 36 32M112 32a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z");
    drawing.append(line);
    const title = this.document.createElement("span");
    title.className = "placeholder-title";
    title.textContent = `${city.english} · ${String(index + 1).padStart(2, "0")}`;
    const note = this.document.createElement("span");
    note.textContent = "这里将放上你们的照片";
    placeholder.append(label, drawing, title, note);
    const caption = this.document.createElement("p");
    caption.className = "memory-caption";
    caption.textContent = memory.caption;
    const number = this.document.createElement("span");
    number.className = "memory-card-number";
    number.textContent = `MEMORY ${String(index + 1).padStart(2, "0")} / ${String(city.memories.length).padStart(2, "0")}`;
    slide.append(visual, caption, number);
    return { slide, visual, placeholder, label, note };
  }

  show(city, index, paused) {
    const key = `${city.id}-${index}`;
    if (this.requestedKey === key) return;
    if (this.cityId !== city.id) this.clear();
    this.cityId = city.id;
    this.requestedKey = key;
    const version = ++this.version;
    this.cancelPending();
    this.queued = null;
    this.manualWhilePaused = paused && !this.document.hidden;
    const content = this.createSlide(city, index);
    const memory = city.memories[index];
    const ready = () => {
      if (version !== this.version) return;
      this.pending = null;
      this.container.setAttribute("aria-busy", "false");
      this.commit(content.slide, key);
      this.onChange();
    };
    const photos = memoryPhotos(memory);
    if (!photos.length) {
      content.visual.append(content.placeholder);
      ready();
      return;
    }
    const collage = photos.length > 1 ? this.document.createElement("div") : null;
    if (collage) {
      collage.className = "memory-collage";
      collage.dataset.count = String(photos.length);
      collage.setAttribute("role", "group");
      collage.setAttribute("aria-label", memory.alt);
      content.visual.append(collage);
    }
    const request = { images: [], version, cancelled: false };
    this.pending = request;
    this.container.setAttribute("aria-busy", "true");
    const loads = photos.map((photo) => {
      const cell = collage ? this.document.createElement("div") : content.visual;
      if (collage) {
        cell.className = "memory-photo";
        collage.append(cell);
      }
      const image = new this.document.defaultView.Image();
      image.alt = photo.alt;
      image.decoding = "async";
      request.images.push(image);
      image.src = photo.src;
      return image.decode().then(() => {
        if (request.cancelled || version !== this.version) return true;
        cell.append(image);
        return true;
      }, (error) => {
        if (request.cancelled || version !== this.version) return true;
        console.error(`Unable to load memory photograph: ${key}`, error, photo.src);
        if (collage) {
          cell.className = "memory-photo memory-photo-error";
          const message = this.document.createElement("span");
          message.textContent = "照片加载失败";
          cell.append(message);
          cell.setAttribute("role", "img");
          cell.setAttribute("aria-label", `${photo.alt}（加载失败）`);
        } else {
          content.label.textContent = "照片加载失败";
          content.note.textContent = "请检查 memories.js 中的照片路径";
          cell.append(content.placeholder);
        }
        return false;
      });
    });
    Promise.all(loads).then((loaded) => {
      if (request.cancelled || version !== this.version) return;
      if (loaded.some((success) => !success)) {
        this.notify("这页回忆中有照片无法加载，请检查照片文件和路径。");
      }
      ready();
    });
  }

  commit(slide, key) {
    if (this.fade) {
      this.queued = { slide, key };
      this.applyPause();
      return;
    }
    const previous = this.current;
    this.frame.hidden = false;
    this.stack.append(slide);
    this.current = slide;
    if (previous) {
      previous.inert = true;
      previous.setAttribute("aria-hidden", "true");
    }
    if (this.reducedMotion) {
      previous?.remove();
      slide.style.opacity = "1";
      this.container.dataset.visibleKey = key;
      return;
    }
    if (!previous) {
      this.container.dataset.visibleKey = key;
      this.entrance = this.frame.animate([
        { opacity: 0, transform: "translateY(6px) rotate(-1deg)" },
        { opacity: 1, transform: "translateY(0) rotate(-1deg)" },
      ], FADE_OPTIONS);
      this.entrance.onfinish = () => this.finishEntrance();
    } else {
      slide.style.opacity = "0";
      const animation = slide.animate([{ opacity: 0 }, { opacity: 1 }], FADE_OPTIONS);
      const { effects, magic } = this.createMagic(slide, key);
      this.fade = { animation, effects, magic, previous, slide, key };
      animation.onfinish = () => this.finishFade();
    }
    this.applyPause();
  }

  createMagic(slide, key) {
    const visual = slide.children[0];
    const photograph = visual.children[0];
    const direction = Number(key.split("-").at(-1)) % 2 ? 1 : -1;
    const magic = this.document.createElement("div");
    magic.className = "memory-magic";
    magic.setAttribute("aria-hidden", "true");
    const veil = this.document.createElement("div");
    veil.className = "memory-light-veil";
    magic.append(veil);
    visual.append(magic);
    const effects = [
      photograph.animate([
        { transform: `scale(1.035) translateX(${direction * 3}px)`, filter: "blur(5px)" },
        { transform: "scale(1)", filter: "blur(0px)", offset: 0.85 },
        { transform: "scale(1)", filter: "blur(0px)" },
      ], FADE_OPTIONS),
      veil.animate([
        { opacity: 0, transform: `translateX(${-direction * 70}%) rotate(-18deg)` },
        { opacity: 0.42, offset: 0.48 },
        { opacity: 0, transform: `translateX(${direction * 70}%) rotate(-18deg)` },
      ], FADE_OPTIONS),
    ];
    for (let index = 0; index < MEMORY_DUST_COUNT; index += 1) {
      const mote = this.document.createElement("i");
      mote.className = "memory-stardust";
      mote.style.left = `${8 + ((index * 37) % 84)}%`;
      mote.style.top = `${10 + ((index * 23) % 78)}%`;
      const size = index % 6 === 0 ? 4 : 1.5 + (index % 3) * 0.5;
      mote.style.width = `${size}px`;
      mote.style.height = `${size}px`;
      magic.append(mote);
      const drift = direction * (12 + index % 5 * 5);
      effects.push(mote.animate([
        { opacity: 0, transform: "translate(0, 10px) scale(0.4)" },
        { opacity: index % 6 === 0 ? 0.32 : 0.75, offset: 0.4 },
        { opacity: 0, transform: `translate(${drift}px, -${18 + index % 4 * 6}px) scale(0.2)` },
      ], {
        ...FADE_OPTIONS,
        duration: 1500 + index % 4 * 180,
        delay: 200 + index % 7 * 95,
      }));
    }
    return { effects, magic };
  }

  finishEntrance() {
    if (!this.entrance) return;
    const animation = this.entrance;
    this.entrance = null;
    animation.onfinish = null;
    this.frame.style.opacity = "1";
    animation.cancel();
  }

  finishFade() {
    if (!this.fade) return;
    const { animation, effects, magic, previous, slide, key } = this.fade;
    this.fade = null;
    animation.onfinish = null;
    slide.style.opacity = "1";
    previous.remove();
    animation.cancel();
    for (const effect of effects) effect.cancel();
    magic.remove();
    this.container.dataset.visibleKey = key;
    const queued = this.queued;
    this.queued = null;
    if (queued) this.commit(queued.slide, queued.key);
    this.onChange();
  }

  setPaused(paused) {
    const hidden = this.document.hidden;
    if (this.paused === paused && this.hidden === hidden) return;
    this.paused = paused;
    this.hidden = hidden;
    if (!paused) this.manualWhilePaused = false;
    this.applyPause();
  }

  applyPause() {
    const paused = this.document.hidden || (this.paused && !this.manualWhilePaused);
    for (const animation of [this.entrance, this.fade?.animation, ...(this.fade?.effects ?? [])]) {
      if (!animation) continue;
      if (paused) animation.pause();
      else animation.play();
    }
  }

  setReducedMotion(reduced) {
    if (this.reducedMotion === reduced) return;
    this.reducedMotion = reduced;
    if (reduced) {
      this.finishEntrance();
      this.finishFade();
    }
  }

  cancelPending() {
    if (!this.pending) return;
    this.pending.cancelled = true;
    for (const image of this.pending.images) image.removeAttribute("src");
    this.pending = null;
  }

  clear() {
    this.version += 1;
    this.cancelPending();
    this.queued = null;
    for (const animation of [this.entrance, this.fade?.animation, ...(this.fade?.effects ?? [])]) {
      if (!animation) continue;
      animation.onfinish = null;
      animation.cancel();
    }
    this.entrance = null;
    this.fade = null;
    this.stack.replaceChildren();
    this.current = null;
    this.requestedKey = null;
    this.cityId = null;
    this.frame.hidden = true;
    this.container.setAttribute("aria-busy", "false");
    delete this.container.dataset.visibleKey;
  }
}
