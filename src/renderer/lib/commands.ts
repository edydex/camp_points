import type { ShowCommand } from '../../shared'

export const commandId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export const command = <T extends Omit<ShowCommand, 'commandId'>>(
  value: T,
): ShowCommand => ({ ...value, commandId: commandId() } as ShowCommand)

export const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.matches('input, textarea, select, [contenteditable="true"]') ||
    Boolean(target.closest('[contenteditable="true"]'))
  )
}
