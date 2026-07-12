import gsap from 'gsap'
import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react'
import { RocketIcon } from '../components/RocketIcon'
import type { StageFinaleView, StageTeamView } from './types'

interface FinaleOverlayProps {
  finale: StageFinaleView
  teams: readonly StageTeamView[]
  reducedMotion?: boolean
}

export function FinaleOverlay({ finale, teams, reducedMotion = false }: FinaleOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const byId = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])
  const winners = (finale.winnerTeamIds ?? []).map((id) => byId.get(id)).filter((team): team is StageTeamView => Boolean(team))
  const active = (finale.activeTeamIds ?? []).map((id) => byId.get(id)).filter((team): team is StageTeamView => Boolean(team))
  const activeHasMishap = active.some((team) => finale.mishapTeamIds?.includes(team.id))
  const ranking = [...teams].sort((left, right) => right.score - left.score || left.name.localeCompare(right.name))
  const rankedStandings = ranking.reduce<Array<{ team: StageTeamView; rank: number }>>(
    (ordered, team, index) => {
      const prior = ordered.at(-1)
      ordered.push({
        team,
        rank: prior && prior.team.score === team.score ? prior.rank : index + 1,
      })
      return ordered
    },
    [],
  )

  useLayoutEffect(() => {
    if (!rootRef.current || reducedMotion) return undefined
    const context = gsap.context(() => {
      if (finale.status === 'countdown') {
        gsap.fromTo('.finale-countdown-number', { scale: 1.75, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.62, ease: 'back.out(2)' })
      }
      if (finale.status === 'results') {
        gsap.timeline()
          .fromTo('.winner-rays', { rotate: -15, scale: 0.3, opacity: 0 }, { rotate: 0, scale: 1, opacity: 1, duration: 0.9, ease: 'power3.out' })
          .fromTo('.finale-results-card', { y: 70, scale: 0.86, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.65, ease: 'back.out(1.5)' }, '<.1')
          .fromTo('.finale-standing', { x: -25, opacity: 0 }, { x: 0, opacity: 1, stagger: 0.07, duration: 0.35 }, '-=.2')
      }
    }, rootRef)
    return () => context.revert()
  }, [finale.countdown, finale.status, reducedMotion])

  if (finale.status === 'idle') return null

  if (finale.status === 'countdown') {
    return (
      <div ref={rootRef} className="finale-overlay finale-overlay--countdown" role="status" aria-live="assertive">
        <div className="finale-countdown-ring">
          <span className="finale-countdown-kicker">All systems ready</span>
          <strong className="finale-countdown-number">{finale.countdown ?? 'GO'}</strong>
          <span className="finale-countdown-label">Launch sequence</span>
        </div>
      </div>
    )
  }

  if (finale.status === 'results') {
    const winnerLabel = winners.length > 1 ? 'Co-winners' : 'Mission champion'
    return (
      <div ref={rootRef} className="finale-overlay finale-overlay--results" role="status" aria-live="assertive">
        <div className="winner-rays" aria-hidden="true" />
        <section className={`finale-results-card${winners.length > 5 ? ' finale-results-card--many-winners' : ''}`}>
          <p className="finale-results-kicker">{winnerLabel}</p>
          <div className="finale-winners">
            {winners.map((team) => (
              <div key={team.id} className="finale-winner" style={{ '--team-color': team.color } as CSSProperties}>
                <span className="finale-winner-icon"><RocketIcon name={team.icon} /></span>
                <span>{team.name}</span>
                <strong>{team.score}</strong>
              </div>
            ))}
          </div>
          {winners.length === 0 && <h2>{finale.headline ?? 'Mission complete!'}</h2>}
          <ol className="finale-standings" aria-label="Final standings">
            {rankedStandings.map(({ team, rank }) => (
              <li key={team.id} className="finale-standing">
                <span className="finale-standing-rank">{rank}</span>
                <span className="finale-standing-swatch" style={{ backgroundColor: team.color }} />
                <span className="finale-standing-name">{team.name}</span>
                <strong>{team.score}</strong>
              </li>
            ))}
          </ol>
          <p className="finale-results-footer">Every crew made this mission extraordinary.</p>
        </section>
      </div>
    )
  }

  if (active.length === 0) return null

  return (
    <div ref={rootRef} className={`finale-launch-callout${activeHasMishap ? ' finale-launch-callout--mishap' : ''}`} role="status" aria-live="polite">
      <span>{activeHasMishap ? 'Parachutes ready!' : active.length > 1 ? 'Tied launch!' : 'Cleared for launch'}</span>
      <strong>{active.map((team) => team.name).join(' + ')}</strong>
    </div>
  )
}
