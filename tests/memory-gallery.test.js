import assert from "node:assert/strict";
import test from "node:test";
import { MEMORY_DUST_COUNT, MEMORY_FADE_DURATION, MemoryGallery } from "../memory-gallery.js";

class FakeAnimation {
  constructor(frames, options) {
    this.frames = frames;
    this.options = options;
    this.playState = "running";
  }
  play() { this.playState = "running"; }
  pause() { this.playState = "paused"; }
  cancel() { this.playState = "idle"; }
  finish() {
    this.playState = "finished";
    this.onfinish?.();
  }
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.animations = [];
  }
  append(...children) {
    for (const child of children) {
      child.remove();
      child.parentElement = this;
      this.children.push(child);
    }
  }
  replaceChildren(...children) {
    for (const child of [...this.children]) child.remove();
    this.append(...children);
  }
  remove() {
    if (!this.parentElement) return;
    const siblings = this.parentElement.children;
    siblings.splice(siblings.indexOf(this), 1);
    this.parentElement = null;
  }
  setAttribute(name, value) { this.attributes.set(name, value); }
  removeAttribute(name) { this.attributes.delete(name); }
  animate(frames, options) {
    const animation = new FakeAnimation(frames, options);
    this.animations.push(animation);
    return animation;
  }
}

function fixture() {
  const images = [];
  const document = {
    hidden: false,
    createElement() { return new FakeElement(this); },
    createElementNS() { return new FakeElement(this); },
    defaultView: {
      Image: class extends FakeElement {
        constructor() {
          super(document);
          this.decodingPromise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
          });
          images.push(this);
        }
        decode() { return this.decodingPromise; }
        removeAttribute(name) {
          super.removeAttribute(name);
          if (name === "src") {
            this.cancelled = true;
            this.reject(new DOMException("Image request cancelled", "AbortError"));
          }
        }
      },
    },
  };
  const container = new FakeElement(document);
  const notices = [];
  const gallery = new MemoryGallery(container, (message) => notices.push(message), () => {});
  const city = {
    id: "montreal",
    english: "Montréal",
    memories: Array.from({ length: 4 }, (_, index) => ({
      image: null, alt: `Photo ${index}`, caption: `Caption ${index}`,
    })),
  };
  return { gallery, city, document, container, images, notices };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function photoGroup(count = 4) {
  return {
    caption: "Together in Montréal",
    alt: "A group of memories",
    photos: Array.from({ length: count }, (_, index) => ({ src: `/group-${index}.jpg`, alt: `Group photograph ${index + 1}` })),
  };
}

test("the frame persists and the outgoing image stays opaque throughout the 2.8-second magical dissolve", () => {
  const { gallery, city, container } = fixture();
  gallery.show(city, 0, false);
  gallery.entrance.finish();
  const first = gallery.current;
  const frame = gallery.frame;
  gallery.show(city, 1, false);
  assert.equal(container.children[0], frame);
  assert.equal(frame.animations.length, 1);
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(first.style.opacity ?? "1", "1");
  assert.equal(first.attributes.get("aria-hidden"), "true");
  assert.equal(first.inert, true);
  assert.equal(gallery.fade.animation.options.duration, MEMORY_FADE_DURATION);
  assert.equal(MEMORY_FADE_DURATION, 2800);
  assert.deepEqual(gallery.fade.animation.frames, [{ opacity: 0 }, { opacity: 1 }]);
  gallery.fade.animation.finish();
  assert.equal(gallery.stack.children.length, 1);
  assert.equal(gallery.current.style.opacity, "1");
  assert.equal(container.dataset.visibleKey, "montreal-1");
});

test("the magical reveal is bounded to 18 motes, a light veil and a gentle focus shift, then fully cleaned up", () => {
  const { gallery, city } = fixture();
  gallery.show(city, 0, false);
  gallery.entrance.finish();
  gallery.show(city, 1, false);
  const { effects, magic } = gallery.fade;
  assert.equal(magic.children.length, MEMORY_DUST_COUNT + 1);
  assert.equal(MEMORY_DUST_COUNT, 18);
  assert.equal(magic.attributes.get("aria-hidden"), "true");
  assert.equal(effects.length, MEMORY_DUST_COUNT + 2);
  assert.match(effects[0].frames[0].filter, /blur\(5px\)/);
  assert.equal(effects[0].frames.at(-1).filter, "blur(0px)");
  for (const effect of effects) {
    assert.ok(effect.options.duration + (effect.options.delay ?? 0) <= MEMORY_FADE_DURATION);
  }
  gallery.setPaused(true);
  assert.ok(effects.every((effect) => effect.playState === "paused"));
  gallery.setPaused(false);
  assert.ok(effects.every((effect) => effect.playState === "running"));
  gallery.fade.animation.finish();
  assert.ok(effects.every((effect) => effect.playState === "idle"));
  assert.equal(magic.parentElement, null);
  assert.equal(gallery.current.children[0].children.length, 1);
});

