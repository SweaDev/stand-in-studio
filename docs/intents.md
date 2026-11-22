# Intents in Auto mode

In **Auto**, Stand-In Studio decides how much of your camera the meeting sees from *intents*. Each intent is a short list of conditions on live Presage SmartSpectra signals, plus an action for the character. You can change the built-in intents' actions, turn them off, reorder them, and add your own intents in **Advanced → Create custom intent**.

## Actions

| Action | Stage |
|---|---|
| **Reveal me** | Your camera at your *max*; the character steps out of the way |
| **Blend** | Your camera at your *listening level*, with the character over it |
| **Cover me** | The character fully covers you |
| **Back soon** | The character covers you and shows "back soon" |

Body signals (pulse, breathing rate) can only **cover** you. An intent that uses one can never choose Reveal or Blend. *Hide me*, *Pin* and the Comfort shield still override every intent.

## Built-in intents (default priority)

| # | Intent | Conditions | Default action |
|---|---|---|---|
| 1 | Away from the camera | face in view = no (for 3 s) | Back soon |
| 2 | Someone else in view | people in view = more than one | Cover me |
| 3 | Talking to someone else | talking = yes · head turn = left or right | Cover me |
| 4 | Turned away | talking = no · head turn = left or right (for 1.5 s) | Cover me |
| 5 | Looking elsewhere | talking = no · eye gaze = away (for 1.5 s) | Cover me |
| 6 | Eating or yawning | talking = no · mouth = open (for 1.5 s) | Cover me |
| 7 | Talking in the meeting | talking = yes · head turn = facing the screen · eye gaze = on screen · people = just me | Reveal me |
| 8 | Listening to others | talking = no · facing the screen · gaze on screen · mouth closed · just me | Blend |

If no intent matches, Auto falls back to **Blend** at your listening level.

## Signals

Every signal comes from the Presage SmartSpectra SDK (3.5.0). Some are SDK outputs as they are. Others are derived by Stand-In Studio from the SDK's 478 face landmarks, which are pixel coordinates. Every derived value is divided by a face distance, so it doesn't depend on how far you sit from the camera, and is compared with your 15-second calibration.

