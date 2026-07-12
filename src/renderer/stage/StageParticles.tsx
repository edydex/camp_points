import 'pixi.js/unsafe-eval'
import { Application, Graphics, type Ticker } from 'pixi.js'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

interface StageParticlesProps {
  level: 'full' | 'low' | 'off'
  celebrating?: boolean
  launching?: boolean
  paused?: boolean
}

interface MovingParticle {
  graphic: Graphics
  vx: number
  vy: number
  spin: number
  kind: 'star' | 'dust' | 'exhaust' | 'confetti'
}

const seeded = (index: number, salt: number): number => {
  const value = Math.sin(index * 91.17 + salt * 37.41) * 43758.5453
  return value - Math.floor(value)
}

const palette = [0x5de8ff, 0x936dff, 0xffd45b, 0xff5e8a, 0x6bffba]

/**
 * Pixi owns only the decorative canvas. If WebGL cannot initialize (old GPU,
 * remote desktop, test DOM), the deterministic DOM layer beneath it remains
 * visible, so scores and motion never depend on graphics acceleration.
 */
export function StageParticles({
  level,
  celebrating = false,
  launching = false,
  paused = false,
}: StageParticlesProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const [webglReady, setWebglReady] = useState(false)
  const starCount = level === 'full' ? 72 : level === 'low' ? 24 : 0
  const dustCount = level === 'full' ? 16 : level === 'low' ? 5 : 0
  const exhaustCount = launching ? (level === 'full' ? 28 : level === 'low' ? 9 : 0) : 0
  const confettiCount = celebrating ? (level === 'full' ? 58 : level === 'low' ? 18 : 0) : 0

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host || level === 'off') {
      setWebglReady(false)
      return undefined
    }

    let disposed = false
    let application: Application | null = null
    let initialized = false

    void (async () => {
      try {
        const app = new Application()
        application = app
        await app.init({
          resizeTo: host,
          backgroundAlpha: 0,
          antialias: false,
          autoDensity: true,
          resolution: Math.min(globalThis.devicePixelRatio || 1, 2),
          preference: 'webgl',
          powerPreference: 'high-performance',
        })
        initialized = true
        if (disposed) {
          app.destroy(true, { children: true })
          return
        }

        app.canvas.className = 'stage-pixi-canvas'
        app.canvas.setAttribute('aria-hidden', 'true')
        host.replaceChildren(app.canvas)
        const particles: MovingParticle[] = []
        const width = Math.max(1, app.renderer.width)
        const height = Math.max(1, app.renderer.height)

        for (let index = 0; index < starCount; index += 1) {
          const radius = 0.7 + seeded(index, 3) * 2.2
          const graphic = new Graphics()
            .circle(0, 0, radius)
            .fill({ color: 0xffffff, alpha: 0.25 + seeded(index, 6) * 0.72 })
          graphic.x = seeded(index, 1) * width
          graphic.y = seeded(index, 2) * height
          graphic.scale.set(0.7 + seeded(index, 4) * 0.8)
          app.stage.addChild(graphic)
          particles.push({ graphic, vx: -0.018 - seeded(index, 8) * 0.035, vy: 0, spin: 0, kind: 'star' })
        }

        for (let index = 0; index < dustCount; index += 1) {
          const radius = 35 + seeded(index, 13) * 90
          const graphic = new Graphics()
            .circle(0, 0, radius)
            .fill({ color: palette[index % palette.length], alpha: 0.018 + seeded(index, 16) * 0.035 })
          graphic.x = seeded(index, 11) * width
          graphic.y = seeded(index, 12) * height
          app.stage.addChild(graphic)
          particles.push({ graphic, vx: 0.02 + seeded(index, 18) * 0.06, vy: -0.01, spin: 0, kind: 'dust' })
        }

        for (let index = 0; index < exhaustCount; index += 1) {
          const radius = 2 + seeded(index, 31) * 6
          const graphic = new Graphics()
            .circle(0, 0, radius)
            .fill({ color: index % 3 === 0 ? 0xffffff : 0xffad32, alpha: 0.22 + seeded(index, 32) * 0.42 })
          graphic.x = seeded(index, 33) * width
          graphic.y = height * (0.74 + seeded(index, 34) * 0.3)
          app.stage.addChild(graphic)
          particles.push({ graphic, vx: (seeded(index, 35) - 0.5) * 0.8, vy: -0.7 - seeded(index, 36) * 1.8, spin: 0, kind: 'exhaust' })
        }

        for (let index = 0; index < confettiCount; index += 1) {
          const size = 4 + seeded(index, 22) * 8
          const graphic = new Graphics()
            .roundRect(-size / 2, -size / 3, size, size * 0.65, 1.5)
            .fill({ color: palette[index % palette.length], alpha: 0.9 })
          graphic.x = seeded(index, 21) * width
          graphic.y = -seeded(index, 23) * height
          app.stage.addChild(graphic)
          particles.push({
            graphic,
            vx: (seeded(index, 27) - 0.5) * 0.9,
            vy: 0.75 + seeded(index, 24) * 1.45,
            spin: (seeded(index, 26) - 0.5) * 0.12,
            kind: 'confetti',
          })
        }

        const tick = (ticker: Ticker): void => {
          const delta = ticker.deltaTime
          const currentWidth = Math.max(1, app.renderer.width)
          const currentHeight = Math.max(1, app.renderer.height)
          for (const particle of particles) {
            particle.graphic.x += particle.vx * delta
            particle.graphic.y += particle.vy * delta
            particle.graphic.rotation += particle.spin * delta

            if (particle.graphic.x < -150) particle.graphic.x = currentWidth + 150
            if (particle.graphic.x > currentWidth + 150) particle.graphic.x = -150
            if (particle.kind === 'confetti' && particle.graphic.y > currentHeight + 20) {
              particle.graphic.y = -20
              particle.graphic.x = seeded(Math.round(particle.graphic.x), 41) * currentWidth
            }
            if (particle.kind === 'exhaust' && particle.graphic.y < currentHeight * 0.4) {
              particle.graphic.y = currentHeight + 12
              particle.graphic.x = seeded(Math.round(particle.graphic.x), 42) * currentWidth
            }
          }
        }
        app.ticker.add(tick)
        if (paused) app.ticker.stop()
        setWebglReady(true)
      } catch (error) {
        console.warn('Pixi particle renderer unavailable; using DOM fallback.', error)
        if (!disposed) setWebglReady(false)
        if (application && initialized) application.destroy(true, { children: true })
        application = null
      }
    })()

    return () => {
      disposed = true
      setWebglReady(false)
      if (application && initialized) {
        application.destroy(true, { children: true })
        application = null
      }
      host.replaceChildren()
    }
  }, [confettiCount, dustCount, exhaustCount, level, paused, starCount])

  const stars = useMemo(() => Array.from({ length: starCount }, (_, index) => ({
    id: index,
    style: {
      '--particle-x': `${seeded(index, 1) * 100}%`,
      '--particle-y': `${seeded(index, 2) * 100}%`,
      '--particle-size': `${1 + seeded(index, 3) * 3.5}px`,
      '--particle-delay': `${-seeded(index, 4) * 8}s`,
      '--particle-duration': `${3.4 + seeded(index, 5) * 6}s`,
      '--particle-alpha': `${0.28 + seeded(index, 6) * 0.7}`,
    } as CSSProperties,
  })), [starCount])

  const dust = useMemo(() => Array.from({ length: dustCount }, (_, index) => ({
    id: index,
    style: {
      '--particle-x': `${seeded(index, 11) * 100}%`,
      '--particle-y': `${seeded(index, 12) * 100}%`,
      '--particle-size': `${50 + seeded(index, 13) * 150}px`,
      '--particle-delay': `${-seeded(index, 14) * 18}s`,
      '--particle-duration': `${14 + seeded(index, 15) * 20}s`,
      '--particle-alpha': `${0.05 + seeded(index, 16) * 0.11}`,
    } as CSSProperties,
  })), [dustCount])

  const confetti = useMemo(() => Array.from({ length: confettiCount }, (_, index) => ({
    id: index,
    style: {
      '--particle-x': `${seeded(index, 21) * 100}%`,
      '--particle-size': `${5 + seeded(index, 22) * 8}px`,
      '--particle-delay': `${seeded(index, 23) * 2.6}s`,
      '--particle-duration': `${2.8 + seeded(index, 24) * 3.4}s`,
      '--particle-hue': `${Math.round(seeded(index, 25) * 360)}`,
      '--particle-spin': `${Math.round(180 + seeded(index, 26) * 700)}deg`,
    } as CSSProperties,
  })), [confettiCount])

  if (level === 'off') return null

  return (
    <div className="stage-particles" aria-hidden="true">
      <div ref={canvasHostRef} className="stage-pixi-layer" />
      <div className={`stage-dom-particles${webglReady ? ' stage-dom-particles--hidden' : ''}`}>
        <div className="stage-dust">
          {dust.map((particle) => <i key={particle.id} style={particle.style} />)}
        </div>
        <div className="stage-stars">
          {stars.map((particle) => <i key={particle.id} style={particle.style} />)}
        </div>
        {confettiCount > 0 && (
          <div className="stage-confetti">
            {confetti.map((particle) => <i key={particle.id} style={particle.style} />)}
          </div>
        )}
      </div>
    </div>
  )
}
