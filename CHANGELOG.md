# Changelog

All notable changes to Stand-In Studio. Versions follow the phases in [PLAN.md](PLAN.md).

## 1.0.0 — 2026-11-20
- README with install, OBS setup (including Linux v4l2loopback), hotkeys, privacy, testing and architecture.
- DEV challenge submission post (`POST.md`).
- Accessibility scan (axe-core, WCAG A/AA), keyboard reachability and no-camera error-state tests.
- Demo-mode media capture (`docs/media`) and the final live smoke test (Presage usage: 324.8 s of the 900 s budget).

## 0.9.0 — Nice-to-haves
- Cat and cloud characters.
- Laugh sparkles and the Camera-mode corner badge, verified end to end.
- Per-meeting presets.

## 0.8.0 — Presage live integration
- API key kept in the main process and injected into the SDK bridge (Decorator). The renderer never sees it.
- `PresageSignalSource` on the app's own camera stream: minimal metric requests, telemetry off, retry with back-off, Demo fallback.
- Calibration wizard.
- Measured capture-size trade-offs; steps down only on a sustained low frame rate.
- `npm run test:live`: real SDK on a fake camera, budget-guarded.

## 0.7.0 — App shell and UI
- Consent screen, settings store, typed IPC, camera manager (virtual cameras excluded).
- Presence dial, mode switch, settings panel.
- Global hotkeys and the OBS checklist with test pattern.

## 0.6.0 — Demo mode
- Keyboard-driven simulated signals, a 60-second scripted meeting, a procedural sample feed and the demo badge.

## 0.5.0 — Stage rendering
- Hand-drawn sketch primitives, paper lantern and houseplant characters, the stage compositor and the "Stand-In Stage" window.

## 0.4.0 — Auto and modes
- Auto rules and policy (the show-less-never-more invariant), Comfort shield, opacity smoother, mode state machine, commands and the `StudioEngine` facade.

## 0.3.0 — Signal trackers
- Calibration, face features, breathing normaliser, blink and gesture detectors, smile/talk/presence trackers and the pose mapper.

## 0.2.0 — SDK spike and signal model
- Presage budget ledger, public-domain test clip, live SDK probe (`docs/sdk-notes.md`), shared types and settings, metrics mapper.

## 0.1.0 — Scaffold
- Electron + TypeScript + esbuild, Vitest, ESLint, Prettier, Playwright e2e and CI.
