import gsap from 'gsap'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type {
  RocketFinalePhase,
  StageRocketModel,
  StageScoreViewConfig,
  StageTeamView,
} from '../stage/types'
import { clampStageScore, makeStageTicks } from '../stage/types'
import { RocketIcon } from './RocketIcon'

export interface RocketStageProps {
  team: StageTeamView
  scoreConfig: StageScoreViewConfig
  selected?: boolean
  finalePhase?: RocketFinalePhase
  launchPower?: number
  reducedMotion?: boolean
  paused?: boolean
  compact?: boolean
}

export interface RocketFinaleThrustProfile {
  power: number
  length: number
  flickerLength: number
  width: number
  flickerWidth: number
}

export interface RocketTankGeometry {
  top: number
  height: number
  left: number
  width: number
  radius: number
  bezelTop: number
  bezelHeight: number
  bezelLeft: number
  bezelWidth: number
  bezelRadius: number
  glintPath: string
}

/**
 * Convert the finale's 0.55-1 launch-power factor into an intentionally
 * theatrical plume. Length still follows the same power ratio as ascent
 * speed, but the 3.6 multiplier makes every successful launch read as full
 * thrust rather than the small flame used while the rockets idle on the pad.
 */
export const rocketFinaleThrustProfile = (launchPower: number): RocketFinaleThrustProfile => {
  const power = Math.min(1, Math.max(0.55, launchPower || 1))
  const length = 3.6 * power
  const width = 1.06 + 0.25 * power

  return {
    power,
    length,
    flickerLength: length * 0.91,
    width,
    flickerWidth: width * 0.93,
  }
}

/**
 * Keep the gauge centered at x=140 while fitting it to each handcrafted hull.
 * Scout retains the original generous tank; Booster and Orbiter use narrower,
 * slightly shorter tanks so the bezel stays inside their central fuselages.
 */
const ROCKET_TANK_GEOMETRY: Readonly<Record<StageRocketModel, Readonly<RocketTankGeometry>>> = {
  scout: {
    top: 116,
    height: 174,
    left: 96,
    width: 88,
    radius: 27,
    bezelTop: 108,
    bezelHeight: 190,
    bezelLeft: 89,
    bezelWidth: 102,
    bezelRadius: 35,
    glintPath: 'M112 125c-8 39-7 103 0 145',
  },
  booster: {
    top: 122,
    height: 156,
    left: 106,
    width: 68,
    radius: 21,
    bezelTop: 114,
    bezelHeight: 172,
    bezelLeft: 100,
    bezelWidth: 80,
    bezelRadius: 28,
    glintPath: 'M118 133c-6 34-5 91 0 132',
  },
  orbiter: {
    top: 120,
    height: 158,
    left: 104,
    width: 72,
    radius: 22,
    bezelTop: 112,
    bezelHeight: 174,
    bezelLeft: 98,
    bezelWidth: 84,
    bezelRadius: 29,
    glintPath: 'M116 131c-6 35-5 92 0 134',
  },
}

export const rocketTankGeometry = (model: StageRocketModel): Readonly<RocketTankGeometry> => (
  ROCKET_TANK_GEOMETRY[model]
)

const RESERVE_TOP = 151
const RESERVE_HEIGHT = 126

