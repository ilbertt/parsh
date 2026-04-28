import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * The current user's home directory.
 *
 * - **macOS / Linux:** `/Users/<user>` / `/home/<user>`
 * - **Windows:** `C:\Users\<user>`
 *
 * @example
 * ```ts
 * basePath: join(osHomeDir(), '.mycli')   // ~/.mycli (dotfile layout)
 * ```
 */
export function osHomeDir(): string {
  return homedir();
}

/**
 * The per-user config directory (without an app subdir). Follows the XDG
 * convention everywhere except Windows — same dir most CLI tools (gh, gcloud,
 * kubectl, helm) use on macOS, even though `~/Library/Application Support` is
 * Apple's GUI-app convention.
 *
 * - **macOS / Linux:** `$XDG_CONFIG_HOME` if set, otherwise `~/.config`
 * - **Windows:** `%APPDATA%` if set, otherwise `~/AppData/Roaming`
 *
 * @example
 * ```ts
 * basePath: join(osHomeConfigDir(), 'mycli')   // ~/.config/mycli
 * ```
 */
export function osHomeConfigDir(): string {
  const home = homedir();
  if (process.platform === 'win32') {
    return process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME ?? join(home, '.config');
}
