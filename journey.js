import earthImage from "./assets/earth-blue-marble.jpg";
import cloudImage from "./assets/earth-clouds.png";
import { CITIES } from "./memories.js";
import { JourneyPlayer, geoNormal } from "./journey-model.js";
import { containsLocation, detailBlend, detailDimensions, earthPixelRatio, findDetailRegion, regionUvBounds } from "./earth-detail.js";
import { MemoryGallery } from "./memory-gallery.js";

function orientation(THREE, location) {
  const normal = new THREE.Vector3(...geoNormal(location.latitude, location.longitude));
  const longitude = location.longitude * Math.PI / 180;
  const east = new THREE.Vector3(-Math.sin(longitude), 0, -Math.cos(longitude));
  const north = normal.clone().cross(east).normalize();
  const basis = new THREE.Matrix4().makeBasis(east, north, normal).invert();
  return new THREE.Quaternion().setFromRotationMatrix(basis);
}

export class MemoryJourney {
  constructor({ root, host, notify, onNavigate, onComplete }) {
    this.root = root;
    this.host = host;
    this.notify = notify;
    this.player = new JourneyPlayer();
    this.active = false;
    this.ready = false;
    this.renderer = null;
    this.memoryKey = "";
    this.gallery = new MemoryGallery(root.querySelector(".memory-content"), notify, () => this.update(0, true));
    this.lastStatus = "";
    this.dirty = true;
    this.detailVersion = 0;
    this.requestedDetail = "";
    this.activeDetail = null;
    this.pendingDetail = null;
    this.viewports = { width: 0, height: 0 };
    this.route = root.querySelector(".journey-route");
    for (const city of CITIES) {
      const item = document.createElement("li");
      item.textContent = city.name;
      this.route.append(item);
    }
    this.previousButton = document.getElementById("memory-previous");
    this.nextButton = document.getElementById("memory-next");
    this.previousButton.addEventListener("click", () => {
      this.player.previous();
      this.update(0, true);
      onNavigate();
    });
    this.nextButton.addEventListener("click", () => {
      if (!this.player.canNext) {
        onComplete();
        return;
      }
      this.player.next();
      this.update(0, true);
      onNavigate();
    });
    new ResizeObserver(() => this.resize()).observe(host.parentElement);
  }

  prepare() {
    if (!this.preparation) {
      this.preparation = this.createEarth().catch((error) => {
        console.error("The Earth journey could not load its WebGL scene or local textures.", error);
        this.showError("地球画面暂时无法加载，已切换为静态回忆。刷新页面可重试。");
      }).then(() => {
        this.ready = true;
        this.host.dataset.renderState = this.failed ? "fallback" : "ready";
        if (this.active) this.update(0, true);
      });
    }
    return this.preparation;
  }

  showError(message) {
    this.failed = true;
    this.detailVersion += 1;
    this.pendingDetail?.texture.dispose();
    this.activeDetail?.texture.dispose();
    this.pendingDetail = null;
    this.activeDetail = null;
    if (this.detailUniforms) this.detailUniforms.detailMap.value = null;
    this.player.setReducedMotion(true);
    const error = this.root.querySelector(".journey-error");
    error.textContent = message;
    error.hidden = false;
    this.notify(message);
    this.dirty = true;
  }

