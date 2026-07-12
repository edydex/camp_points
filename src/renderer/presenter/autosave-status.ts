import type { RuntimeStatus } from '../../preload/contracts'

export interface AutosavePresentation {
  label: string
  detail: string
  title: string
  tone: 'saved' | 'pending' | 'error' | 'unavailable'
}

export function describeAutosaveStatus(
  status: RuntimeStatus | null,
  formatTimestamp: (value: Date) => string = defaultTimestampFormatter,
): AutosavePresentation {
  if (!status) {
    return {
      label: 'Autosave unavailable',
      detail: 'Desktop app only',
      title: 'Autosave status is unavailable in this preview.',
      tone: 'unavailable',
    }
  }

  if (status.lastError) {
    return {
      label: 'Attention needed',
      detail: status.lastError,
      title: status.lastError,
      tone: 'error',
    }
  }

  if (status.lastAutosaveAt) {
    const savedAt = new Date(status.lastAutosaveAt)
    const timestamp = Number.isNaN(savedAt.getTime())
      ? status.lastAutosaveAt
      : formatTimestamp(savedAt)
    return {
      label: 'Autosaved',
      detail: `Saved ${timestamp}`,
      title: `Last autosave: ${status.lastAutosaveAt}`,
      tone: 'saved',
    }
  }

  return {
    label: 'Not saved yet',
    detail: status.autosaveAvailable ? 'Save time unavailable' : 'Edits save automatically',
    title: 'No successful autosave has been recorded for this show yet.',
    tone: 'pending',
  }
}

function defaultTimestampFormatter(value: Date): string {
  return value.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  })
}
