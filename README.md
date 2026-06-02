<div align="center">

# ⬤ NULLSTERN

### a top‑down survival‑horror arcade in the browser

*Hold the abandoned med‑bay. The signal is decaying. They keep coming.*

![status](https://img.shields.io/badge/status-playable-7CFFB4?style=flat-square)
![engine](https://img.shields.io/badge/three.js-r160-FFB45A?style=flat-square)
![deps](https://img.shields.io/badge/build-none%20·%20pure%20web-57FF9A?style=flat-square)
![built with](https://img.shields.io/badge/built%20with-Claude%20Opus%204.8-D77655?style=flat-square)
![license](https://img.shields.io/badge/license-MIT-FF6A3C?style=flat-square)

### 🕹️ [**[ PLAY IN BROWSER ]**](https://rakhimv.github.io/NULLSTERN/)

</div>

---

## ▸ About

**NULLSTERN** is a single‑file‑ish, zero‑build 3D browser game inspired by the mood of *NULLSTERN*: a dark sodium‑lit facility, a phosphor‑green bulkhead, film grain and scan‑lines, and waves of replikas teleporting in to swarm you. Built from scratch with **three.js** — every texture, light, sound bus and ragdoll is procedural or hand‑wired. No game engine, no bundler, no backend.

You drop into the med‑bay, press **E** to arm the defense, and survive escalating levels — each wave is bigger, faster and tougher than the last. Headshots flop them backwards, leg shots trip them, a kick sends them flying, and the floor remembers every kill.

## ▸ Features

- 🔦 **Two cameras** — classic top‑down survival‑horror view *and* a full first‑person mode (press **V**)
- 🧟 **Ragdoll enemies** — bullets push them, headshots ragdoll them back, legs buckle, bodies tumble, bounce and sink. Squash‑and‑stretch "rubber" physics for that arcade feel
- 🔫 **Real gunplay** — auto‑fire, ammo + reload, tracers, muzzle flash, hit‑zone damage (head / torso / legs), and a melee **kick** on a cooldown that launches crowds
- 🌀 **Teleport spawns** — enemies materialize from glowing capsule‑portals, not thin air
- 📈 **Infinite levels + high score** — difficulty ramps forever; your best run is saved locally
- 🔊 **Spatialized audio (HRTF/8D)** — death cries come from where the enemy actually died; punchy reverb‑driven gunshots, footsteps, ambient drone and a music track
- 🎚️ **Settings on ESC** — toggle music / enemy SFX / weapon SFX, see all controls
- 🎞️ **Full retro grade** — bloom, chromatic aberration, scan‑lines, vignette, film grain, pixel crunch

## ▸ Controls

| Key | Action |
|-----|--------|
| **W A S D** | Move |
| **Mouse** | Aim / look · flashlight |
| **LMB** (hold) | Fire (automatic) |
| **R** | Reload |
| **F** | Kick (cooldown) |
| **E** | Start the defense |
| **V** | Toggle first / third person |
| **ESC** | Pause & settings |
| **M** | Mute all sound |


## ▸ Tech

- **three.js r160** (via unpkg importmap — no install)
- `GLTFLoader` + `SkeletonUtils` for the animated enemy (Mixamo rig: walk + attack clips retargeted by bone name)
- `EffectComposer` → `UnrealBloomPass` → custom grade `ShaderPass`
- **Web Audio API** — reverb convolver bus, HRTF `PannerNode` for positional death sounds, procedural drone
- Hand‑rolled top‑down + FPS controller, AABB collision, steering/obstacle‑avoidance, and a lightweight rigid‑body ragdoll

## ▸ Credits

Made by **[github.com/Rakhimv](https://github.com/Rakhimv)**

🤖 Built with **Claude Opus 4.8** (Anthropic) — design, three.js code, shaders, audio and gameplay were pair‑programmed with the model inside Claude Code.

A fan‑made tribute to the *SIGNALIS* mood (rusty lazarus / HUMBLE GAMES) — this is a non‑commercial hobby project, not affiliated with or endorsed by its creators. Character animations from Mixamo.

## ▸ License

MIT — do what you want, just keep the credit. See `LICENSE` if present.

<div align="center">

*// unit lstr‑512 · standby · the facility is listening*

</div>
