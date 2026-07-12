import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { RocketStage, rocketTankGeometry } from '../../src/renderer/components/RocketStage'
import type { StageRocketModel } from '../../src/renderer/stage/types'

const scoreConfig = {
  capacity: 10,
  overflow: false,
  majorInterval: 1,
  minorSubdivisions: 0,
  maxLabel: 'MAX',
}

describe('RocketStage model geometry', () => {
  it('preserves Scout while fitting narrower tanks inside Booster and Orbiter', () => {
    const scout = rocketTankGeometry('scout')
    const booster = rocketTankGeometry('booster')
    const orbiter = rocketTankGeometry('orbiter')

    expect(scout).toMatchObject({ left: 96, width: 88, top: 116, height: 174 })
    expect(booster.width).toBeLessThanOrEqual(68)
    expect(orbiter.width).toBeLessThanOrEqual(72)

    for (const tank of [scout, booster, orbiter]) {
      expect(tank.left + tank.width / 2).toBe(140)
      expect(tank.width).toBeGreaterThanOrEqual(68)
      expect(tank.bezelLeft).toBeLessThan(tank.left)
      expect(tank.bezelLeft + tank.bezelWidth).toBeGreaterThan(tank.left + tank.width)
    }
  })

  it('adds the projector-readable outer wing edge only to Orbiter', () => {
    const renderModel = (model: StageRocketModel) => render(
      <RocketStage
        team={{ id: model, name: model, color: '#43c6ff', model, score: 5 }}
        scoreConfig={scoreConfig}
        reducedMotion
      />,
    )

    const orbiter = renderModel('orbiter')
    expect(orbiter.container.querySelector('.rocket-outline--orbiter-wing')).toBeInTheDocument()
    orbiter.unmount()

    const scout = renderModel('scout')
    expect(scout.container.querySelector('.rocket-outline--orbiter-wing')).not.toBeInTheDocument()
  })
})
