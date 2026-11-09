# 一场为你而来的奇遇

A Chinese birthday gift for 陈君, inspired by the supplied reference screenshots. The artwork is generated locally rather than displaying the screenshots or their phone/social-app overlays.

## Run

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Open the address printed by Vite. To view on an iPad, connect it to the same Wi-Fi network and open the printed **Network** address.

```sh
npm test
npm run build
npm run preview
```

Deploy the generated `dist/` folder to any static host. Asset paths are relative, so subdirectory hosting is supported.

## GitHub Pages

Production URL: **https://senwangmsft.github.io/birthday2026/**

The public source repository is [SenWangMSFT/birthday2026](https://github.com/SenWangMSFT/birthday2026). The website, its optimized personal photos, soundtrack and client-side calculator logic are publicly accessible; this is not password-protected hosting. Railway is not required for this static app.

The [Pages workflow](./.github/workflows/pages.yml) runs `npm ci`, the tests, and `npm run build` on Node 24, then deploys **only `dist/`** using the official GitHub Pages artifact/deploy actions. Each push to `main` updates the site, and the workflow can also be started manually in GitHub Actions. Repository Settings → Pages must use **GitHub Actions** as its source. No deployment key, music service, server or custom domain is needed. The relative Vite base keeps photos, audio and lazy-loaded Earth code working under `/birthday2026/`.

Performance is kept in the client: 1280-pixel optimized JPEG collages, decode-before-display transitions, prewarmed Earth rendering, lightweight 2D lettering, locally generated sound effects and bounded animation pools. Production assets have content-hashed filenames for browser/CDN caching. Sound stays off until a gesture or fullscreen entry; that enabling gesture allows both music tracks to buffer ahead without resetting their positions, while Web Audio keeps future tracks inaudible until their scenes. The existing smooth audio fades, tab pause/resume and natural final-song stop remain intact. Buffering is a browser hint, not an offline guarantee; open the site on a reliable connection before presenting it on an iPad.

The original camera-upload folders (`assets/montreal/`, `assets/toronto/`, `assets/ottawa/`, `assets/nanjing/`), dependencies, local environment files and build output are excluded from Git. Keep the four optimized `assets/*-web/` folders and the two local MP3s in the repository: the build and photo-coverage tests use them.

## Calculator magic opening

The site now starts with a working calculator beneath a heart lock: “这份心意，只为你开启。” / “从一个小小的巧合开始。” The original birthday introduction does not run behind it. There is no on-screen hint, badge, sound or visual change indicating the secret mode.

**For the magician:**

1. Let the spectator test normal calculations. Addition, subtraction, multiplication, division, decimals, sign, percent, backspace, repeated equals and AC work normally; basic operations use decimal arithmetic rather than evaluating code.
2. Tap **AC three times consecutively**. Any other calculator key breaks the AC streak. This secretly arms the trick and clears the display. AC still clears during setup, before the forced second number appears.
3. Enter the first number and **+**. Have the spectator tap the second number with the tablet facing down. The first second-operand tap supplies `Eastern date number − first number`, irrespective of the tapped digit. Once that number appears, **only = works**: all other digits, operators, AC, percent, sign, decimal and backspace are ignored without any visible mode indicator. The same guard covers mouse, touch and keyboard input.
4. Press **=**. At that exact moment the app captures **24-hour Eastern time**, using `America/New_York` with daylight-saving adjustments, in **MMDDHHmm** format. November 10 at 23:20 is `11102320`; 22:00 is `11102200`. All eight digits are retained, including a leading zero for January–September. If the minute or date changes during input, the final second operand is reconciled to the time at equals.
5. The answer holds, lifts out of the calculator, separates into month/day/hour/minute with a Chinese Eastern-time label, then becomes a key. The key travels to the lock, turns, and opens it before the existing introduction begins.

The reveal takes 14.2 seconds and uses the shared playback clock. Inactive tabs freeze it. Reduced motion uses a shorter, readable eight-second sequence without flying or rotating elements. The calculator accepts mouse, touch and keyboard input (`C`/Delete for AC, Backspace to delete, Enter for equals). In fullscreen its keys remain usable while playback controls stay hidden. The calculator and reveal use a smooth, mysterious cinematic pad without any continuous noise or hiss; a restrained lock click and light metallic chime sound once as the shackle starts opening (10.5 seconds into the full reveal, proportionally earlier for reduced motion). Sunshine starts only when the lock sequence finishes and the birthday introduction begins. The birthday invitation still waits for “开启生日模式”.

Reloading or replaying the complete experience returns to the lock with the calculator **back in normal mode**. Arithmetic errors are explicitly displayed and recover on AC or a new number. Clock conversion is local and needs no network service; the device's system date/time must be correct (automatic date/time is recommended). Changing the device's timezone does not change the Eastern result.

## First scene

- A deliberately paced, 19.8-second opening leads to the personalized birthday reveal: 5.4 seconds for each of the first three messages, then a 3.6-second confirmation. Words slowly condense from a soft blur, hold, dissolve, and leave a brief dark pause before the next message. The final reveal emerges from mist over 2.4 seconds. All text transitions share the playback clock, so pause freezes them accurately.
- The top-right controls pause/resume, skip, and replay the opening.
- The top-right fullscreen icon starts immersive playback with phase-appropriate sound enabled: a smooth cinematic ambience before the lock opens, Sunshine through the memories and reading pages, then the heartbeat and birthday piano in the finale. Calculator keys, “开启生日模式” and the final “该拆礼物啦” button stay usable when appropriate; all playback controls are hidden. The birthday story waits for the invitation click rather than starting automatically. Escape or the browser's native exit gesture restores controls and the previous sound/pause settings without rewinding. Tabs still pause when inactive. Browsers without native element fullscreen use an explicitly labeled viewport-only immersive mode; Escape or a double-tap exits that fallback on an iPad without a keyboard. Fullscreen or audio failures restore the controls and report an error.
- The screen starts dark; stars and a centered ring of ivory pieces light up gradually. The opening message is centered inside that ring.
- “开启生日模式” begins a 29.2-second sequence: a dark pause, fragments gathering into “生日快乐”, a complete 32× push through the lettering, camera travel toward the scene's existing brightest star, an accelerating 1800× star dive, then an enveloping glow before Earth appears. The target star uses exactly the same soft, neutral-white point-light profile as the other stars, without cross-shaped rays, an orange halo, or a hard-edged disc. It is already present before clicking and brightens only subtly until the camera approaches; it is not replaced by a newly spawned central light.
- The opening ring and birthday typography use the **same 48 persistent, flat SVG pieces**. Clicking the birthday button captures their visible poses without replacing them. Each piece has just one clipped ivory face and uses only 2D translation, rotation, scale and opacity. The former depth slices, bevels, perspective and animated material layers are removed to keep the assembly lightweight on laptops and iPads.
- Every piece is clipped from the same centered Songti-style lettering. At lock, that identical uncut vector source removes clipping seams. The native 32× zoom stays centered and sharp without rasterizing the text; pause and replay share the scene clock. Reduced motion shows the static 2D greeting, with dark lettering for contrast on the bright background. The Earth renderer and perspective star flight remain unchanged.
- The 32× lettering zoom changes the SVG `viewBox`, not a CSS-scaled bitmap or cached text layer. Glyphs and clipping paths remain resolution-independent, including on Retina iPads. No raster image of the phrase or external font download is used.
- The word zoom stays fixed on the exact middle of the phrase. Only after passing through it does the camera travel toward the existing star; that star moves monotonically toward the center without drifting away first.
- The star flight adds 960 depth-distributed particles to the distant sky. Real perspective projection makes nearer stars grow and pass the camera faster, with restrained motion streaks capped at 48 CSS pixels. The camera accelerates into the guide star; particles fade at the near plane and respawn in the distance without visible popping. The fixed pool shares the scene clock and fades out before Earth, keeping pause/replay and reduced motion consistent without extra libraries.
- The Earth handoff preserves the final star glow and crossfades it out over seven seconds while Earth fades in on the same frame clock. Earth shaders, textures, and an initial GPU render are prepared during the birthday sequence. There is no independent CSS opacity transition chasing the entry animation, nor an instant reset of the background stars.
- Pause/resume controls the entire gift, including lighting, Earth travel, and memory reading time. “重看序幕” resets the complete journey.
- Tap the background, or use the footer's keyboard-accessible hint, to discover hidden wishes.
- Moving the mouse leaves a fuller comet over both the star field and Earth. Its head follows the cursor with a frame-rate-independent 90 ms lag, drawing a fluid curved tail up to 480 CSS pixels long. Tail samples linger for 1.6 seconds as the head settles. Geometry is bounded to 160 points; the overlay never captures clicks. Touch input and reduced-motion mode do not create trails. Pause freezes the effect; resizing and replay clear it.
- Occasional background comets are deliberately sparse: only one can exist at a time, with a 9–17 second gap after it finishes. They do not spawn during the birthday assembly, star dive or Earth flight, and reduced-motion mode removes them.
- Sound is off by default outside fullscreen. The sound button enables the current scene's soundtrack: a locally generated, smooth cinematic pad of five quiet sine voices, unresolved low harmonics, slow swells, subtle pitch drift and a distant glassy resonance during the calculator and reveal (no continuous noise buffers, hiss or granular texture); the supplied [Sunshine MP3](./music/Sunshine%20-%20Nikita%20Kondrashev%20(320k).mp3) during the birthday introduction, stars, Earth and memories. The change at the unlocked handoff uses a four-second, cosine-eased crossfade with gentle endpoints. The media element is primed behind a zero Web Audio gain during the enabling gesture for iPad compatibility; Sunshine is never audible during the calculator. Its position is preserved on pause, mute and replay, and replay fades back to ambience. The unlock cue uses a short synthesized latch click and soft chime, with no external sound download. Muting cancels any active cue; scene/tab pause suspends the audio clock and freezes cues and fades. All audio stays local. Playback errors reset the control and show a visible retry message.
- Reduced-motion preferences show a static birthday greeting for 2.6 seconds, then the memories with a stationary Earth. Camera flights are omitted, but memory autoplay and navigation remain available. Hidden tabs automatically pause. The greeting also remains readable without JavaScript.
- The full-screen layout accommodates laptops and portrait/landscape iPads, including safe-area insets.

## Personalize

Change the name, page title, and description in [index.html](./index.html). Edit the messages, wishes, and stage durations in [scene.js](./scene.js). Adjust colors and responsive layout in [styles.css](./styles.css).

## Earth and city memories

The final star glow flows into a perspective-rendered Earth with real satellite imagery, a separate cloud layer, natural sunlight, and a restrained atmospheric rim. The same Earth remains visible throughout Montréal, Toronto, Ottawa and Nanjing's memories, zoomed toward each city's geographic location. There are no separate city maps, skyline backgrounds, external map services, keys or tile requests.

Between cities, the camera smoothly zooms out from the departing location over 4.8 seconds, turns in orbit for 3.6 seconds, then zooms toward the next destination over 6.2 seconds. During zoom-out, the city name, coordinates, route highlight and announcement stay with the departing city; the next destination is introduced only after zoom-out completes. This also applies when revisiting a previous city. Camera distance and orientation remain continuous at the flight boundaries. Local high-resolution regional textures refine the globe during approach, rather than switching to a flat map. The Earth gently dims behind the memories and brightens during pullback without an abrupt brightness change.

Each city has **five collage slides**, with all **80 supplied photos used exactly once**:

| City | Photos | Photos per slide |
|---|---:|---|
| Montréal | 23 | 5 / 4 / 5 / 4 / 5 |
| Toronto | 20 | 4 / 4 / 4 / 4 / 4 |
| Ottawa | 11 | 3 / 2 / 2 / 2 / 2 |
| Nanjing | 26 | 5 / 6 / 5 / 5 / 5 |

Photos are grouped by their visible subjects—city sights, shared meals, outings, portraits and everyday moments. Five-photo layouts feature a portrait tile; Nanjing's six-photo food slide uses a balanced 3×2 grid. Each slide stays on screen for nine seconds. Previous/Next controls and counters refer to slides rather than individual photos. After Nanjing's final memory, the journey continues into the personal ending; “继续阅读” can also begin that transition.

Memory images and captions dissolve over 2.8 seconds inside a stable photo frame. A gentle focus shift, translucent champagne-blue light sweep and 18 small drifting stardust motes make each change feel magical without a bright flash or a spinning card. Sweep direction alternates between memories. The outgoing slide stays fully visible underneath until the incoming image has loaded and decoded. Autoplay waits while a photo loads; rapid navigation keeps only the latest requested photo and at most two displayed layers. Every effect freezes with scene pause, is removed when complete or leaving a city, and is omitted entirely for reduced motion. An explicit Previous/Next action still transitions when autoplay is paused.

Edit [memories.js](./memories.js) to replace each city's `memories` array. Put actual photos in `assets/memories/`, then reference each file with a static URL so Vite bundles it:

```js
memories: [
  {
    image: new URL("./assets/memories/montreal-01.jpg", import.meta.url).href,
    alt: "A meaningful description of this photograph",
    caption: "Your own memory caption",
  },
],
```

For a collage, replace `image` with a `photos` array of one to six `{ src, alt }` objects and keep the slide-level `alt` and `caption`. The two formats are mutually exclusive:

```js
{
  alt: "A descriptive label for this group of memories",
  caption: "A caption for this slide",
  photos: [
    { src: new URL("./assets/memories/photo-01.jpg", import.meta.url).href, alt: "Description of the first photo" },
    { src: new URL("./assets/memories/photo-02.jpg", import.meta.url).href, alt: "Description of the second photo" },
  ],
}
```

Keep `image: null` for a labeled placeholder. Portrait and landscape photographs use `object-fit: contain`, so faces and full compositions are not cropped. Every incoming photo must decode (or show an explicit error in its own cell) before the outgoing slide is removed. Cancelled navigation cancels all requests for that group, and a collage uses one shared reveal effect rather than multiplying the animation for each photo. Broken photo paths and unavailable WebGL produce visible errors; memories remain navigable without the globe.

The photo sets were converted locally from the supplied HEIC, DNG, PNG and JPEG files without editing the originals. Only the orientation-corrected, metadata-free progressive JPEG copies in [assets/montreal-web/](./assets/montreal-web/), [assets/toronto-web/](./assets/toronto-web/), [assets/ottawa-web/](./assets/ottawa-web/) and [assets/nanjing-web/](./assets/nanjing-web/) are imported; the app does not depend on the originals remaining in their upload folders. Copies are limited to a 1280-pixel long edge (enough for the Retina collage cells) and total about **14.7 MB for all 80 photos**, avoiding large RAW/HEIC downloads, retaining the supplied color profiles and bounding decoded-image costs on iPads. No photo is uploaded to an external conversion service.

## Personal ending and cake

The new references are [IMG_0528.PNG](./assets/IMG_0528.PNG), [IMG_0530.PNG](./assets/IMG_0530.PNG), [IMG_0531.PNG](./assets/IMG_0531.PNG), [IMG_0532.PNG](./assets/IMG_0532.PNG) and [IMG_0533.PNG](./assets/IMG_0533.PNG). They inform the warm ivory palette, generous serif headings, fine dividers, numbered list, letter and floral cake. The references themselves and their video/social overlays are not displayed. The two reading pages now use personalized Chinese birthday wording drawn from the supplied photos: playful selfies, shared meals and drinks, sports, snow, autumn walks, mirror portraits and holding hands while travelling. The letter connects all four city photo sets without inventing relationship dates or milestones; the original friendship and farewell wording is removed.

- Nanjing crossfades into ivory over six seconds, on one shared progress curve for Earth, city content and the paper background. There is no abrupt background-image swap.
- The three reading chapters are consecutive **04 / 05 / 06**, with local navigation **01 / 03 → 02 / 03 → 03 / 03**. “我喜欢的那些 / 关于你的小事” lasts **13 seconds**, “写给 陈君” **19 seconds**, and “最后，还有一件事。” **4 seconds**—half the previous durations, including their fades. Previous/Next reading controls remain available outside fullscreen.
- The last page contains **no cake or wish button**. Sunshine fades gently away over 2.6 seconds during that four-second prelude; even manual navigation leaves enough time to finish the fade. The close-eyes instruction appears only when the countdown starts.
- The eyes-closed phase lasts **exactly 30 seconds of active playback**, including in reduced-motion mode. The locally synthesized double-heartbeat is slower and more spacious (approximately 40–45 main beats per minute), with soft suspense harmonics, a slow swell, a 1.5-second arrival and a 3.5-second release. The cake and birthday track cannot appear early, and an already-started countdown cannot be skipped. Muting respects the remaining countdown position when sound is enabled again.
- At the 30-second boundary, an original lightweight SVG cream-and-burgundy floral cake fades in with the supplied [birthday piano MP3](./music/Happy%20Birthday%20Piano%20Instrumental%20Happy%20Birthday%20Melody%20No%20Copyright%20Music%20SoulProdMusic%20-%20SoulProdMusic%20(320k).mp3). Piano fades up over 3.6 seconds instead of starting abruptly; any remaining heartbeat tail releases gently. Both MP3s are primed silently in the original sound/fullscreen gesture for iPad autoplay compatibility. Outgoing media keeps playing until its fade actually reaches silence, including when replaying from the cake; audio-clock markers pause with the scene and cannot stop a newer incoming track. No wish/blow-out button is added.

The final cake scene has **no visible interaction instructions or “open your eyes” prompt**; keyboard/screen-reader hints remain available without appearing on screen. Tap anywhere outside the controls (or press Enter/Space while the scene is focused) to send the candle glow into the sky. The one-shot, 7.2-second flight starts at the actual SVG flame position, leaves a restrained fading trail, cools to neutral white and settles as a small permanent star. While it flies, the cake, eyebrow and blessing gradually disappear and the existing “生日快乐，陈君。” heading moves smoothly to the exact center of the scene. The gift button remains below the heading. The star shares the existing night sky's soft light profile and color, without cross-shaped rays or a hard disc. The lightweight SVG stays sharp on Retina iPads; resizing recomputes heading/gift offsets without cumulative drift. Reduced motion fades out the cake and candle over 2.4 seconds, then centers the heading without spatial animation.

The flight plays a locally synthesized rising glassy chime, with six gently spaced notes and a soft tail. Birthday piano ducks gently underneath, then returns smoothly. Sound remains opt-in outside fullscreen; muting or replay cancels every scheduled voice. Repeated taps cannot relaunch the candle or stack sounds. Once the star settles, **“该拆礼物啦”** appears—even in fullscreen—and reveals **“礼物，等你亲手打开。现在，去拆为你准备的礼物吧。”** for the real gifts. All wording in this final interaction is Chinese; no external gift link or new wish/blow-out button is added.

The piano may loop while waiting at the cake. The first candle activation disables its loop **without pausing, seeking or restarting**, so the current pass continues to its natural end. Its native `ended` event then silences every audio layer, cancels remaining chime voices and suspends the audio context. The sound control reflects the finished state; tab visibility, pause/resume and entering or leaving fullscreen cannot restart the completed track. Replaying the whole experience resets that completion guard and restores normal soundtrack behavior; a completed piano track is rewound only for that explicit new round.

Scene pause and inactive tabs freeze reading, the countdown, heartbeat audio, candle flight, star twinkle and chime. Escape restores the normal controls from fullscreen. Replay resets the entire experience to the normal-mode calculator and stops suspense/birthday playback. The sound toggle remains opt-in outside fullscreen and controls all tracks. Edit the ending text in [index.html](./index.html), durations in [finale-model.js](./finale-model.js), and heartbeat synthesis in [scene-soundscape.js](./scene-soundscape.js).

The Earth becomes genuinely more detailed during approach: a 2048 × 1024 overview blends into geographically aligned 4096 × 3072 Canadian or 3072 × 3072 Chinese imagery. These contain roughly 11–17 times more source pixels per degree than the overview, not an upscaled copy. Clouds recede near the ground, and the memory backdrop is dimmed without artificial blur.

Regional images preload before arrival. Only one regional texture is bound on the GPU at a time; the previous one is disposed when switching regions. Textures adapt to device limits, and rendering supports up to 2× pixel density with a bounded drawing buffer for iPads. Regional-load failures are explicitly reported while the ordinary-resolution globe and memories remain usable.

The global overview and regional Earth textures are served locally and come from NASA GIBS `BlueMarble_NextGeneration`, WMS 1.1.1 / EPSG:4326. Canadian bounds are `-108,27,-44,63`; Chinese bounds are `92,16,144,48`. See the [NASA GIBS API documentation](https://nasa-gibs.github.io/gibs-api-docs/), [NASA's Blue Marble description](https://science.nasa.gov/resource/blue-marble/), and [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/). The cloud texture comes from the [Three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets). Earth textures, personal memory photos and music remain local.

### Retained skyline photos (not active backgrounds)

The four supplied skyline photos below are retained unchanged, but are no longer imported, bundled or used as scene backgrounds. Personal memory photo placeholders remain separate.

| City | Retained photo |
|---|---|
| Montréal | [montreal-cityscape-at-night.webp](./assets/montreal-cityscape-at-night.webp) |
| Toronto | [toronto.jpg](./assets/toronto.jpg) |
| Ottawa | [ottawa.jpg](./assets/ottawa.jpg) |
| Nanjing | [nanjing.jpg](./assets/nanjing.jpg) |

No photographer or license metadata has been invented for the supplied photos.

### Archived reference photograph attribution

The previously downloaded `assets/city-*.jpg` files are retained as **unused reference assets**. They are no longer used as city backgrounds or bundled into the site. Their original credits below apply only to those archived files, not the four supplied photographs above. Those reference images were cropped/resized and their adaptations retain their respective Creative Commons licenses; this does not change the license of the application code.

| City view | Photographer | Original photograph | License |
|---|---|---|---|
| Montréal night skyline from Mount Royal | Paolostefano1412 | [Montreal night view](https://commons.wikimedia.org/wiki/File:Montreal_night_view.jpg) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Toronto night skyline and waterfront | Martin St-Amant | [Toronto panorama, September 2009](https://commons.wikimedia.org/wiki/File:126_-_Toronto_-_Panorama_-_Septembre_2009.JPG) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| Ottawa Parliament Hill and Peace Tower at night | m0nkyman | [Parliament Hill at night](https://commons.wikimedia.org/wiki/File:Parliament_Hill_at_night_(2484137547).jpg) | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/) |
| Nanjing skyline and colored reflections on Xuanwu Lake at night | \_初音没有来\_ | [Nanjing night scene, December 2013](https://commons.wikimedia.org/wiki/File:2013年12月13日——南京夜景_-_panoramio.jpg) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