test("an incoming photograph must decode before replacing the visible memory", async () => {
  const { gallery, city, images, container } = fixture();
  gallery.show(city, 0, false);
  gallery.entrance.finish();
  const first = gallery.current;
  city.memories[1].image = "/photo-1.jpg";
  gallery.show(city, 1, false);
  assert.equal(gallery.waiting, true);
  assert.equal(container.attributes.get("aria-busy"), "true");
  assert.equal(gallery.current, first);
  assert.equal(gallery.stack.children.length, 1);
  assert.equal(images[0].decoding, "async");
  images[0].resolve();
  await flush();
  assert.equal(gallery.waiting, false);
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(container.attributes.get("aria-busy"), "false");
  assert.equal(gallery.current.children[0].children[0], images[0]);
  assert.equal(images[0].alt, "Photo 1");
});

test("a collage waits for every photo to decode and preserves its order even when loads finish out of order", async () => {
  const { gallery, city, images, container } = fixture();
  gallery.show(city, 0, false);
  gallery.entrance.finish();
  const first = gallery.current;
  city.memories[1] = photoGroup();
  gallery.show(city, 1, false);
  assert.equal(images.length, 4);
  images[3].resolve();
  images[1].resolve();
  images[0].resolve();
  await flush();
  assert.equal(gallery.current, first);
  assert.equal(gallery.waiting, true);
  assert.equal(gallery.stack.children.length, 1);
  images[2].resolve();
  await flush();
  assert.equal(gallery.waiting, false);
  assert.equal(container.attributes.get("aria-busy"), "false");
  assert.equal(gallery.stack.children.length, 2);
  const collage = gallery.current.children[0].children[0];
  assert.equal(collage.className, "memory-collage");
  assert.equal(collage.dataset.count, "4");
  assert.equal(collage.attributes.get("role"), "group");
  assert.deepEqual(collage.children.map((cell) => cell.children[0].src), city.memories[1].photos.map((photo) => photo.src));
  assert.ok(images.every((image) => image.decoding === "async"));
  assert.equal(gallery.fade.effects.length, MEMORY_DUST_COUNT + 2);
  assert.equal(collage.animations.length, 1);
});

test("a failed collage photo is labeled in its own cell without losing successfully decoded photographs", async (t) => {
  const { gallery, city, images, notices } = fixture();
  const errors = t.mock.method(console, "error", () => {});
  city.memories[0] = photoGroup(3);
  gallery.show(city, 0, false);
  images[0].resolve();
  images[1].reject(new Error("Broken photo"));
  images[2].resolve();
  await flush();
  assert.equal(gallery.waiting, false);
  assert.equal(notices.length, 1);
  assert.equal(errors.mock.callCount(), 1);
  const cells = gallery.current.children[0].children[0].children;
  assert.equal(cells[0].children[0], images[0]);
  assert.equal(cells[2].children[0], images[2]);
  assert.equal(cells[1].children[0].textContent, "照片加载失败");
  assert.equal(cells[1].attributes.get("aria-label"), "Group photograph 2（加载失败）");
});

test("a six-photo collage keeps all images in one bounded layout and uses only one shared transition effect", async () => {
  const { gallery, city, images } = fixture();
  gallery.show(city, 0, false);
  gallery.entrance.finish();
  city.memories[1] = photoGroup(6);
  gallery.show(city, 1, false);
  assert.equal(images.length, 6);
  for (const image of images) image.resolve();
  await flush();
  const collage = gallery.current.children[0].children[0];
  assert.equal(collage.dataset.count, "6");
  assert.equal(collage.children.length, 6);
  assert.equal(gallery.fade.effects.length, MEMORY_DUST_COUNT + 2);
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(gallery.waiting, false);
  gallery.fade.animation.finish();
  assert.equal(gallery.stack.children.length, 1);
});

test("rapid navigation cancels every pending collage image and stale successes or failures cannot replace the latest page", async () => {
  const { gallery, city, images, notices } = fixture();
  gallery.show(city, 0, false);
  city.memories[1] = photoGroup(5);
  gallery.show(city, 1, false);
  gallery.show(city, 2, false);
  assert.equal(images.length, 5);
  assert.ok(images.every((image) => image.cancelled));
  for (const image of images) image.resolve();
  await flush();
  assert.equal(gallery.current.dataset.memoryKey, "montreal-2");
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(gallery.waiting, false);
  assert.equal(notices.length, 0);
});

test("leaving a city cancels all grouped photo requests without late content or errors reappearing", async () => {
  const { gallery, city, images, notices } = fixture();
  city.memories[0] = photoGroup(5);
  gallery.show(city, 0, false);
  gallery.clear();
  await flush();
  assert.ok(images.every((image) => image.cancelled));
  assert.equal(gallery.current, null);
  assert.equal(gallery.stack.children.length, 0);
  assert.equal(gallery.waiting, false);
  assert.equal(notices.length, 0);
});

