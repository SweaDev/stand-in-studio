import { type CameraDevice, physicalCameras, pickCamera } from '../../../sensing/cameraFilter';
import { type CaptureProfile, parseCaptureProfile } from '../../../shared/settings';

/**
 * Owns the one physical webcam stream (REQUIREMENT §7): opened once with getUserMedia and
 * shared by the SDK and the stage feed.
 */
export class CameraManager {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  deviceId: string | null = null;

  /** Physical cameras (labels are available once camera permission was granted). */
  async list(): Promise<CameraDevice[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return physicalCameras(
      all
        .filter((d) => d.kind === 'videoinput')
        .map((d) => ({ deviceId: d.deviceId, label: d.label || 'Camera' })),
    );
  }

  /** Opens the chosen (or first physical) camera at the given profile, 30 fps. */
  async open(savedId: string | null, profile: CaptureProfile): Promise<MediaStream> {
    this.close();
    const { width, height } = parseCaptureProfile(profile);
    const constraints = (deviceId?: string): MediaStreamConstraints => ({
      audio: false,
      video: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        width: { ideal: width },
        height: { ideal: height },
        // No hard minimum: the SDK itself reports a sustained low frame rate.
        frameRate: { ideal: 30 },
      },
    });
    // Labels (and so the virtual-camera filter) need permission: ask once, then pick.
    let stream = await navigator.mediaDevices.getUserMedia(constraints(savedId ?? undefined));
    const devices = await navigator.mediaDevices.enumerateDevices();
    const chosen = pickCamera(
      devices.filter((d) => d.kind === 'videoinput').map((d) => ({ deviceId: d.deviceId, label: d.label })),
      savedId,
    );
    if (!chosen) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error('No physical camera found (virtual cameras such as OBS Virtual Camera are excluded).');
    }
    const current = stream.getVideoTracks()[0]?.getSettings().deviceId ?? null;
    if (chosen.deviceId !== current) {
      stream.getTracks().forEach((t) => t.stop());
      stream = await navigator.mediaDevices.getUserMedia(constraints(chosen.deviceId));
    }
    this.stream = stream;
    this.deviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? chosen.deviceId;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    this.video = video;
    return stream;
  }

  /** The <video> the stage draws the feed from. */
  get element(): HTMLVideoElement | null {
    return this.video;
  }

  /** The open camera's name (empty when closed). */
  get label(): string {
    return this.stream?.getVideoTracks()[0]?.label ?? '';
  }

  get current(): MediaStream | null {
    return this.stream;
  }

  /** Actual capture settings (for diagnostics). */
  settings(): MediaTrackSettings | null {
    return this.stream?.getVideoTracks()[0]?.getSettings() ?? null;
  }

  close(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
  }
}
