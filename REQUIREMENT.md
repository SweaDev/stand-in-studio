# **Stand-In Studio**: decide how much of you each call sees

> A desktop camera for video calls with one control: a **presence dial** that runs from *fully you* to *fully stand-in*. At one end is your real webcam. At the other is a hand-drawn character (a paper lantern, a houseplant, a cat or a cloud) that mirrors your nonverbal cues without your face:
> - it breathes when you breathe and blinks when you blink;
> - it nods along and talks when you talk;
> - it glows when you smile.
>
> In between, your real feed fades in and out beneath the character. In **Auto**, Stand-In Studio sets the dial for you from your live signals: you appear when you speak, and the character covers for you when you look away, eat, step out or need a moment.

| | |
|---|---|
| **Challenge** | [Presage SmartSpectra SDK Challenge](https://dev.to/challenges/presage-2026-11-04) |
| **Presage Doc** | [Presage doc. main](https://smartspectra.presagetech.com/docs/), [Presage doc. Node](https://smartspectra.presagetech.com/docs/nodejs) |
| **Prize categories** | **Both**: Most Creative or Delightful Use, **and** Best Thoughtful Real-World Use |
| **Modes** | Character · Camera · Blend · Auto |
| **Live signals** | Chest breathing waveform, blinking, face landmarks (head pose → nods/shakes; mouth openness), talking, expressions, validation status |
| **Cardio (pulse, breathing rate)** | Requested **only** when the opt-in *Comfort shield* is on, and used only to *lower* how much of you is shown |
| **Platform** | Desktop app (Electron and `@smartspectra/node-sdk`) on Windows or macOS. It reaches Zoom, Google Meet, Teams or any meeting app through **OBS Virtual Camera** |

---

## 1. The idea

Video calls ask people to look at their own face, and be looked at, for hours. Research on "Zoom fatigue" names mirror anxiety and constant close-up gaze as causes:
- Bailenson, 2021, *Nonverbal overload*, Technology, Mind, and Behavior.
- Fauville et al., 2021, *Zoom Exhaustion & Fatigue Scale*, Computers in Human Behavior Reports.

Verify both citations before quoting them.

Today the only escape is the camera-off button, and it is all or nothing. A black tile loses every nod and smile that speakers, teachers and teammates rely on, and switching the camera back on to say one thing feels like stepping onto a stage.

**Stand-In Studio turns that switch into a dial.**
- You can be fully on camera, fully represented by a friendly character, or anywhere in between.
- Your feed can fade softly behind the character.
- You can let the app move the dial for you, based on what your body and face are doing right now.

The character always carries the cues that make a call feel human: a nod, a smile, a breath, a "they're speaking" ring. It never shows your face, your room, or anything your body would not show anyway.

It is delightful to look at: a grid of breathing houseplants and nodding lanterns, with a real face fading in whenever someone speaks. It is also a thoughtful tool for people who are camera-tired, camera-shy, neurodivergent, sharing a home, eating at their desk, or simply having a hard day.

## 2. The four modes

All modes produce one picture, the **stage**, which the meeting receives as your camera.

| Mode | What the meeting sees | Controls |
|---|---|---|
| **Character** | The character only, on a calm background. Your feed is at 0% | Character and background colour |
| **Camera** | Your original webcam feed at 100%; the character is hidden. The Presage SDK is **paused**, so nothing is analysed | Optional small character badge in a corner (on/off), shown idle |
| **Blend** | Your feed at the opacity you choose, with the character overlaid | Opacity slider 0–100% with presets 25 / 50 / 75%. Layout: **Over** (character centred, feed dimmed behind) or **Beside** (character in the lower third, feed above) |
| **Auto** | Your feed at an opacity chosen live by the Auto rules (§5), with the character always present | Your **max** (default 100%), **listening level** (default 40%), and Comfort shield on/off |

**Presence dial.** This is the main control in the app window: a large round dial, with a mode switch beside it. Beside them, a preview of the **raw input** (camera, recorded clip or demo video) carries a small inset of the processed Virtual Stage output.
- Turning the dial switches to Blend and sets the opacity.
- In Auto, the dial needle moves on its own so you always see what the meeting sees.
- The lantern icon in the dial brightens as more of the character shows, and your face icon brightens as more of the feed shows.

**Transitions.**
- Opacity changes are **cross-fades**, never cuts: an ease-in-out curve over 300–600 ms.
- Below 30% opacity the feed also gets a soft blur, so faint shapes read as atmosphere rather than a ghostly half-face.
- Switching modes uses the same fade.

**Layer order** on the stage, from bottom to top:
1. background colour;
2. camera feed (at opacity α);
3. character;
4. small badges: "speaking" ring, raised hand, "back soon".

## 3. The characters

All four are simple, hand-drawn-style procedural drawings: no image assets, readable even at gallery-tile size (about 320×180). Real cues are **amplified** so they read on small tiles; for example, a 5° nod becomes a clear 15° character nod.

| Character | Breathes | Blinks | Nods / shakes | Talks | Smiles | Steps away |
|---|---|---|---|---|---|---|
| **Paper lantern** *(priority)* | Paper ribs widen | Two ink-dot eyes close | Bobs on its string / sways | Small painted mouth | Candle flares warm | Flame shrinks to an ember; "back soon" tag |
| **Houseplant** *(priority)* | Leaves rise and fall | Leaf-eyes close | Whole plant nods / leaves sway | Pot-rim mouth | Flowers open | Leaves droop; watering-can icon |
| **Cat** | Belly rises | Slow cat blink | Head nod / ear flick | Small "mew" mouth | Purr lines, rosy cheeks | Curls up asleep |
| **Cloud** | Puffs expand | Eyes close | Dips / wobbles | Soft "O" mouth | Sun peeks out | Fades to light mist |

Every character also has:
- a **raised-hand** pose: a leaf, a paw or a lantern tassel;
- a **reduced-motion** variant: half amplitude, no sparkles;
- a **high-contrast** variant: thick outlines, flat background.

## 4. Signals → character behaviour

Each signal has exactly one job. Every user gets a **15-second calibration** first ("look at the screen as you normally would, then nod once and smile once"). It records neutral head pose, closed-mouth distance, resting expression levels and blink behaviour. Everything below is measured **relative to that calibration**.

| SmartSpectra output | Character behaviour | Key details |
|---|---|---|
| Chest breathing waveform (`breathing.upperTrace`, ~30 Hz) | Body gently swells and settles | Normalised against its own recent range (10th–90th percentile over 15 s); scale ≈ 1 ± 3.5%. If no fresh sample for 2 s, a soft idle breath at 12/min keeps the character alive |
| Blinking (`face.blinking`), with eye openness from landmarks as backup | Eyes blink | 140 ms blink, 250 ms refractory; the backup triggers when eye openness drops below 60% of the calibrated level |
| Face landmarks → head pitch and yaw | Head tilts; **nod** and **shake** gestures | Pitch and yaw from nose tip vs eye midpoint, divided by the distance between the eyes; smoothed. A **nod** is a pitch dip of ≥ 0.05 eye-distances that returns within 700 ms. Two or more in 1.5 s is an enthusiastic nod. A **shake** is the same on yaw |
| Face landmarks → inner-lip gap | Mouth opens and closes | Shown only while talking (next row), so chewing or yawning never looks like speech |
| Talking (`face.talking`) | Mouth animates; a soft **speaking ring** | The ring tells others who is speaking, even on a muted or low-volume call |
| Expressions (happy probability) | Warm glow; a laugh (glow plus a talking burst) adds sparkles | Compared with the calibrated resting level, because some faces read "surprised" or "happy" at rest. On above rest + 0.25 for 400 ms; off below rest + 0.15 |
| Validation status | Presence: dims to "back soon" | Not OK or no face for 3 s → away. Back to OK for 1 s → a wake-up stretch |

## 5. Auto mode

Auto picks a **target opacity** for your feed every moment, then moves the actual opacity toward it smoothly. It does this through **intents** (v1.1). Each intent is a set of conditions on live Presage signals plus an **action** for the character:
- **Reveal me:** your max, and the character hides;
- **Blend:** your listening level, with the character over it;
- **Cover me:** 0%;
- **Back soon:** 0% plus the "back soon" state.

Intents are checked **top to bottom, and the first match wins**. The full reference is in [docs/intents.md](docs/intents.md).

**Built-in intents (default order):**

| Intent | Conditions | Default action |
|---|---|---|
| Away from the camera | no face for 3 s | Back soon |
| Someone else in view | `kMultipleFacesFound` | Cover me |
| Talking to someone else | talking · head turned left or right | Cover me |
| Turned away | not talking · head turned | Cover me |
| Looking elsewhere | not talking · eye gaze away | Cover me |
| Eating or yawning | not talking · mouth open | Cover me |
| Talking in the meeting | talking · facing the screen · gaze on screen · just me | Reveal me |
| Listening to others | not talking · facing · gaze on screen · mouth closed · just me | Blend |
| *(nothing matches)* | | Blend |

**Your control over intents:**
- You can change each built-in intent's action, turn it off, or reorder it.
- **Custom intents** are built in a builder from the signal catalogue: talking, head turn, head tilt, eye gaze, mouth, expression, eyes, nod or shake, face in view, people in view, and (opt-in) pulse and breathing rate. Each signal shows its SDK source, its live value and a link to Presage's documentation.
- The builder warns when an intent overlaps another, and blocks saving an intent that could never win.
- *Tune* records 6 s of you acting an intent out and fits its thresholds to you.
- **Developer mode** (Advanced) shows a live decision log in the control window: each signal's state, each intent's score, and why the winner won.

**Comfort shield** (opt-in): when confident pulse is more than 12 bpm above your calibrated baseline, **or** breathing rate more than 5/min above it, the feed is capped at **15%** until you have been back near baseline for 20 s.

**Smoothing:**
- Opacity moves at most **40% per second**.
- A new intent takes over only after its own hold time (default 0.7 s), with hysteresis: it becomes active at a score of 0.6 and is released below 0.4.
- Covering you happens at once. Showing more of you waits a further **2 s**.
- SDK validation flicker (for example `kTooDark` or `kExcessiveMotion`) never hides you on its own. Validation only feeds *Face in view* and *People in view*.

**Overrides, always available as global hotkeys:**
- **Hide me:** instant 0% in any mode. It always wins until pressed again.
- **Pin:** freeze the current opacity; Auto stops changing it.
- **Raise hand** · **Back soon** · **Cycle mode**.

**The Auto invariant.** Signals about your body can only make Stand-In Studio **show less of you, never more**:
- **Body signals** (pulse, breathing rate) can only *lower* the target. An intent that uses one can only cover you, and the Comfort shield is a cap.
- **Raising opacity** comes only from intents whose action *you* chose (Reveal or Blend) on visible cues, such as talking while facing the screen. It is always capped by the max *you* set, and waits 2 s.

## 6. Data handling and consent

**The rule:** *"Your body can only make Stand-In show less of you, never more. Numbers never leave your computer."*

- **Consent first.** The camera starts only after a plain-language consent screen. That screen states clearly:
  - **Character mode** sends only the drawn character to the meeting.
  - **Camera, Blend and Auto** send **your real video**, at the opacity shown on the dial, to the meeting through OBS.
  - What is read from the camera, and why.
  - That cardio signals (pulse, breathing rate) are requested **only** if the Comfort shield, or a custom intent that uses them, is switched on.
  - That nothing is recorded unless you choose to save a demo, and that the camera can be stopped at any time.
- **On-device processing.** Frames are processed **on this computer** by the SmartSpectra SDK.
  - Stand-In Studio records and stores nothing: no video, images, audio, landmarks or signal values.
  - Calibration values and intent tuning live in memory and are discarded on quit.
  - Only the character choice, mode and intent settings are saved. Learned intent thresholds are saved only if you opt in under Advanced, with a privacy warning.
  - Developer mode's decision log is shown on screen only. It is never written to disk or printed.
- **Saved demos (opt-in).** *Save telemetry* (for a recorded video) and *Record a demo* (from the webcam) save a clip plus the signals Presage returned for it to the **demo library** on this computer. By default the library is `demos/` in the app's data folder; the user can pick another folder. Both actions:
  - show a privacy notice first, every time;
  - save face signals only, adding pulse and breathing only when ticked;
  - upload nothing.

  Demos are never part of the source repository. Replaying a saved demo uses no SDK and no API.
- **No analysis in Camera mode.** About 1.5 s after you switch to Camera mode, the SDK is stopped: no frames are sent to it. It resumes as soon as you leave Camera mode, and Auto holds its level until the first data arrives. If the camera starts while in Camera mode, the SDK is configured but never started.
- **Minimal requests.** The SDK is asked only for what the current settings need: the face signals and chest breathing, plus pulse and breathing rate only with the Comfort shield or a body-signal intent on.
- **Telemetry off.** Presage telemetry is off (`enableTelemetry: false`). Link to Presage's Telemetry and Privacy page.
- **No numbers anywhere.** No physiological number is ever shown on the stage or sent anywhere. The only output is the composed picture, which goes through OBS, and you control OBS.
- **No labels.** Stand-In Studio never labels feelings ("you seem stressed"). It mirrors visible movement and moves the dial.
- **Honest residual risk.** Others might notice your feed fading and wonder why. Fades have many everyday causes (listening, looking away, eating, stepping out), and the Comfort shield is off by default. The consent screen says this plainly.
- **API key.** It stays in the main process (from an environment variable, or pasted and kept in memory only). It is never in the renderer or on disk.
- **Not medical.** No medical or wellness claims, and no diagnosis.

## 7. How it reaches the meeting

1. Stand-In Studio **owns the physical webcam**. It opens the camera once with `getUserMedia` (1280×720, 30 fps) and gives that **same stream** to the SDK with `sdk.useMediaStream(stream)`. Several challenge submissions use this pattern, so there's one camera stream for both sensing and the feed.
2. A separate **Stage window** (1280×720, no window chrome) composes the background, feed, character and badges at 30 fps.
3. **OBS Studio:** a *Window Capture* of "Stand-In Virtual Stage", then *Start Virtual Camera*. The window is frameless, so the capture has no title bar. The control window opens and closes it with **Open/Close Virtual Stage Window**.
4. In Zoom, Meet or Teams, choose **OBS Virtual Camera**. The meeting app never touches the real webcam, so there is no camera contention.

An in-app **3-step checklist** walks through steps 3–4, with a *Test pattern* button so you can confirm the meeting sees the stage. Without OBS, the fallback is sharing the Stage window as a screen share.

## 8. Demo mode

Without an API key (or to save trial credits), **Demo mode** replaces the SDK with simulated signals. A permanent "DEMO – simulated signals" badge appears in the app window, never on the stage.
- **Keyboard:** N nod · S shake · T hold to talk · B blink · H smile · E eat · L look away · A step away · P raise the Comfort-shield trigger.
- **Scripted meeting loop:** a 60-second sequence of listening, nodding, talking, looking away and stepping out. It shows Auto mode end to end, with a looping sample video standing in for the camera feed.

### 8a. Recorded input and saved demos
- **Recorded input:** a video file can stand in for the camera. With an API key the SDK analyses its captured stream exactly as it would the webcam. Pausing the clip pauses the SDK, as Camera mode does.
- **Saved demos:** the telemetry from one start-to-end pass of a clip, or from an in-app webcam recording, is saved beside the clip. It is the `standin-telemetry` v1 format, with frames stamped by media time.
- **Replay:** on later runs a saved demo is offered as a Demo option. Its telemetry is replayed in step with the video, and a seek or loop clears the signal history. Auto's decisions match the live run; the live check measured 99% agreement.
- **Sharing:** demos can be exported and imported as a video plus a `.telemetry.json` file, for debugging and tuning intents outside the repo.

## 9. Scope

**Core:**
- all four modes, with the presence dial, cross-fades and both Blend layouts;
- the lantern and houseplant characters;
- calibration and every behaviour in §4;
- the Auto rules, smoothing and overrides in §5;
- the opt-in Comfort shield;
- the consent screen, hotkeys, OBS checklist with test pattern, and demo mode;
- reduced-motion and high-contrast options.

**Nice to have:**
- the cat and cloud characters;
- a laugh sparkle burst;
- the corner badge in Camera mode;
- per-meeting presets ("stand-up: Auto, listening 30%").

**Stretch:**
- a native virtual camera (no OBS);
- gesture reactions (a long nod sends 👍 through the meeting app's reaction shortcut);
- a character editor and team packs.

**Out of scope:**
- showing, storing or sending any physiological number;
- emotion inference or labels;
- recording;
- accounts or cloud services;
- mobile apps.

## 10. Implementation notes

**SDK wiring.** Several challenge submissions report this pattern; verify every name against Presage's Node.js docs (https://smartspectra.presagetech.com/docs/nodejs):
- the Electron three-process setup, with `bindSmartSpectraIpc(window)` in main and the SDK's preload;
- `SmartSpectraSDK` in the renderer;
- `requestedMetrics`, built from the current settings;
- `enableTelemetry: false`;
- `sdk.useMediaStream(stream)`;
- the `metrics` event with `decodeMetrics(buf)`;
- the `validationStatus` event (code + hint);
- the `error` event (retryable flag).

**Known constraints, as reported by other submissions:**
- **Frame rate:** the SDK stops if input drops below about 25 fps, so compositing and rendering must leave headroom.
- **No `videoOutput` listener:** don't attach one. It costs CPU, and the feed is drawn from the app's own stream instead.
- **Breathing framing:** breathing needs the upper chest in view. Calibration should prompt the user to frame accordingly.
- **Cardio averaging:** cardio readings are averaged over seconds, and the breathing rate over about 30 s. That suits the slow Comfort shield, never per-frame decisions.
- **Camera selection:** pick the **physical camera** explicitly, and exclude "OBS Virtual Camera" and other virtual devices from the list.
  - Virtual cameras can be listed first and may not hold 30 fps (reported by *Hear Me*).
  - Feeding Stand-In its own OBS output would also create a feedback loop.
- **Resolution vs. frame rate:** at 1280×720 one submission's renderer could not keep the SDK at 25 fps on CPU; 640×360 did.
  - Measure early.
  - If needed, capture at a lower resolution (e.g. 960×540 or 640×360) and upscale the feed on the stage. Optionally, give the SDK a downscaled track and keep a higher-resolution track for display.

**Keep it testable.** Keep these as pure, unit-testable modules, independent of Electron and the SDK:
- the character pose mapper (§4);
- the nod and shake detectors;
- the Auto policy (§5), including its invariant;
- the opacity smoother.
