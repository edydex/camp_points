import gsap from 'gsap'
import { useLayoutEffect, useRef } from 'react'
import type { StageAnnouncement } from './types'

interface AnnouncementOverlayProps {
  announcement: StageAnnouncement
  reducedMotion?: boolean
}

export function AnnouncementOverlay({ announcement, reducedMotion = false }: AnnouncementOverlayProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!cardRef.current || reducedMotion) return undefined
    const context = gsap.context(() => {
      gsap.timeline()
        .fromTo('.announcement-orbit', { rotate: -35, scale: 0.7 }, { rotate: 0, scale: 1, duration: 0.65, ease: 'back.out(1.8)' })
        .fromTo('.announcement-card', { y: 70, opacity: 0, scale: 0.92 }, { y: 0, opacity: 1, scale: 1, duration: 0.55, ease: 'back.out(1.45)' }, '<.08')
        .fromTo('.announcement-kicker, .announcement-title, .announcement-message', { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.38, stagger: 0.08 }, '-=.25')
    }, cardRef)
    return () => context.revert()
  }, [announcement.id, reducedMotion])

  return (
    <div ref={cardRef} className={`stage-announcement stage-announcement--${announcement.tone ?? 'info'}`} role="status" aria-live="assertive">
      <div className="announcement-orbit" aria-hidden="true">
        <i /><i /><i />
      </div>
      <div className="announcement-card">
        <div className="announcement-sheen" aria-hidden="true" />
        <p className="announcement-kicker">{announcement.kicker ?? 'Mission update'}</p>
        <h2 className="announcement-title">{announcement.title}</h2>
        {announcement.message && <p className="announcement-message">{announcement.message}</p>}
      </div>
    </div>
  )
}