| Signal | States | Source | How Stand-In reads it |
|---|---|---|---|
| Talking | yes / no | [`face.talking`](https://smartspectra.presagetech.com/docs/data-types#face) | Share of the last 1.5 s with talking detected. 60% or more is "yes", 20% or less is "no". Detection is visual, so no microphone is used. |
| Head turn | facing / left / right | [`face.landmarks`](https://smartspectra.presagetech.com/docs/data-types#landmarks) | Nose tip (1) against the midpoint of the eye centres (33/133 and 263/362), roll-corrected, in eye-distances, relative to calibration. Default threshold 0.18. |
| Head tilt | level / down / up | landmarks | The same vector's vertical part. Default threshold 0.15. |
| Eye gaze | on screen / away | landmarks (iris) | Each iris centre (468, 473) minus its eye-corner midpoint, divided by that eye's width, averaged over both eyes, relative to calibration. Default threshold 0.12 eye-widths. Ignored, not blocking, when the SDK sends no iris points. |
| Mouth | closed / open | landmarks | Inner-lip gap (13–14) above your calibrated closed gap, in eye-distances. Default threshold 0.25. |
| Expression | neutral / happy / surprised / sad / angry | [`face.expression`](https://smartspectra.presagetech.com/docs/data-types#expressiontype) | SDK score from 0 to 100, divided by 100. Happy is measured above your calibrated resting level. Default threshold 0.3. |
| Eyes | open / closed | `face.blinking` + eyelid landmarks | How long the eyes have stayed closed. Default threshold 1 s, so normal blinks never count. |
| Nod or shake | still / nodding / shaking | landmarks | A pitch or yaw dip of at least 0.05 eye-distances that returns within 700 ms. The state lasts 1.5 s. |
| Face in view | yes / no | [validation status](https://smartspectra.presagetech.com/docs/nodejs/api-reference#validationcode) | `kNoFaceFound` for most of the last 1.5 s. |
| People in view | just me / more than one | validation status | Share of the last 1.5 s with `kMultipleFacesFound`. Default threshold 30%. |
| Breathing rate *(opt-in)* | near / raised | [`breathing.rate`](https://smartspectra.presagetech.com/docs/#breathing-rate) | Breaths per minute above a baseline learned over your first 30 s. Default threshold 5. |
| Pulse *(opt-in)* | near / raised | [`cardio.pulseRate`](https://smartspectra.presagetech.com/docs/#pulse-rate) | Beats per minute above a baseline learned over your first 30 s. Default threshold 12. |

Cardio metrics are requested from the SDK only while the Comfort shield is on, or while an enabled intent uses a body signal.

## How an intent is evaluated

1. **Membership.** Each condition gets a membership from 0 to 1: how strongly the signal is in one of the allowed states. Thresholds use a soft step, which is 0.5 at the threshold and about 0.9 at 1.25 times the threshold, so readings near the edge don't flicker.
2. **Score.** An intent's score is its *lowest* condition membership (a fuzzy AND). The developer log names that condition as the one that **limited** the score.
3. **Priority.** Intents are checked **top to bottom**, and the first one that scores at least **0.6** wins. Once active, an intent stays active until its score falls below **0.4** (hysteresis).
4. **Hold.** A new winner takes over only after it has won for its own *hold* time (default 0.7 s). Raising your feed then waits a further 2 s, while covering you happens at once. The feed moves at most 40% per second.

**Tuning.** Recording an intent for 6 s while you act it out adjusts its thresholds to you:
- for a "moved" state (turned, open, away), the threshold becomes 60% of your typical value;
- for a rest state (facing, closed), it becomes 125% of your 90th percentile, but never less than the default.

Tuning stays in memory unless you turn on *Save learned intent data* in Advanced settings.

## Conflicts

The builder checks every pair of enabled intents. Each intent is treated as a region of signal states, and any face-based condition also implies "face in view = yes".
- **Error:** a lower intent lies entirely inside a higher one, so it can never win. Move it up, or add a condition that tells the two apart.
- **Warning:** the two overlap and do different things. The higher one wins wherever both match, and the warning spells out when that is.
- **Info:** the two overlap but do the same thing.

The analysis works from the conditions you wrote. It can't know that, for example, turning your head also tends to move your gaze. A tuning recording shows how often other intents also matched while you acted the intent out.

## Camera mode

In Camera mode the Presage SDK is paused, so Auto has no signals and every intent is frozen. When you switch back, a short warming phase holds the current level until the SDK reports again (at most 10 s), so a resuming SDK never looks like an empty chair.

## Recorded demos

To tune intents on repeatable footage:
1. Open a recorded video (**Use a recorded video…** on the start screen) and press **Save telemetry…**, or record one with **Camera → Record a demo…**.
2. Replay the demo from **Demo** on the start screen or **Advanced → Demo library → Play**. The saved signals drive Auto in step with the video, so every replay makes the same decisions with no API use. Turn on **Developer mode** to read the decision log while it plays.
3. Change an intent, then replay and compare. Scrubbing or looping the clip clears the signal history, just as a resuming SDK does.

Demos are kept in your demo library folder, never in the repository. Use **Export** to share a demo as a single `.standin-demo.zip` file, which holds the video and its telemetry. **Import** accepts that file, or a video plus its `.telemetry.json`.

## Developer mode

**Advanced → Developer mode** opens a decision log in the control window. It is never shown on the stage, never written to disk and never printed to the console. Each row shows:
- every signal's value, state and threshold;
- every intent's score, and the condition that limited it;
- the winner and any pending hold;
- the policy step (pending raise, Comfort-shield cap, overrides);
- the final feed and character targets.

Body signals appear only as a difference from your baseline. **Copy** puts the visible rows on the clipboard as JSON lines.
