import type { Session, WebContents } from 'electron';

/**
 * Grants camera access only to the control window's own file:// page. Everything else
 * (other permissions, other origins, the stage window) is denied.
 */
export function installPermissionHandlers(session: Session, isControl: (wc: WebContents) => boolean): void {
  const allowed = (wc: WebContents | null, permission: string, url: string) =>
    wc !== null &&
    isControl(wc) &&
    url.startsWith('file://') &&
    (permission === 'media' || permission === 'mediaKeySystem');
  session.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowed(wc, permission, details.requestingUrl) && permission === 'media');
  });
  session.setPermissionCheckHandler((wc, permission, origin) => allowed(wc, permission, origin ?? ''));
}
