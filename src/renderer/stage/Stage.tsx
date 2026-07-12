import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { RocketStage } from '../components/RocketStage'
import '../styles/stage.css'
import { AnnouncementOverlay } from './AnnouncementOverlay'
import { FinaleOverlay } from './FinaleOverlay'
import { StageParticles } from './StageParticles'
import { finalePhaseForTeam, type StageProps, type StageTeamView } from './types'

const splitTeamsIntoRows = (teams: readonly StageTeamView[]): readonly StageTeamView[][] => {
  if (teams.length <= 5) return [teams.slice()]
  const firstRowCount = Math.ceil(teams.length / 2)
  return [teams.slice(0, firstRowCount), teams.slice(firstRowCount)]
}

export function Stage({
  title = 'Rocket Fuel Mission',
  theme,
  teams,
  scoreConfig,
  selectedTeamId = null,
  announcement = null,
  finale = null,
  mode = 'projector',
  reducedMotion = false,
  particleLevel,
  lowParticles = false,
  muted = false,
  paused = false,
  showHud = true,
  controlDock,
  className = '',
}: StageProps) {
  const visibleTeams = useMemo(() => teams.slice(0, 10), [teams])
  const rows = useMemo(() => splitTeamsIntoRows(visibleTeams), [visibleTeams])
  const [dockVisible, setDockVisible] = useState(true)
  const dockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFinale = Boolean(finale && finale.status !== 'idle')
  const particles = particleLevel ?? (lowParticles ? 'low' : 'full')
  const compact = mode === 'preview' || visibleTeams.length >= 6

  const revealDock = useCallback(() => {
    if (mode !== 'mirrored' || !controlDock) return
    setDockVisible(true)
    if (dockTimerRef.current) globalThis.clearTimeout(dockTimerRef.current)
    dockTimerRef.current = globalThis.setTimeout(() => setDockVisible(false), 3200)
  }, [controlDock, mode])

  useEffect(() => {
    if (mode !== 'mirrored' || !controlDock) return undefined
    revealDock()
    return () => {
      if (dockTimerRef.current) globalThis.clearTimeout(dockTimerRef.current)
    }
  }, [controlDock, mode, revealDock])

  const style = {
    '--stage-team-count': visibleTeams.length,
    '--stage-row-count': rows.length,
  } as CSSProperties

  return (
    <main
      className={`rocket-stage rocket-stage--${theme} rocket-stage--${mode}${isFinale ? ' rocket-stage--finale' : ''}${paused ? ' rocket-stage--paused' : ''}${className ? ` ${className}` : ''}`}
      data-theme={theme}
      data-reduced-motion={reducedMotion ? 'true' : 'false'}
      data-team-count={visibleTeams.length}
      data-finale-status={finale?.status ?? 'idle'}
      style={style}
      onPointerMove={revealDock}
    >
      <div className="stage-backdrop" aria-hidden="true">
        <div className="stage-nebula stage-nebula--one" />
        <div className="stage-nebula stage-nebula--two" />
        <div className="stage-planet stage-planet--left" />
        <div className="stage-planet stage-planet--right" />
        <div className="stage-horizon" />
        <div className="stage-grid" />
        <div className="stage-vignette" />
      </div>

      <StageParticles
        level={particles}
        celebrating={finale?.status === 'results'}
        launching={finale?.status === 'launching' || finale?.status === 'countdown'}
        paused={paused || reducedMotion}
      />

      {showHud && (
        <header className="stage-hud">
          <div className="stage-title-lockup">
            <span className="stage-mission-mark" aria-hidden="true">
              <i /><i /><i />
            </span>
            <div className="stage-title-copy">
              <p>Camp mission control</p>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="stage-status-badges" aria-label="Stage status">
            {paused && <span className="stage-status-badge stage-status-badge--paused"><i /> Paused</span>}
            {muted && <span className="stage-status-badge stage-status-badge--muted"><i /> Muted</span>}
            <span className="stage-status-badge stage-status-badge--capacity">Tank max {scoreConfig.capacity}</span>
          </div>
        </header>
      )}

      <section className="stage-fleet" aria-label="Team scores">
        {visibleTeams.length === 0 ? (
          <div className="stage-empty-state">
            <span className="stage-empty-orbit" aria-hidden="true"><i /></span>
            <h2>Awaiting flight crews</h2>
            <p>Add at least two teams in Quick Setup.</p>
          </div>
        ) : rows.map((row, rowIndex) => (
          <div
            key={row.map((team) => team.id).join('-')}
            className="stage-rocket-row"
            data-row={rowIndex + 1}
            style={{
              '--stage-row-teams': row.length,
              '--stage-row-width': `${(row.length / Math.max(...rows.map((item) => item.length))) * 100}%`,
            } as CSSProperties}
          >
            {row.map((team) => (
              <RocketStage
                key={team.id}
                team={team}
                scoreConfig={scoreConfig}
                // Audience selection is intentional only when the controls
                // share the same screen. The clean projector Stage should not
                // pulse merely because the Presenter selected a team.
                selected={mode === 'mirrored' && team.id === selectedTeamId}
                finalePhase={finalePhaseForTeam(team.id, finale)}
                launchPower={finale?.launchPowerByTeamId?.[team.id] ?? 1}
                reducedMotion={reducedMotion}
                paused={paused}
                compact={compact}
              />
            ))}
          </div>
        ))}
      </section>

      {announcement && <AnnouncementOverlay key={announcement.id} announcement={announcement} reducedMotion={reducedMotion} />}
      {finale && <FinaleOverlay finale={finale} teams={visibleTeams} reducedMotion={reducedMotion} />}

      {mode === 'mirrored' && controlDock && (
        <aside
          className={`stage-control-dock${dockVisible ? ' stage-control-dock--visible' : ''}`}
          onPointerEnter={revealDock}
          onFocusCapture={revealDock}
          aria-label="Stage controls"
        >
          <span className="stage-control-dock-handle" aria-hidden="true" />
          {controlDock}
        </aside>
      )}
    </main>
  )
}
