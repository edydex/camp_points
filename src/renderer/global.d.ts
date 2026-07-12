import type { RocketFuelApi } from '../preload/contracts'

declare global {
  interface Window {
    rocketFuel?: RocketFuelApi
  }
}

export {}