function RocketShell({ model }: { model: StageRocketModel }) {
  if (model === 'booster') {
    return (
      <g className="rocket-shell rocket-shell--booster">
        <path className="rocket-metal rocket-metal--shadow" d="M108 85Q113 42 140 17q27 25 32 68l10 199q1 26-19 49h-46q-20-23-19-49l10-199Z" />
        <path className="rocket-metal rocket-metal--light" d="M140 17q27 25 32 68l5 98h-37V17Z" />
        <path className="rocket-outline" d="M108 85Q113 42 140 17q27 25 32 68l10 199q1 26-19 49h-46q-20-23-19-49l10-199Z" />
        <path className="rocket-accent" d="M105 88h70l2 30h-74l2-30Zm-3 189h80l1 25h-82l1-25Z" />
        <path className="rocket-metal rocket-sidepod" d="M76 174q0-18 14-25 14 7 14 25v118H76V174Zm100 0q0-18 14-25 14 7 14 25v118h-28V174Z" />
        <path className="rocket-accent rocket-sidepod-accent" d="M76 253h28v24H76zm100 0h28v24h-28z" />
        <path className="rocket-outline" d="M76 174q0-18 14-25 14 7 14 25v118H76V174Zm100 0q0-18 14-25 14 7 14 25v118h-28V174Z" />
        <path className="rocket-fin" d="m101 255-33 82h48l9-43-24-39Zm78 0 33 82h-48l-9-43 24-39Z" />
        <path className="rocket-outline" d="m101 255-33 82h48l9-43m54-39 33 82h-48l-9-43" />
        <path className="rocket-port" d="M124 59a16 16 0 1 1 32 0 16 16 0 0 1-32 0Z" />
        <path className="rocket-port-glint" d="M131 52a10 10 0 0 1 14-6" />
        <path className="rocket-nozzle" d="M113 325h54l10 24h-74l10-24Z" />
      </g>
    )
  }

  if (model === 'orbiter') {
    return (
      <g className="rocket-shell rocket-shell--orbiter">
        <path className="rocket-metal rocket-metal--shadow" d="M140 16c-23 28-38 72-40 123l-5 145q0 31 22 51h46q22-20 22-51l-5-145c-2-51-17-95-40-123Z" />
        <path className="rocket-metal rocket-metal--light" d="M140 16c23 28 38 72 40 123l4 112-44-14V16Z" />
        <path className="rocket-outline" d="M140 16c-23 28-38 72-40 123l-5 145q0 31 22 51h46q22-20 22-51l-5-145c-2-51-17-95-40-123Z" />
        <path className="rocket-wing" d="m103 195-57 117 56-14 25-54-24-49Zm74 0 57 117-56-14-25-54 24-49Z" />
        <path className="rocket-outline rocket-outline--orbiter-wing" d="m103 195-57 117 56-14 25-54m50-49 57 117-56-14-25-54" />
        <path className="rocket-accent" d="M104 91h72l3 28h-78l3-28Zm-7 190 43-13 43 13-5 30-38-13-38 13-5-30Z" />
        <path className="rocket-canopy" d="M117 69q23-35 46 0l7 27h-60l7-27Z" />
        <path className="rocket-canopy-glint" d="M127 68q12-15 25-2" />
        <path className="rocket-nozzle" d="M113 327h54l8 23h-70l8-23Z" />
      </g>
    )
  }

  return (
    <g className="rocket-shell rocket-shell--scout">
      <path className="rocket-metal rocket-metal--shadow" d="M140 16C96 53 83 111 86 184l7 113q2 28 24 39h46q22-11 24-39l7-113c3-73-10-131-54-168Z" />
      <path className="rocket-metal rocket-metal--light" d="M140 16c44 37 57 95 54 168l-7 113q-2 28-24 39h-23V16Z" />
      <path className="rocket-outline" d="M140 16C96 53 83 111 86 184l7 113q2 28 24 39h46q22-11 24-39l7-113c3-73-10-131-54-168Z" />
      <path className="rocket-accent" d="M95 90h90l5 27H90l5-27Zm-2 196h94l-4 27H97l-4-27Z" />
      <path className="rocket-fin" d="m95 247-46 91h66l17-57-37-34Zm90 0 46 91h-66l-17-57 37-34Z" />
      <path className="rocket-outline" d="m95 247-46 91h66l17-57m53-34 46 91h-66l-17-57" />
      <circle className="rocket-port" cx="140" cy="59" r="19" />
      <path className="rocket-port-glint" d="M130 54a12 12 0 0 1 17-7" />
      <path className="rocket-nozzle" d="M112 328h56l11 23h-78l11-23Z" />
    </g>
  )
}

