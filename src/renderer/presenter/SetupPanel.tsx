import { useEffect, useMemo, useState } from 'react'
import {
  createDefaultShow,
  type CommandResult,
  type EngineSnapshot,
  type RocketModel,
  type ShowCommand,
  type Team,
  type TeamIcon,
} from '../../shared'
import { commandId } from '../lib/commands'

const icons: TeamIcon[] = ['star', 'planet', 'comet', 'moon', 'satellite', 'alien', 'meteor', 'galaxy', 'sun', 'flag']
const models: Array<{ id: RocketModel; label: string; note: string }> = [
  { id: 'scout', label: 'Scout', note: 'Tall and quick' },
  { id: 'booster', label: 'Booster', note: 'Chunky twin engines' },
  { id: 'orbiter', label: 'Orbiter', note: 'Wide exploration craft' },
]

interface SetupPanelProps {
  snapshot: EngineSnapshot
  dispatch: (command: ShowCommand) => Promise<CommandResult | null>
}

export function SetupPanel({ snapshot, dispatch }: SetupPanelProps) {
  const [teams, setTeams] = useState(snapshot.teams)
  const [title, setTitle] = useState(snapshot.title)
  const [presets, setPresets] = useState(snapshot.scoreConfig.awardPresets.join(', '))
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!dirty) {
      setTeams(snapshot.teams)
      setTitle(snapshot.title)
      setPresets(snapshot.scoreConfig.awardPresets.join(', '))
    }
  }, [snapshot, dirty])

  const parsedPresets = useMemo(() => Array.from(new Set(presets
    .split(',')
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 100_000)))
    .slice(0, 5), [presets])

  const updateTeam = (index: number, patch: Partial<Team>) => {
    setTeams((current) => current.map((team, teamIndex) => teamIndex === index ? { ...team, ...patch } : team))
    setDirty(true)
  }

  const setTeamCount = (count: number) => {
    const safe = Math.min(10, Math.max(2, count))
    const defaults = createDefaultShow({ teamCount: safe }).teams
    setTeams((current) => Array.from({ length: safe }, (_, index) => current[index] ?? defaults[index]))
    setDirty(true)
  }

  const save = async () => {
    const lineupResult = await dispatch({ type: 'teams.replace', commandId: commandId(), teams } as ShowCommand)
    if (!lineupResult?.accepted) return
    const settingsResult = await dispatch({
      type: 'show.update',
      commandId: commandId(),
      patch: {
        title: title.trim() || 'Rocket Fuel Challenge',
        scoreConfig: { awardPresets: parsedPresets.length ? parsedPresets : [1] },
      },
    } as ShowCommand)
    if (settingsResult?.accepted) setDirty(false)
  }

  return (
    <div className="setup-stack">
      <section className="panel hero-settings">
        <div>
          <p className="eyebrow">Quick setup</p>
          <h2>Build the launch lineup</h2>
          <p className="panel-copy">Give every team a clear identity in the Cartoon Sci-Fi mission world.</p>
        </div>
        <label className="field title-field">
          <span>Camp / show title</span>
          <input value={title} maxLength={64} onChange={(event) => { setTitle(event.target.value); setDirty(true) }} />
          <small className="field-help">Shown at the top of the audience screen. You can also edit it directly in Run Show.</small>
        </label>
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Teams</p>
            <h3>{teams.length} rockets on the pad</h3>
          </div>
          <label className="compact-field">Rocket count
            <input type="number" min={2} max={10} value={teams.length} onChange={(event) => setTeamCount(Number(event.target.value))} />
          </label>
        </div>
        <div className="team-editor-grid">
          {teams.map((team, index) => (
            <article className="team-editor" key={team.id} style={{ '--team': team.color } as React.CSSProperties}>
              <header><span className="team-number">{index === 9 ? 0 : index + 1}</span><strong>{team.name || `Team ${index + 1}`}</strong></header>
              <label className="field"><span>Name</span><input maxLength={24} value={team.name} onChange={(event) => updateTeam(index, { name: event.target.value })} /></label>
              <div className="field-row">
                <label className="field color-field"><span>Color</span><input type="color" value={team.color} onChange={(event) => updateTeam(index, { color: event.target.value })} /></label>
                <label className="field"><span>Badge</span><select value={team.icon} onChange={(event) => updateTeam(index, { icon: event.target.value as TeamIcon })}>{icons.map((icon) => <option key={icon}>{icon}</option>)}</select></label>
              </div>
              <div className="model-switch" aria-label={`Rocket model for ${team.name}`}>
                {models.map((model) => <button key={model.id} className={team.rocketModel === model.id ? 'is-active' : ''} title={model.note} onClick={() => updateTeam(index, { rocketModel: model.id })}>{model.label}</button>)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel scale-panel">
        <div>
          <p className="eyebrow">Scoring presets</p>
          <h3>Fast, consistent awards</h3>
          <p className="panel-copy">Enter one to five positive whole numbers separated by commas.</p>
        </div>
        <label className="field"><span>Award buttons</span><input value={presets} onChange={(event) => { setPresets(event.target.value); setDirty(true) }} placeholder="1, 5, 10" /></label>
        <div className="preset-preview">{parsedPresets.map((preset) => <span key={preset}>+{preset}</span>)}</div>
      </section>

      <div className="sticky-save">
        <span>{dirty ? 'Unsaved setup changes' : 'Setup is saved automatically'}</span>
        <button className="primary-button" disabled={!dirty || parsedPresets.length === 0} onClick={() => void save()}>Save lineup</button>
      </div>
    </div>
  )
}
