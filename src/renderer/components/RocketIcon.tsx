import type { SVGProps } from 'react'

interface RocketIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name?: string
}

/** Small, bundled line icons used on the rocket hulls. */
export function RocketIcon({ name = 'star', ...props }: RocketIconProps) {
  const normalized = name.toLowerCase()

  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      {normalized === 'planet' && (
        <>
          <circle cx="24" cy="24" r="10" fill="currentColor" opacity=".92" />
          <path d="M7 28c5 4 14 5 24 2 8-2 13-6 12-9-1-2-4-3-8-3" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {normalized === 'bolt' && (
        <path d="M27 4 12 27h11l-2 17 15-25H25L27 4Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
      )}
      {normalized === 'moon' && (
        <path d="M35 35A17 17 0 1 1 30 7c-7 12-4 23 5 28Z" fill="currentColor" />
      )}
      {normalized === 'comet' && (
        <>
          <circle cx="31" cy="18" r="10" fill="currentColor" />
          <path d="M6 39 23 25M4 28l17-8M15 43l11-15" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".78" />
        </>
      )}
      {normalized === 'flame' && (
        <path d="M25 4c2 9-5 11-2 18 2-3 5-5 8-6 3 4 6 9 5 15-1 8-7 13-14 13S9 38 10 29c1-7 6-12 12-19 0 5 1 8 3 10 2-5 1-10 0-16Z" fill="currentColor" />
      )}
      {normalized === 'shield' && (
        <path d="M24 4c6 4 12 5 17 6v12c0 10-6 17-17 22C13 39 7 32 7 22V10c5-1 11-2 17-6Z" fill="currentColor" />
      )}
      {normalized === 'satellite' && (
        <>
          <path d="m17 16 15 15-7 7-15-15 7-7Z" fill="currentColor" />
          <path d="m10 8 8 3-8 8-3-8 3-3Zm28 22 3 8-3 3-8-3 8-8Z" fill="currentColor" opacity=".75" />
          <path d="M30 8c5 1 9 5 10 10M31 3c8 1 14 7 15 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {normalized === 'spark' && (
        <path d="m24 2 4 15 15-4-11 11 11 11-15-4-4 15-4-15-15 4 11-11L5 13l15 4 4-15Z" fill="currentColor" />
      )}
      {normalized === 'alien' && (
        <>
          <path d="M24 4C13 4 7 12 8 23c1 11 8 19 16 21 8-2 15-10 16-21C41 12 35 4 24 4Z" fill="currentColor" />
          <path d="M13 20c5 0 9 2 10 8-6 1-10-1-10-8Zm22 0c-5 0-9 2-10 8 6 1 10-1 10-8Z" fill="#071329" />
        </>
      )}
      {normalized === 'meteor' && (
        <>
          <path d="M21 17c8-7 19-4 22 4s-3 18-12 20-18-5-17-14c1-4 3-7 7-10Z" fill="currentColor" />
          <path d="M5 23 19 9M4 35l13-7M15 5l-7 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity=".74" />
          <circle cx="31" cy="26" r="3" fill="#071329" opacity=".45" />
        </>
      )}
      {normalized === 'galaxy' && (
        <>
          <path d="M5 26c7-10 18-14 28-10 8 3 11 10 7 16-4 7-14 9-23 5-7-3-10-9-7-14 2-4 8-6 14-5 5 1 8 4 6 7-2 3-7 4-11 2" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="24" cy="25" r="4" fill="currentColor" />
        </>
      )}
      {normalized === 'sun' && (
        <>
          <circle cx="24" cy="24" r="11" fill="currentColor" />
          <path d="M24 2v7m0 30v7M2 24h7m30 0h7M8 8l5 5m22 22 5 5M40 8l-5 5M13 35l-5 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {normalized === 'flag' && (
        <>
          <path d="M12 44V5" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="M15 7h26l-7 9 7 9H15V7Z" fill="currentColor" />
        </>
      )}
      {!['planet', 'bolt', 'moon', 'comet', 'flame', 'shield', 'satellite', 'spark', 'alien', 'meteor', 'galaxy', 'sun', 'flag'].includes(normalized) && (
        <path d="m24 3 6 13 14 2-10 10 3 15-13-7-13 7 3-15L4 18l14-2 6-13Z" fill="currentColor" stroke="currentColor" strokeLinejoin="round" />
      )}
    </svg>
  )
}
