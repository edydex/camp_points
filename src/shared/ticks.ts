import type { ScoreConfig, TankTick } from './types'

const PRECISION = 1_000_000

/**
 * Produces stable, evenly-spaced gauge markings for the primary tank. Overflow
 * tanks reuse the same markings because each tank has the same capacity.
 */
export function generateTankTicks(config: ScoreConfig): TankTick[] {
  const capacity = config.tankCapacity
  if (!Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('Tank capacity must be a positive integer')
  }
  if (!Number.isInteger(config.majorInterval) || config.majorInterval < 1) {
    throw new RangeError('Major interval must be a positive integer')
  }
  if (
    !Number.isInteger(config.minorSubdivisions) ||
    config.minorSubdivisions < 0 ||
    config.minorSubdivisions > 9
  ) {
    throw new RangeError('Minor subdivisions must be an integer from 0 through 9')
  }

  const boundaries = [0]
  for (let value = config.majorInterval; value < capacity; value += config.majorInterval) {
    boundaries.push(value)
  }
  boundaries.push(capacity)

  const ticks: TankTick[] = []
  for (let boundaryIndex = 0; boundaryIndex < boundaries.length - 1; boundaryIndex += 1) {
    const start = boundaries[boundaryIndex]
    const end = boundaries[boundaryIndex + 1]
    if (boundaryIndex === 0) ticks.push(makeTick(0, capacity, 'zero', '0'))

    const segmentSize = end - start
    for (let subdivision = 1; subdivision <= config.minorSubdivisions; subdivision += 1) {
      const value = round(
        start + (segmentSize * subdivision) / (config.minorSubdivisions + 1),
      )
      ticks.push(makeTick(value, capacity, 'minor', null))
    }

    const isMaximum = end === capacity
    ticks.push(
      makeTick(
        end,
        capacity,
        isMaximum ? 'max' : 'major',
        isMaximum ? config.maxLabel : formatValue(end),
      ),
    )
  }

  return ticks
}

function makeTick(
  value: number,
  capacity: number,
  kind: TankTick['kind'],
  label: string | null,
): TankTick {
  return {
    value,
    positionPercent: round((value / capacity) * 100),
    kind,
    label,
  }
}

function round(value: number): number {
  return Math.round(value * PRECISION) / PRECISION
}

function formatValue(value: number): string {
  return Number.isInteger(value) ? String(value) : String(round(value))
}
