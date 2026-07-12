import {
  createDefaultShow,
  ShowEngine,
  type CommandResult,
  type EngineSnapshot,
  type ShowCommand,
  type StageMessage,
} from '../../shared'

type Listener<T> = (value: T) => void

/** Browser-only fallback used for visual development and the static preview. */
class LocalRuntime {
  private readonly engine = new ShowEngine(createDefaultShow())
  private snapshotListeners = new Set<Listener<EngineSnapshot>>()
  private stageListeners = new Set<Listener<StageMessage>>()

  async getSnapshot(): Promise<EngineSnapshot> {
    return this.engine.getSnapshot()
  }

  async dispatch(showCommand: ShowCommand): Promise<CommandResult> {
    const result = this.engine.dispatch(showCommand, 'presenter')
    const settled = result instanceof Promise ? await result : result
    for (const message of settled.messages) {
      for (const listener of this.stageListeners) listener(message)
    }
    for (const listener of this.snapshotListeners) listener(settled.snapshot)
    return settled
  }

  subscribeSnapshot(listener: Listener<EngineSnapshot>): () => void {
    this.snapshotListeners.add(listener)
    return () => this.snapshotListeners.delete(listener)
  }

  subscribeStageEvent(listener: Listener<StageMessage>): () => void {
    this.stageListeners.add(listener)
    return () => this.stageListeners.delete(listener)
  }
}

const fallback = new LocalRuntime()

export const runtime = {
  getSnapshot: (): Promise<EngineSnapshot> =>
    window.rocketFuel?.getSnapshot() ?? fallback.getSnapshot(),
  dispatch: (showCommand: ShowCommand): Promise<CommandResult> =>
    window.rocketFuel?.dispatch(showCommand) ?? fallback.dispatch(showCommand),
  subscribeSnapshot: (listener: Listener<EngineSnapshot>): (() => void) =>
    window.rocketFuel?.subscribeSnapshot(listener) ?? fallback.subscribeSnapshot(listener),
  subscribeStageEvent: (listener: Listener<StageMessage>): (() => void) =>
    window.rocketFuel?.subscribeStageEvent(listener) ?? fallback.subscribeStageEvent(listener),
}