test("rapid navigation cancels obsolete image requests and never commits stale photographs", async () => {
  const { gallery, city, images } = fixture();
  gallery.show(city, 0, false);
  city.memories[1].image = "/photo-1.jpg";
  city.memories[2].image = "/photo-2.jpg";
  gallery.show(city, 1, false);
  gallery.show(city, 2, false);
  assert.equal(images[0].cancelled, true);
  images[1].resolve();
  await flush();
  assert.equal(gallery.current.dataset.memoryKey, "montreal-2");
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(gallery.waiting, false);
});

test("rapid changes finish the active dissolve then show only the latest request, with at most two layers", () => {
  const { gallery, city, container } = fixture();
  gallery.show(city, 0, false);
  gallery.show(city, 1, false);
  const active = gallery.fade.animation;
  gallery.show(city, 2, false);
  gallery.show(city, 3, false);
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(gallery.waiting, true);
  assert.equal(gallery.queued.key, "montreal-3");
  active.finish();
  assert.equal(gallery.current.dataset.memoryKey, "montreal-3");
  assert.equal(gallery.stack.children.length, 2);
  assert.equal(gallery.waiting, false);
  gallery.fade.animation.finish();
  assert.equal(gallery.stack.children.length, 1);
  assert.equal(container.dataset.visibleKey, "montreal-3");
});

test("pause freezes automatic fades, manual navigation still works, and hidden tabs always pause", () => {
  const { gallery, city, document } = fixture();
  gallery.show(city, 0, false);
  gallery.entrance.finish();
  gallery.show(city, 1, false);
  gallery.setPaused(true);
  assert.equal(gallery.fade.animation.playState, "paused");
  gallery.show(city, 2, true);
  assert.equal(gallery.fade.animation.playState, "running");
  gallery.fade.animation.finish();
  assert.equal(gallery.current.dataset.memoryKey, "montreal-2");
  assert.equal(gallery.fade.animation.playState, "running");
  document.hidden = true;
  gallery.setPaused(true);
  assert.equal(gallery.fade.animation.playState, "paused");
  document.hidden = false;
  gallery.setPaused(false);
  assert.equal(gallery.fade.animation.playState, "running");
});

test("reduced motion resolves a pending dissolve immediately without losing the latest selection", () => {
  const { gallery, city, container } = fixture();
  gallery.show(city, 0, false);
  gallery.show(city, 1, false);
  gallery.show(city, 2, false);
  gallery.setReducedMotion(true);
  assert.equal(gallery.entrance, null);
  assert.equal(gallery.fade, null);
  assert.equal(gallery.stack.children.length, 1);
  assert.equal(gallery.current.style.opacity, "1");
  assert.equal(container.dataset.visibleKey, "montreal-2");
  gallery.show(city, 3, false);
  assert.equal(gallery.fade, null);
  assert.equal(gallery.stack.children.length, 1);
  assert.equal(container.dataset.visibleKey, "montreal-3");
});

test("leaving or replaying cancels loading and animation, with no late photograph reappearing", async () => {
  const { gallery, city, images, container } = fixture();
  gallery.show(city, 0, false);
  const entrance = gallery.entrance;
  city.memories[1].image = "/photo-1.jpg";
  gallery.show(city, 1, false);
  gallery.clear();
  await flush();
  assert.equal(images[0].cancelled, true);
  assert.equal(entrance.playState, "idle");
  assert.equal(gallery.stack.children.length, 0);
  assert.equal(gallery.frame.hidden, true);
  assert.equal(gallery.waiting, false);
  assert.equal(container.dataset.visibleKey, undefined);
  gallery.show(city, 1, false);
  images[1].resolve();
  await flush();
  assert.equal(gallery.current.dataset.memoryKey, "montreal-1");
  assert.equal(gallery.stack.children.length, 1);
});

test("leaving a city cancels all in-flight stardust, focus and light animations", () => {
  const { gallery, city } = fixture();
  gallery.show(city, 0, false);
  gallery.show(city, 1, false);
  const animations = [gallery.fade.animation, ...gallery.fade.effects];
  gallery.clear();
  assert.ok(animations.every((animation) => animation.playState === "idle"));
  assert.equal(gallery.stack.children.length, 0);
});

test("a broken photo is explicitly reported and transitions into a labeled error card", async (t) => {
  const { gallery, city, images, notices } = fixture();
  const errors = t.mock.method(console, "error", () => {});
  gallery.show(city, 0, false);
  city.memories[1].image = "/missing-photo.jpg";
  gallery.show(city, 1, false);
  images[0].reject(new Error("Invalid image"));
  await flush();
  assert.equal(errors.mock.callCount(), 1);
  assert.equal(notices.length, 1);
  assert.equal(gallery.waiting, false);
  const placeholder = gallery.current.children[0].children[0];
  assert.equal(placeholder.children[0].textContent, "照片加载失败");
  assert.equal(gallery.stack.children.length, 2);
});
