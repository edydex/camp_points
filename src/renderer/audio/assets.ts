import accentCartoonUrl from './assets/accent-cartoon.wav?url'
import spaceMusicUrl from './assets/mesmerizing-galaxy.mp3?url'
import announceUrl from './assets/sfx-announce.wav?url'
import drainUrl from './assets/sfx-drain.wav?url'
import fuelUrl from './assets/sfx-fuel.wav?url'
import launchUrl from './assets/sfx-launch.wav?url'
import maxUrl from './assets/sfx-max.wav?url'
import mishapUrl from './assets/sfx-mishap.wav?url'
import selectUrl from './assets/sfx-select.wav?url'
import undoUrl from './assets/sfx-undo.wav?url'
import winUrl from './assets/sfx-win.wav?url'
import type { ThemeId } from '../../shared'
import type { SoundName } from './SoundEngine'

/** Static imports make Vite fingerprint and package every sound with the app. */
export const CORE_SOUND_URLS: Readonly<Record<SoundName, string>> = {
  select: selectUrl,
  fuel: fuelUrl,
  drain: drainUrl,
  max: maxUrl,
  undo: undoUrl,
  announce: announceUrl,
  launch: launchUrl,
  mishap: mishapUrl,
  win: winUrl,
}

export const THEME_ACCENT_URLS: Readonly<Record<ThemeId, string>> = {
  cartoon: accentCartoonUrl,
}

export const THEME_AMBIENCE_URLS: Readonly<Record<ThemeId, string>> = {
  cartoon: spaceMusicUrl,
}

export const ALL_BUNDLED_AUDIO_URLS: readonly string[] = [...new Set([
  ...Object.values(CORE_SOUND_URLS),
  ...Object.values(THEME_ACCENT_URLS),
  ...Object.values(THEME_AMBIENCE_URLS),
])]
