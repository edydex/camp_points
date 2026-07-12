import { useEffect, useId, useRef, useState } from 'react'

interface ShowTitleEditorProps {
  title: string
  onCommit: (title: string) => Promise<boolean>
  disabled?: boolean
}

export function ShowTitleEditor({ title, onCommit, disabled = false }: ShowTitleEditorProps) {
  const [draft, setDraft] = useState(title)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const skipNextBlur = useRef(false)
  const helpId = useId()

  useEffect(() => {
    if (document.activeElement !== inputRef.current) setDraft(title)
  }, [title])

  const commit = async (rawTitle: string) => {
    const nextTitle = rawTitle.trim()
    if (!nextTitle) {
      setDraft(title)
      setMessage('Camp name cannot be blank')
      return
    }
    if (nextTitle === title) {
      setDraft(nextTitle)
      setMessage(null)
      return
    }

    setSaving(true)
    try {
      const accepted = await onCommit(nextTitle)
      setDraft(accepted ? nextTitle : title)
      setMessage(accepted ? null : 'Could not save the camp name')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="show-title-editor">
      <h1>
        <input
          ref={inputRef}
          aria-label="Show title"
          aria-describedby={helpId}
          autoComplete="off"
          disabled={disabled}
          maxLength={64}
          spellCheck
          title="Edit the heading shown on the audience screen"
          value={draft}
          style={{ width: `${Math.min(64, Math.max(20, draft.length + 1))}ch` }}
          onChange={(event) => {
            setDraft(event.target.value)
            setMessage(null)
          }}
          onBlur={(event) => {
            if (skipNextBlur.current) {
              skipNextBlur.current = false
              return
            }
            void commit(event.currentTarget.value)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              skipNextBlur.current = true
              setDraft(title)
              setMessage(null)
              event.currentTarget.blur()
            }
          }}
        />
      </h1>
      <span id={helpId} className={`show-title-edit-note${message ? ' has-message' : ''}`} role="status" aria-live="polite">
        {disabled ? 'End rehearsal to rename' : saving ? 'Saving…' : message ?? 'Edit camp name'}
      </span>
    </div>
  )
}
