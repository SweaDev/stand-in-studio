import { describe, expect, it } from 'vitest';
import { type InputFacts, describeInput } from '../../../src/shared/inputStatus';

const cam: InputFacts = {
  source: 'camera',
  name: 'Integrated Webcam',
  shutter: false,
  presage: 'running',
  pause: null,
  apiKey: true,
};

describe('describeInput', () => {
  it('names the camera Presage is analysing', () => {
    const s = describeInput(cam);
    expect(s.camera).toMatchObject({ text: 'Camera on', tone: 'live' });
    expect(s.presage.text).toBe('Presage · Integrated Webcam');
    expect(s.analysing).toBe(true);
    expect(s.presageToggle).toBe(true);
  });

  it('the shutter turns both the camera and Presage off', () => {
    const s = describeInput({ ...cam, shutter: true, presage: null });
    expect(s.camera).toMatchObject({ text: 'Camera off', tone: 'off' });
    expect(s.presage.text).toBe('Presage off');
    expect(s.analysing).toBe(false);
    expect(s.presageToggle).toBe(false);
  });

  it('explains every pause', () => {
    expect(describeInput({ ...cam, presage: 'paused', pause: 'cameraMode' }).presage.text).toBe(
      'Presage paused · Camera mode',
    );
    expect(describeInput({ ...cam, presage: 'paused', pause: 'clipPaused' }).presage.text).toBe(
      'Presage paused · clip paused',
    );
    expect(describeInput({ ...cam, presage: 'paused', pause: 'user' }).presage).toMatchObject({
      text: 'Presage off',
      tone: 'off',
    });
  });

  it('a video file names the file, and the webcam is not in use', () => {
    const s = describeInput({ ...cam, source: 'clip', name: 'talk.webm' });
    expect(s.source.text).toBe('Video file · talk.webm');
    expect(s.presage.text).toBe('Presage · talk.webm');
    expect(s.camera.tone).toBe('muted');
  });

  it('without an API key, Presage is off and says why', () => {
    const s = describeInput({ ...cam, source: 'clip', name: 'a.mp4', presage: null, apiKey: false });
    expect(s.presage).toMatchObject({ text: 'Presage off · no API key', tone: 'warn' });
    expect(s.presageToggle).toBe(false);
  });

  it('replays and the simulated demo never use Presage', () => {
    const r = describeInput({ ...cam, source: 'replay', name: 'Standup', presage: null });
    expect(r.source.text).toBe('Saved demo · Standup');
    expect(r.presage.text).toBe('Replaying telemetry');
    expect(r.presageToggle).toBe(false);
    const d = describeInput({ ...cam, source: 'demo', name: '', presage: null });
    expect(d.source.text).toBe('Simulated demo');
    expect(d.presage.text).toBe('Simulated signals');
  });
});
