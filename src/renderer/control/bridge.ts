import type { StudioApi } from '../../shared/ipc';

declare global {
  interface Window {
    studio: StudioApi;
  }
}

/** Typed access to the preload bridge. */
export function bridge(): StudioApi {
  return window.studio;
}