  async createEarth() {
    this.host.dataset.renderState = "preparing";
    const {
      Vector3, Vector4, Matrix4, Quaternion, TextureLoader, SRGBColorSpace, WebGLRenderer,
      ACESFilmicToneMapping, Scene, PerspectiveCamera, Group, SphereGeometry,
      Mesh, MeshStandardMaterial, ShaderMaterial, BackSide, AdditiveBlending,
      HemisphereLight, DirectionalLight,
    } = await import("three");
    const THREE = {
      Vector3, Vector4, Matrix4, Quaternion, TextureLoader, SRGBColorSpace, WebGLRenderer,
      ACESFilmicToneMapping, Scene, PerspectiveCamera, Group, SphereGeometry,
      Mesh, MeshStandardMaterial, ShaderMaterial, BackSide, AdditiveBlending,
      HemisphereLight, DirectionalLight,
    };
    this.graphics = THREE;
    const loader = new THREE.TextureLoader();
    this.textureLoader = loader;
    const [earth, clouds] = await Promise.all([
      loader.loadAsync(earthImage),
      loader.loadAsync(cloudImage),
    ]);
    earth.colorSpace = THREE.SRGBColorSpace;
    clouds.colorSpace = THREE.SRGBColorSpace;
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    earth.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.setClearColor(0x000000, 0);
    this.host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.showError("地球渲染已中断，照片仍可浏览。刷新页面可重新加载地球。");
    });
    this.world = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 50);
    this.globe = new THREE.Group();
    this.world.add(this.globe);
    const geometry = new THREE.SphereGeometry(1, 96, 64);
    const surface = new THREE.MeshStandardMaterial({ map: earth, roughness: 0.95, metalness: 0 });
    this.detailUniforms = {
      detailMap: { value: earth },
      detailBounds: { value: new THREE.Vector4(0, 0, 1, 1) },
      detailMix: { value: 0 },
    };
    surface.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.detailUniforms);
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_pars_fragment>", `
        #include <map_pars_fragment>
        uniform sampler2D detailMap;
        uniform vec4 detailBounds;
        uniform float detailMix;
      `).replace("#include <map_fragment>", `
        #include <map_fragment>
        #ifdef USE_MAP
          vec2 detailUv = (vMapUv - detailBounds.xy) / (detailBounds.zw - detailBounds.xy);
          vec2 edgeDistance = min(detailUv, 1.0 - detailUv);
          float edgeFade = smoothstep(0.0, 0.07, min(edgeDistance.x, edgeDistance.y));
          vec3 highDetail = texture2D(detailMap, clamp(detailUv, vec2(0.0), vec2(1.0))).rgb;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * highDetail, detailMix * edgeFade);
        #endif
      `);
    };
    this.globe.add(new THREE.Mesh(geometry, surface));
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 64),
      new THREE.MeshStandardMaterial({ map: clouds, transparent: true, opacity: 0.65, depthWrite: false, roughness: 1 }));
    this.globe.add(this.clouds);
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.018, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 positionView = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = -positionView.xyz;
            gl_Position = projectionMatrix * positionView;
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.0);
            gl_FragColor = vec4(0.25, 0.43, 0.65, rim * 0.24);
          }`,
      }));
    this.globe.add(atmosphere);
    this.world.add(new THREE.HemisphereLight(0xc8d7e8, 0x141923, 0.65));
    const sun = new THREE.DirectionalLight(0xfff7e9, 2.5);
    sun.position.set(-3, 4, 8);
    this.world.add(sun);
    this.camera.position.set(0, 0, 12);
    this.camera.lookAt(0, 0, 0);
    this.globe.quaternion.copy(orientation(THREE, this.player.pose.from));
    this.renderer.setSize(2, 2, false);
    this.renderer.initTexture(earth);
    this.renderer.initTexture(clouds);
    await this.renderer.compileAsync(this.world, this.camera);
    this.renderer.render(this.world, this.camera);
    this.requestDetail(CITIES[0]);
    this.resize();
  }

  requestDetail(city) {
    const region = findDetailRegion(city);
    if (!region || this.requestedDetail === region.id) return;
    this.requestedDetail = region.id;
    const version = ++this.detailVersion;
    this.pendingDetail?.texture.dispose();
    this.pendingDetail = null;
    if (this.activeDetail?.region.id === region.id) {
      this.host.dataset.detailState = "ready";
      return;
    }
    this.host.dataset.detailState = "loading";
    this.textureLoader.loadAsync(region.image).then((texture) => {
      if (version !== this.detailVersion || this.failed) {
        texture.dispose();
        return;
      }
      const { width, height } = texture.image;
      if (width !== region.width || height !== region.height) {
        texture.dispose();
        throw new Error(`Unexpected ${region.id} detail image dimensions: ${width}x${height}`);
      }
      const size = detailDimensions(width, height, this.renderer.capabilities.maxTextureSize);
      if (size.width !== width || size.height !== height) {
        const resized = document.createElement("canvas");
        resized.width = size.width;
        resized.height = size.height;
        const context = resized.getContext("2d");
        if (!context) {
          texture.dispose();
          throw new Error("Unable to adapt the regional texture to this device.");
        }
        context.drawImage(texture.image, 0, 0, size.width, size.height);
        texture.image = resized;
      }
      texture.colorSpace = this.graphics.SRGBColorSpace;
      texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      this.pendingDetail?.texture.dispose();
      this.pendingDetail = { region, texture, width: size.width, height: size.height };
      this.host.dataset.detailState = "ready";
      this.dirty = true;
      if (this.active) this.update(0, true);
    }).catch((error) => {
      console.error(`Unable to load high-detail Earth imagery for ${region.id}.`, error);
      if (version === this.detailVersion) {
        this.host.dataset.detailState = "error";
        this.notify("高清地球纹理暂时无法加载，将使用普通清晰度继续。刷新页面可重试。");
      }
    });
  }

  updateDetail(pose) {
    this.requestDetail(CITIES[this.player.targetIndex]);
    const blend = detailBlend(pose.distance);
    if (this.pendingDetail && (this.player.phase !== "pullback" || blend === 0)) {
      const previous = this.activeDetail;
      this.activeDetail = this.pendingDetail;
      this.pendingDetail = null;
      this.detailUniforms.detailMap.value = this.activeDetail.texture;
      this.detailUniforms.detailBounds.value.fromArray(regionUvBounds(this.activeDetail.region));
      previous?.texture.dispose();
      this.host.dataset.detailRegion = this.activeDetail.region.id;
      this.host.dataset.detailSize = `${this.activeDetail.width}x${this.activeDetail.height}`;
      this.dirty = true;
    }
    const amount = this.activeDetail && containsLocation(this.activeDetail.region, pose.to) ? blend : 0;
    if (this.detailUniforms.detailMix.value !== amount) this.dirty = true;
    this.detailUniforms.detailMix.value = amount;
    this.clouds.material.opacity = 0.65 * (1 - amount * 0.88);
    this.host.dataset.detailBlend = amount.toFixed(4);
    this.host.dataset.detailLevel = amount > 0.95 ? "regional-hd" : amount > 0 ? "refining" : "global";
  }

  start(reducedMotion) {
    this.active = true;
    this.root.hidden = false;
    this.root.style.removeProperty("opacity");
    this.host.hidden = false;
    this.memoryKey = "";
    this.gallery.clear();
    this.player.restart(reducedMotion || Boolean(this.failed));
    this.dirty = true;
    this.prepare();
    this.resize();
    this.update(0, true);
  }

  hide() {
    this.active = false;
    this.gallery.clear();
    this.root.hidden = true;
    this.host.hidden = true;
    this.host.removeAttribute("style");
    this.root.removeAttribute("data-phase");
    this.memoryKey = "";
    this.detailVersion += 1;
    this.pendingDetail?.texture.dispose();
    this.pendingDetail = null;
    this.requestedDetail = this.activeDetail?.region.id ?? "";
    this.host.dataset.detailState = this.activeDetail ? "ready" : "idle";
  }

  resize() {
    if (!this.renderer || !this.active) return;
    const bounds = this.host.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.viewports = { width: bounds.width, height: bounds.height };
    const ratio = earthPixelRatio(bounds.width, bounds.height, devicePixelRatio || 1);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.camera.aspect = bounds.width / bounds.height;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    this.update(0, true);
  }

  showMemory(city) {
    const key = `${city.id}-${this.player.memoryIndex}`;
    if (this.memoryKey === key) return;
    this.memoryKey = key;
    this.dirty = true;
    this.gallery.show(city, this.player.memoryIndex, this.player.paused);
  }

  setPaused(paused) {
    this.player.paused = paused;
    this.gallery.setPaused(paused);
  }

  update(milliseconds, force = false) {
    if (!this.active) return;
    if (this.ready && !(this.player.phase === "memory" && this.gallery.waiting)) this.player.advance(milliseconds);
    this.gallery.setReducedMotion(this.player.reducedMotion);
    this.gallery.setPaused(this.player.paused);
    const phase = this.player.phase;
    const displayIndex = this.player.displayIndex;
    const city = CITIES[displayIndex];
    const memory = phase === "memory";
    this.root.dataset.phase = this.ready ? phase : "loading";
    this.root.dataset.city = city.id;
    this.root.dataset.memory = String(this.player.memoryIndex);
    this.root.querySelector(".journey-flight").hidden = memory;
    this.root.querySelector(".memory-layout").hidden = !memory;
    this.root.querySelector(".journey-flight-title").textContent = !this.ready ? "正在准备地球……"
      : phase === "entry" || phase === "orbit" ? "把回忆，放回世界的坐标。" : city.name;
    this.root.querySelector(".journey-flight-detail").textContent = phase === "entry" || phase === "orbit"
      ? "EARTH · A JOURNEY THROUGH OUR MEMORIES" : `${city.english} · ${city.coordinates}`;
    this.root.querySelector(".journey-country").textContent = city.country;
    this.root.querySelector(".journey-city-name").textContent = city.name;
    this.root.querySelector(".journey-city-english").textContent = city.english;
    this.root.querySelector(".journey-coordinates").textContent = city.coordinates;
    this.root.querySelector(".journey-ending").hidden = !(memory && !this.player.canNext);
    if (memory) this.showMemory(city);
    else if (this.memoryKey) {
      this.gallery.clear();
      this.memoryKey = "";
    }
    [...this.route.children].forEach((item, index) => {
      if (index === displayIndex) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
      item.classList.toggle("is-visited", index < displayIndex);
    });
    this.previousButton.disabled = !this.ready || !this.player.canPrevious;
    this.nextButton.disabled = !this.ready;
    document.getElementById("memory-next-label").textContent = memory
      ? !this.player.canNext ? "继续阅读"
        : this.player.memoryIndex + 1 === city.memories.length ? "下一站" : "下一页"
      : "跳过航行";
    document.getElementById("memory-count").textContent = memory
      ? `${String(this.player.memoryIndex + 1).padStart(2, "0")} / ${String(city.memories.length).padStart(2, "0")}`
      : `${String(displayIndex + 1).padStart(2, "0")} / ${String(CITIES.length).padStart(2, "0")}`;
    const status = memory ? `${this.gallery.waiting ? "正在加载" : city.name + "，"}第 ${this.player.memoryIndex + 1} 页，共 ${city.memories.length} 页回忆。`
      : `${this.root.querySelector(".journey-flight-title").textContent} ${phase === "pullback" ? "正在拉远地球。" : ""}`;
    if (status !== this.lastStatus) {
      this.lastStatus = status;
      this.root.querySelector(".journey-status").textContent = status;
    }
    const pose = this.player.pose;
    if (this.detailUniforms && this.ready && !this.failed) this.updateDetail(pose);
    this.root.style.setProperty("--target-opacity", memory ? "0" : String(pose.pin));
    this.host.classList.toggle("is-entering", phase === "entry" || phase === "orbit");
    this.host.style.opacity = String(this.ready ? pose.opacity : 0);
    this.host.classList.toggle("is-memory-background", memory);
    const moving = !this.player.reducedMotion && phase !== "memory";
    if (this.renderer && !this.failed && this.ready && (force || this.dirty || moving)) {
      this.globe.quaternion.copy(orientation(this.graphics, pose.from)).slerp(orientation(this.graphics, pose.to), pose.turn);
      const portraitFit = Math.max(1, 1 / this.camera.aspect);
      this.camera.position.set(0, 0, 1 + (pose.distance - 1) * portraitFit);
      this.camera.lookAt(0, 0, 0);
      this.renderer.render(this.world, this.camera);
      this.dirty = false;
    }
  }
}