export function RocketStage({
  team,
  scoreConfig,
  selected = false,
  finalePhase = 'idle',
  launchPower = 1,
  reducedMotion = false,
  paused = false,
  compact = false,
}: RocketStageProps) {
  const reactId = useId().replace(/:/g, '')
  const vehicleRef = useRef<HTMLDivElement>(null)
  const mainFuelRef = useRef<SVGRectElement>(null)
  const reserveFuelRef = useRef<SVGRectElement>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const pausedRef = useRef(paused)
  const previousFinalePhaseRef = useRef(finalePhase)
  const previousScoreRef = useRef(team.score)
  const burstCounterRef = useRef(0)
  const [scoreBurst, setScoreBurst] = useState<{ id: number; delta: number } | null>(null)

  const tankGeometry = rocketTankGeometry(team.model)
  const capacity = Math.max(1, Math.round(scoreConfig.capacity))
  const clampedScore = clampStageScore(team.score, { ...scoreConfig, capacity })
  const mainRatio = Math.min(clampedScore, capacity) / capacity
  const reserveRatio = scoreConfig.overflow
    ? Math.max(0, clampedScore - capacity) / capacity
    : 0
  const mainFuelY = tankGeometry.top + tankGeometry.height * (1 - mainRatio)
  const reserveFuelY = RESERVE_TOP + RESERVE_HEIGHT * (1 - reserveRatio)
  const ticks = useMemo(() => makeStageTicks({ ...scoreConfig, capacity }), [
    capacity,
    scoreConfig.majorInterval,
    scoreConfig.maxLabel,
    scoreConfig.minorSubdivisions,
    scoreConfig.overflow,
  ])
  const majorTicks = ticks.filter((tick) => tick.kind === 'major')
  const labelStride = Math.max(1, Math.ceil(majorTicks.length / 8))
  const thrust = rocketFinaleThrustProfile(launchPower)
  const safePower = thrust.power

  useLayoutEffect(() => {
    const previous = previousScoreRef.current
    if (previous === team.score) return

    const previousClampedScore = clampStageScore(previous, { ...scoreConfig, capacity })
    const previousMainRatio = Math.min(previousClampedScore, capacity) / capacity
    const previousReserveRatio = scoreConfig.overflow
      ? Math.max(0, previousClampedScore - capacity) / capacity
      : 0

    const duration = reducedMotion ? 0.01 : 0.72
    if (mainFuelRef.current) {
      gsap.fromTo(
        mainFuelRef.current,
        {
          attr: {
            y: tankGeometry.top + tankGeometry.height * (1 - previousMainRatio),
            height: tankGeometry.height * previousMainRatio,
          },
        },
        {
          attr: { y: mainFuelY, height: tankGeometry.height * mainRatio },
          duration,
          ease: 'power2.out',
          overwrite: true,
        },
      )
    }
    if (reserveFuelRef.current) {
      gsap.fromTo(
        reserveFuelRef.current,
        {
          attr: {
            y: RESERVE_TOP + RESERVE_HEIGHT * (1 - previousReserveRatio),
            height: RESERVE_HEIGHT * previousReserveRatio,
          },
        },
        {
          attr: { y: reserveFuelY, height: RESERVE_HEIGHT * reserveRatio },
          duration,
          ease: 'power2.out',
          overwrite: true,
        },
      )
    }

    if (!reducedMotion && vehicleRef.current) {
      gsap.fromTo(
        vehicleRef.current.querySelector('.rocket-scoreplate'),
        { scale: 1.16 },
        { scale: 1, duration: 0.5, ease: 'back.out(2.5)', overwrite: true },
      )
    }

    burstCounterRef.current += 1
    setScoreBurst({ id: burstCounterRef.current, delta: team.score - previous })
    previousScoreRef.current = team.score
    const timeout = globalThis.setTimeout(() => setScoreBurst(null), reducedMotion ? 500 : 1250)
    return () => globalThis.clearTimeout(timeout)
  }, [
    mainFuelY,
    mainRatio,
    capacity,
    reducedMotion,
    reserveFuelY,
    reserveRatio,
    scoreConfig,
    tankGeometry,
    team.score,
  ])

  useLayoutEffect(() => {
    const vehicle = vehicleRef.current
    if (!vehicle) return undefined

    const priorPhase = previousFinalePhaseRef.current
    previousFinalePhaseRef.current = finalePhase
    // The coordinator may announce the next group before a slower rocket has
    // completely left frame. Let an already-started launch/soft-landing finish
    // naturally instead of snapping the previous group off screen.
    if (
      (priorPhase === 'active' && finalePhase === 'launched') ||
      (priorPhase === 'mishap' && finalePhase === 'landed')
    ) return undefined

    timelineRef.current?.kill()
    const parachute = vehicle.querySelector('.rocket-parachute')
    const flame = vehicle.querySelector('.rocket-flame-wrap')
    const timeline = gsap.timeline({ paused: pausedRef.current })
    timelineRef.current = timeline

    gsap.killTweensOf(vehicle)
    if (parachute) gsap.killTweensOf(parachute)
    if (flame) gsap.killTweensOf(flame)

    if (finalePhase === 'launched') {
      gsap.set(vehicle, { y: '-115vh', rotation: 0, opacity: 0 })
    } else if (finalePhase === 'landed') {
      gsap.set(vehicle, { y: 18, rotation: 7, opacity: 1 })
      if (parachute) gsap.set(parachute, { opacity: 1, scale: 1, transformOrigin: '50% 100%' })
    } else if (finalePhase === 'active') {
      gsap.set(vehicle, { y: 0, rotation: 0, opacity: 1 })
      timeline
        .to(vehicle, {
          y: reducedMotion ? -8 : -13,
          duration: reducedMotion ? 0.12 : 0.08,
          repeat: reducedMotion ? 0 : 5,
          yoyo: true,
          ease: 'sine.inOut',
        })
        .to(vehicle, {
          y: reducedMotion ? '-105vh' : '-122vh',
          opacity: reducedMotion ? 0 : 1,
          // Match the authoritative finale plan's 6s / power ascent budget so
          // slower-ranked rockets visibly use the time between launch groups.
          duration: reducedMotion ? 0.35 : 6 / safePower,
          ease: 'power3.in',
        })
    } else if (finalePhase === 'mishap') {
      gsap.set(vehicle, { y: 0, rotation: 0, opacity: 1 })
      if (parachute) gsap.set(parachute, { opacity: 0, scale: 0.3, transformOrigin: '50% 100%' })
      timeline
        .to(vehicle, {
          y: reducedMotion ? -12 : -7,
          x: reducedMotion ? 0 : 3,
          duration: reducedMotion ? 0.08 : 0.08 / safePower,
          repeat: reducedMotion ? 0 : 7,
          yoyo: true,
          ease: 'steps(2)',
        })
        .to(vehicle, { y: reducedMotion ? -35 : -88, x: 5, rotation: 5, duration: reducedMotion ? 0.3 : 0.9 / safePower, ease: 'power2.out' })
        .to(vehicle, { y: reducedMotion ? 12 : 8, x: 18, rotation: reducedMotion ? 8 : 62, duration: reducedMotion ? 0.35 : 0.75 / safePower, ease: 'power2.in' })

      if (parachute) {
        timeline.to(parachute, { opacity: 1, scale: 1, duration: reducedMotion ? 0.15 : 0.35, ease: 'back.out(2)' }, '<-.2')
      }
      timeline.to(vehicle, { y: 18, rotation: 7, duration: reducedMotion ? 0.2 : 1.1 / safePower, ease: 'power1.out' })
    } else {
      gsap.set(vehicle, { y: 0, x: 0, rotation: 0, opacity: 1 })
      if (parachute) gsap.set(parachute, { opacity: 0, scale: 0.3 })
    }

  }, [finalePhase, reducedMotion, safePower])

  useEffect(() => () => {
    timelineRef.current?.kill()
    timelineRef.current = null
  }, [])

  useEffect(() => {
    pausedRef.current = paused
    timelineRef.current?.paused(paused)
  }, [paused])

  const style = {
    '--team-color': team.color,
    '--launch-power': safePower,
    '--launch-thrust-length': thrust.length,
    '--launch-thrust-length-flicker': thrust.flickerLength,
    '--launch-thrust-width': thrust.width,
    '--launch-thrust-width-flicker': thrust.flickerWidth,
  } as CSSProperties

  return (
    <article
      className={`rocket-card${selected ? ' rocket-card--selected' : ''}${compact ? ' rocket-card--compact' : ''}`}
      data-model={team.model}
      data-phase={finalePhase}
      style={style}
      aria-label={`${team.name}: ${clampedScore} points`}
    >
      <header className="rocket-team-label">
        <span className="rocket-team-index" aria-hidden="true">
          <RocketIcon name={team.icon} />
        </span>
        <span className="rocket-team-name" title={team.name}>{team.name}</span>
      </header>

      <div ref={vehicleRef} className="rocket-vehicle-wrap">
        <div className="rocket-parachute" aria-hidden="true">
          <svg viewBox="0 0 180 100">
            <path className="parachute-canopy" d="M13 57C17 19 48 4 90 4s73 15 77 53c-14-8-27-8-39 0-13-8-25-8-38 0-13-8-25-8-38 0-12-8-25-8-39 0Z" />
            <path d="M13 57 76 94m91-37-63 37M52 57l30 37m46-37-30 37M90 57v37" className="parachute-lines" />
          </svg>
        </div>

        <svg className="rocket-svg" viewBox="0 0 280 430" role="img" aria-labelledby={`${reactId}-title ${reactId}-desc`}>
          <title id={`${reactId}-title`}>{team.name} {team.model} rocket</title>
          <desc id={`${reactId}-desc`}>Fuel tank at {clampedScore} of {scoreConfig.overflow ? capacity * 2 : capacity} points</desc>
          <defs>
            <linearGradient id={`${reactId}-metal`} x1="0" x2="1">
              <stop offset="0" stopColor="#8493a3" />
              <stop offset=".24" stopColor="#edf7ff" />
              <stop offset=".52" stopColor="#fff" />
              <stop offset=".78" stopColor="#cad8e4" />
              <stop offset="1" stopColor="#657383" />
            </linearGradient>
            <linearGradient id={`${reactId}-fuel`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff" stopOpacity=".78" />
              <stop offset=".12" stopColor={team.color} />
              <stop offset=".72" stopColor={team.color} />
              <stop offset="1" stopColor="#070b1a" stopOpacity=".62" />
            </linearGradient>
            <linearGradient id={`${reactId}-glass`} x1="0" x2="1">
              <stop offset="0" stopColor="#bdeeff" stopOpacity=".12" />
              <stop offset=".45" stopColor="#e7faff" stopOpacity=".35" />
              <stop offset="1" stopColor="#5ab9e8" stopOpacity=".08" />
            </linearGradient>
            <radialGradient id={`${reactId}-flame`} cx="50%" cy="0%" r="90%">
              <stop offset="0" stopColor="#fff" />
              <stop offset=".22" stopColor="#fff7a1" />
              <stop offset=".58" stopColor="#ff9a1f" />
              <stop offset="1" stopColor="#ff3c3c" stopOpacity="0" />
            </radialGradient>
            <clipPath id={`${reactId}-tank-clip`}>
              <rect
                x={tankGeometry.left}
                y={tankGeometry.top}
                width={tankGeometry.width}
                height={tankGeometry.height}
                rx={tankGeometry.radius}
              />
            </clipPath>
            <clipPath id={`${reactId}-reserve-clip`}>
              <rect x="222" y={RESERVE_TOP} width="29" height={RESERVE_HEIGHT} rx="13" />
            </clipPath>
            <filter id={`${reactId}-fuel-glow`} x="-70%" y="-30%" width="240%" height="170%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <g className="rocket-flame-wrap" aria-hidden="true">
            <path className="rocket-flame rocket-flame--outer" fill={`url(#${reactId}-flame)`} d="M112 344c-5 30 6 55 28 80 22-25 33-50 28-80h-56Z" />
            <path className="rocket-flame rocket-flame--inner" d="M124 345c0 20 5 36 16 50 11-14 16-30 16-50h-32Z" />
            {team.model === 'booster' && (
              <>
                <path className="rocket-flame rocket-flame--pod" d="M78 288c-3 21 1 37 12 53 11-16 15-32 12-53H78Z" />
                <path className="rocket-flame rocket-flame--pod" d="M178 288c-3 21 1 37 12 53 11-16 15-32 12-53h-24Z" />
              </>
            )}
          </g>

          <RocketShell model={team.model} />

          <g className="rocket-tank">
            <rect
              className="tank-bezel"
              x={tankGeometry.bezelLeft}
              y={tankGeometry.bezelTop}
              width={tankGeometry.bezelWidth}
              height={tankGeometry.bezelHeight}
              rx={tankGeometry.bezelRadius}
            />
            <g clipPath={`url(#${reactId}-tank-clip)`}>
              <rect className="tank-depth" x={tankGeometry.left} y={tankGeometry.top} width={tankGeometry.width} height={tankGeometry.height} />
              <rect
                ref={mainFuelRef}
                className="tank-fuel"
                x={tankGeometry.left}
                y={mainFuelY}
                width={tankGeometry.width}
                height={tankGeometry.height * mainRatio}
                fill={`url(#${reactId}-fuel)`}
                filter={`url(#${reactId}-fuel-glow)`}
              />
              <ellipse className="tank-fuel-surface" cx="140" cy={mainFuelY} rx={tankGeometry.width / 2} ry="5" />
              <rect className="tank-glass" x={tankGeometry.left} y={tankGeometry.top} width={tankGeometry.width} height={tankGeometry.height} fill={`url(#${reactId}-glass)`} />
              <path className="tank-glint" d={tankGeometry.glintPath} />
            </g>
            <rect className="tank-outline" x={tankGeometry.left} y={tankGeometry.top} width={tankGeometry.width} height={tankGeometry.height} rx={tankGeometry.radius} />

            {ticks.map((tick, index) => {
              const y = tankGeometry.top + tankGeometry.height * (1 - tick.ratio)
              const majorIndex = tick.kind === 'major' ? majorTicks.findIndex((item) => item.value === tick.value) : -1
              const showLabel = tick.kind === 'major' && (
                majorTicks.length <= 9 ||
                majorIndex === 0 ||
                majorIndex === majorTicks.length - 1 ||
                majorIndex % labelStride === 0
              )
              return (
                <g key={`${tick.value}-${index}`} className={`tank-tick tank-tick--${tick.kind}`}>
                  <path d={`M${tick.kind === 'major' ? tankGeometry.left - 4 : tankGeometry.left} ${y}h${tick.kind === 'major' ? 17 : 10}`} />
                  {showLabel && <text x={tankGeometry.left - 9} y={y + 3.5} textAnchor="end" style={tick.value === capacity && (tick.label?.length ?? 0) > 6 ? { fontSize: Math.max(4.5, 10 - ((tick.label?.length ?? 6) - 6) * 0.42) } : undefined}>{tick.label}</text>}
                </g>
              )
            })}
          </g>

          {scoreConfig.overflow && (
            <g className={`reserve-tank${reserveRatio > 0 ? ' reserve-tank--active' : ''}`}>
              <path
                className="reserve-hose"
                d={`M${tankGeometry.left + tankGeometry.width} ${tankGeometry.top + 20}C${tankGeometry.left + tankGeometry.width + 22} ${tankGeometry.top + 18} 215 142 224 157`}
              />
              <rect className="reserve-frame" x="216" y="143" width="41" height="142" rx="18" />
              <g clipPath={`url(#${reactId}-reserve-clip)`}>
                <rect className="tank-depth" x="222" y={RESERVE_TOP} width="29" height={RESERVE_HEIGHT} />
                <rect
                  ref={reserveFuelRef}
                  className="tank-fuel"
                  x="222"
                  y={reserveFuelY}
                  width="29"
                  height={RESERVE_HEIGHT * reserveRatio}
                  fill={`url(#${reactId}-fuel)`}
                />
                <ellipse className="tank-fuel-surface" cx="236.5" cy={reserveFuelY} rx="14.5" ry="3" />
                <path className="tank-glint" d="M228 158v101" />
              </g>
              <rect className="tank-outline" x="222" y={RESERVE_TOP} width="29" height={RESERVE_HEIGHT} rx="13" />
              <text className="reserve-label" x="236.5" y="137" textAnchor="middle">RESERVE</text>
              <text className="reserve-cap" x="236.5" y="301" textAnchor="middle">2×</text>
            </g>
          )}

          <g className="rocket-hull-badge">
            <circle cx="140" cy="316" r="22" />
            <RocketIcon name={team.icon} x="126" y="302" width="28" height="28" />
          </g>
        </svg>

        <div className="rocket-scoreplate" aria-live="polite" aria-atomic="true">
          <span className="rocket-score-value">{clampedScore}</span>
          <span className="rocket-score-unit">pts</span>
          <span className="rocket-score-cap">/{scoreConfig.overflow ? capacity * 2 : capacity}</span>
        </div>
        {scoreBurst && (
          <span key={scoreBurst.id} className={`rocket-score-burst${scoreBurst.delta < 0 ? ' rocket-score-burst--negative' : ''}`}>
            {scoreBurst.delta > 0 ? '+' : ''}{scoreBurst.delta}
          </span>
        )}
      </div>
    </article>
  )
}
