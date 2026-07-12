import { useCallback, useEffect, useState } from 'react'
import type { CommandResult, EngineSnapshot, ShowCommand } from '../../shared'
import { runtime } from '../lib/local-runtime'

interface ShowRuntimeState {
  snapshot: EngineSnapshot | null
  error: string | null
  dispatch: (command: ShowCommand) => Promise<CommandResult | null>
}

export function useShowRuntime(): ShowRuntimeState {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    runtime.getSnapshot().then((value) => {
      if (active) setSnapshot(value)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    const unsubscribe = runtime.subscribeSnapshot((value) => {
      if (active) {
        setSnapshot(value)
        setError(null)
      }
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const dispatch = useCallback(async (showCommand: ShowCommand) => {
    try {
      const result = await runtime.dispatch(showCommand)
      setSnapshot(result.snapshot)
      if (!result.accepted) setError(result.reason ?? 'That action was not accepted.')
      else setError(null)
      return result
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return null
    }
  }, [])

  return { snapshot, error, dispatch }
}
