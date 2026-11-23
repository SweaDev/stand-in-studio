import { STAND_IN_LABEL } from './linuxDevices';

/**
 * The one-time setup, run as root through pkexec after the user clicks "Set up camera".
 * It is constant text: nothing from the user, the page or the environment is put into it.
 *
 * - Loads v4l2loopback at every boot (/etc/modules-load.d).
 * - Unless another file already sets v4l2loopback options, gives it two devices,
 *   "Stand-In Camera" and "OBS Virtual Camera", so OBS keeps working beside the app.
 *   `exclusive_caps=1` is what makes Chrome and Meet list them as cameras.
 * - Loads the module now, or, if OBS already loaded it, adds a Stand-In device with
 *   v4l2loopback-ctl (v0.13+).
 *
 * Exit status 3 with "STANDIN:not-installed" means the v4l2loopback package is missing.
 */
export const SETUP_SCRIPT = `set -e
PATH="$PATH:/sbin:/usr/sbin"
if ! modinfo v4l2loopback >/dev/null 2>&1; then echo "STANDIN:not-installed"; exit 3; fi
mkdir -p /etc/modules-load.d /etc/modprobe.d
printf '%s\\n' v4l2loopback > /etc/modules-load.d/stand-in-camera.conf
other=$(grep -ls '^[[:space:]]*options[[:space:]][[:space:]]*v4l2loopback' /etc/modprobe.d/*.conf 2>/dev/null | grep -v '/stand-in-camera\\.conf$' || true)
if [ -z "$other" ]; then
  printf '%s\\n' 'options v4l2loopback devices=2 exclusive_caps=1,1 card_label="${STAND_IN_LABEL}","OBS Virtual Camera"' > /etc/modprobe.d/stand-in-camera.conf
fi
if [ ! -d /sys/module/v4l2loopback ]; then
  modprobe v4l2loopback
elif ! grep -qsx '${STAND_IN_LABEL}' /sys/devices/virtual/video4linux/*/name; then
  if command -v v4l2loopback-ctl >/dev/null 2>&1; then v4l2loopback-ctl add -n '${STAND_IN_LABEL}' -x 1 >/dev/null 2>&1 || true; fi
fi
sleep 0.5
echo "STANDIN:ok"
`;

/** Install commands shown (never run) when the v4l2loopback package is missing. */
export const INSTALL_HELP: readonly { distro: string; command: string }[] = [
  { distro: 'Ubuntu / Debian', command: 'sudo apt install v4l2loopback-dkms v4l2loopback-utils' },
  { distro: 'Fedora', command: 'sudo dnf install v4l2loopback kmod-v4l2loopback' },
  { distro: 'Arch', command: 'sudo pacman -S v4l2loopback-dkms v4l2loopback-utils' },
];
