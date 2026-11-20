import type { StudioBridge } from '../../preload/control';

declare global {
  interface Window {
    studio: StudioBridge;
  }
}

/** Typed access to the preload bridge. */
export function bridge(): StudioBridge {
  return window.studio;
}
