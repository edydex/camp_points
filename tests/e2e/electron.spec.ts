import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createServer,
  loadConfigFromFile,
  type InlineConfig,
  type ViteDevServer,
} from 'vite'

interface RendererIssue {
  surface: string
  kind: 'console' | 'pageerror'
  message: string
}

function monitorRenderer(page: Page, surface: string, issues: RendererIssue[]): void {
  page.on('pageerror', (error) => {
    issues.push({ surface, kind: 'pageerror', message: error.message })
  })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    issues.push({ surface, kind: 'console', message: message.text() })
  })
}

async function windowWithTitle(
  app: ElectronApplication,
  titlePattern: RegExp,
): Promise<Page> {
  await expect.poll(async () => {
    const titles = await Promise.all(app.windows().map((page) => page.title()))
    return titles.some((title) => titlePattern.test(title))
  }).toBe(true)

  for (const page of app.windows()) {
    if (titlePattern.test(await page.title())) return page
  }
  throw new Error(`Electron window matching ${titlePattern} was not found`)
}

function expectNoRendererIssues(issues: RendererIssue[]): void {
  expect(
    issues,
    issues.map((issue) => `${issue.surface} ${issue.kind}: ${issue.message}`).join('\n'),
  ).toEqual([])
}

test('Presenter navigation, Stage synchronization, and mirrored controls work without renderer errors', async () => {
  // Native macOS fullscreen/display transitions can be deliberately slow on a
  // busy two-display machine; this scenario exercises several of them plus a
  // real two-second safety hold and should not inherit the short smoke timeout.
  test.setTimeout(120_000)
  const userData = mkdtempSync(join(tmpdir(), 'rocket-fuel-e2e-'))
  const issues: RendererIssue[] = []
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] })
  try {
    const presenter = await windowWithTitle(app, /Presenter/)
    monitorRenderer(presenter, 'Presenter', issues)

    // Reload once after installing listeners so startup exceptions and console
    // errors are part of the acceptance contract, rather than racing firstWindow().
    await presenter.reload()
    await expect(presenter).toHaveTitle(/Presenter/)
    await expect(presenter.getByText('Rocket Fuel', { exact: true })).toBeVisible()

    await expect(presenter.locator('.topbar h1')).toHaveText('Quick Setup')
    await expect(presenter.getByRole('heading', { name: 'Build the launch lineup' })).toBeVisible()

    await presenter.getByRole('button', { name: 'Open advanced settings' }).click()
    await expect(presenter.locator('.topbar h1')).toHaveText('Advanced settings')
    await expect(presenter.getByRole('heading', { name: 'Tank capacity and markings' })).toBeVisible()

    await presenter.getByRole('button', { name: /Cues/ }).click()
    await expect(presenter.locator('.topbar h1')).toHaveText('Cues')
    await expect(presenter.getByRole('heading', { name: 'Prepared cues are completely optional' })).toBeVisible()

    await presenter.getByRole('button', { name: /Venue Check/ }).click()
    await expect(presenter.locator('.topbar h1')).toHaveText('Venue Check')
    await expect(presenter.getByRole('heading', { name: 'Venue readiness' })).toBeVisible()

    await presenter.getByRole('button', { name: /Run Show/ }).click()
    const showTitle = presenter.getByRole('textbox', { name: 'Show title' })
    await expect(showTitle).toHaveValue('Rocket Fuel Camp Points')
    await showTitle.fill('Galaxy Kids Camp')
    await showTitle.press('Enter')
    await expect(showTitle).toHaveValue('Galaxy Kids Camp')
    const previewTitle = presenter.locator('.preview-frame .stage-title-lockup h1')
    await expect(previewTitle).toHaveText('Galaxy Kids Camp')
    const previewTitleMetrics = await previewTitle.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        paddingBottom: Number.parseFloat(style.paddingBottom),
      }
    })
    expect(previewTitleMetrics.lineHeight).toBeGreaterThan(previewTitleMetrics.fontSize)
    expect(previewTitleMetrics.paddingBottom).toBeGreaterThanOrEqual(previewTitleMetrics.fontSize * 0.13)
    await expect(presenter.getByRole('heading', { name: 'Adjust each team’s fuel' })).toBeVisible()
    await expect(presenter.getByRole('heading', { name: 'Manual scoring mode' })).toBeVisible()
    expect((await Promise.all(app.windows().map((page) => page.title()))).some((title) => /Stage/.test(title))).toBe(false)

    await presenter.getByRole('button', { name: /Start presentation/ }).click()
    await expect(presenter.getByRole('button', { name: /End presentation/ })).toBeVisible()
    await expect(presenter.getByText('Sound ready', { exact: true })).toBeVisible()
    await expect.poll(() => presenter.evaluate(async () => {
      const status = await window.rocketFuel?.getRuntimeStatus()
      return status && {
        isLive: status.isLive,
        stageOpen: status.stageOpen,
        powerSaveBlocked: status.powerSaveBlocked,
      }
    })).toEqual({ isLive: true, stageOpen: true, powerSaveBlocked: true })
    const stage = await windowWithTitle(app, /Stage/)
    monitorRenderer(stage, 'Stage', issues)
    await stage.reload()
    await expect(stage.locator('.rocket-stage')).toBeVisible()
    const audienceTitle = stage.locator('.stage-title-lockup h1')
    await expect(audienceTitle).toHaveText('Galaxy Kids Camp')
    const audienceTitleMetrics = await audienceTitle.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        fontSize: Number.parseFloat(style.fontSize),
        lineHeight: Number.parseFloat(style.lineHeight),
        paddingBottom: Number.parseFloat(style.paddingBottom),
      }
    })
    expect(audienceTitleMetrics.lineHeight).toBeGreaterThan(audienceTitleMetrics.fontSize)
    expect(audienceTitleMetrics.paddingBottom).toBeGreaterThanOrEqual(audienceTitleMetrics.fontSize * 0.13)

    await showTitle.fill('Galaxy Kids Camp Live')
    await showTitle.press('Enter')
    await expect(showTitle).toHaveValue('Galaxy Kids Camp Live')
    await expect(presenter.locator('.preview-frame .stage-title-lockup h1')).toHaveText('Galaxy Kids Camp Live')
    await expect(stage.locator('.stage-title-lockup h1')).toHaveText('Galaxy Kids Camp Live')
    await expect.poll(() => presenter.evaluate(async () => (await window.rocketFuel?.getSnapshot())?.title)).toBe('Galaxy Kids Camp Live')

    const stagePlacement = await app.evaluate(({ BrowserWindow, screen }) => {
      const primary = screen.getPrimaryDisplay()
      const external = screen.getAllDisplays().find((display) => display.id !== primary.id)
      return {
        displayCount: screen.getAllDisplays().length,
        primaryId: primary.id,
        externalId: external?.id ?? null,
        fullscreen: BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? false,
      }
    })
    // On a one-screen laptop the Presenter must remain usable; projector-style
    // fullscreen is reserved for an external display or an explicit F command.
    if (stagePlacement.displayCount === 1) {
      expect(stagePlacement.fullscreen).toBe(false)

      await presenter.evaluate(() => window.rocketFuel?.setStageFullscreen(true))
      await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? false,
      )).toBe(true)
      await presenter.evaluate(() => window.rocketFuel?.setStageFullscreen(false))
      await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? true,
      )).toBe(false)
      await presenter.waitForTimeout(750)
      expect(await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? true,
      )).toBe(false)
    } else {
      expect(stagePlacement.externalId).not.toBeNull()
      expect(stagePlacement.fullscreen).toBe(true)

      const externalId = stagePlacement.externalId as number
      await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => /Stage/.test(candidate.getTitle()))
        if (!window) return null
        return {
          displayId: screen.getDisplayMatching(window.getBounds()).id,
          focusable: window.isFocusable(),
          fullscreen: window.isFullScreen(),
        }
      })).toEqual({ displayId: externalId, focusable: false, fullscreen: true })

      // Selecting the laptop must exit projector fullscreen before moving,
      // leaving a controllable 16:9 window instead of covering Presenter.
      await presenter.evaluate((primaryId) => window.rocketFuel?.openStage(primaryId), stagePlacement.primaryId)
      await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => /Stage/.test(candidate.getTitle()))
        if (!window) return null
        return {
          displayId: screen.getDisplayMatching(window.getBounds()).id,
          focusable: window.isFocusable(),
          fullscreen: window.isFullScreen(),
        }
      })).toEqual({ displayId: stagePlacement.primaryId, focusable: true, fullscreen: false })

      await presenter.evaluate((displayId) => window.rocketFuel?.openStage(displayId), externalId)
      await expect.poll(() => app.evaluate(({ BrowserWindow, screen }) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => /Stage/.test(candidate.getTitle()))
        if (!window) return null
        return {
          displayId: screen.getDisplayMatching(window.getBounds()).id,
          focusable: window.isFocusable(),
          fullscreen: window.isFullScreen(),
        }
      })).toEqual({ displayId: externalId, focusable: false, fullscreen: true })

      // The last command must win even while native macOS transitions are in
      // flight. This is the regression for the prior fullscreen oscillation.
      await presenter.evaluate(() => {
        void window.rocketFuel?.setStageFullscreen(false)
        void window.rocketFuel?.setStageFullscreen(true)
        void window.rocketFuel?.setStageFullscreen(false)
      })
      await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? true,
      )).toBe(false)
      await presenter.waitForTimeout(750)
      expect(await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? true,
      )).toBe(false)

      await presenter.evaluate(() => window.rocketFuel?.setStageFullscreen(true))
      await expect.poll(() => app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFullScreen() ?? false,
      )).toBe(true)
    }

    expect(await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().find((window) => /Stage/.test(window.getTitle()))?.isFocused() ?? false,
    )).toBe(false)

    // Keyboard shortcuts deliberately defer to focused buttons and fields.
    // Move focus back to the Presenter canvas to exercise the global contract.
    await presenter.bringToFront()
    await presenter.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    })
    await presenter.keyboard.press('2')
    await presenter.keyboard.press('Enter')
    await expect.poll(() => presenter.evaluate(async () => {
      const snapshot = await window.rocketFuel?.getSnapshot()
      return snapshot?.scores['team-2'] ?? -1
    })).toBe(1)
    await expect(stage.locator('article[aria-label^="Team 2: 1 points"]')).toBeVisible()
    await expect(stage.locator('.rocket-card--selected')).toHaveCount(0)

    // A short, cancelled hold must not poison the next finale attempt. Use a
    // unique lowest score so bottom-one tie protection does not hide the
    // requested soft-landing mishap while this path is under test.
    await presenter.evaluate(async () => {
      const dispatch = window.rocketFuel?.dispatch
      if (!dispatch) throw new Error('Presenter API unavailable')
      await dispatch({
        type: 'show.update',
        commandId: 'e2e-finale-config',
        patch: { finale: { mishapCount: 1, countdownSeconds: 0, targetDurationMs: 10_000 } },
      })
      const values: Record<string, number> = { 'team-1': 4, 'team-2': 3, 'team-3': 2, 'team-4': 0 }
      for (const [teamId, value] of Object.entries(values)) {
        await dispatch({ type: 'score.set', commandId: `e2e-score-${teamId}`, teamId, value })
      }
    })
    const finaleHold = presenter.locator('.hold-button')
    await finaleHold.hover()
    await presenter.mouse.down()
    await presenter.mouse.up()
    await expect.poll(() => presenter.evaluate(async () =>
      (await window.rocketFuel?.getSnapshot())?.finale.status,
    )).toBe('idle')

    await finaleHold.hover()
    await presenter.mouse.down()
    await expect(finaleHold).toHaveClass(/is-holding/)
    await expect(presenter.locator('.finale-transport')).toBeVisible({ timeout: 15_000 })
    await presenter.mouse.up()
    await presenter.evaluate(async () => {
      const dispatch = window.rocketFuel?.dispatch
      if (!dispatch) throw new Error('Presenter API unavailable')
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const snapshot = await window.rocketFuel?.getSnapshot()
        const activeGroup = snapshot?.finale.plan?.groups[snapshot.finale.currentGroupIndex]
        if (activeGroup?.teamIds.includes('team-4')) return
        await dispatch({ type: 'finale.skip', commandId: `e2e-finale-skip-${attempt}` })
      }
      throw new Error('Finale never reached the configured mishap group')
    })
    await expect(stage.locator('article[aria-label^="Team 4:"]')).toHaveAttribute('data-phase', 'mishap')
    await presenter.getByRole('button', { name: 'Cancel' }).click()

    await presenter.getByRole('button', { name: 'Single-screen / mirrored' }).click()
    await expect(presenter.locator('.mirrored-stage-shell .rocket-stage--mirrored')).toBeVisible()
    await expect(presenter.locator('.mirrored-stage-shell .rocket-card--selected')).toHaveCount(1)
    await presenter.getByRole('button', { name: 'Exit Stage' }).click()
    await expect(presenter.locator('.mirrored-stage-shell')).toHaveCount(0)

    await presenter.evaluate(async () => {
      await window.rocketFuel?.dispatch({
        type: 'finale.start',
        commandId: 'e2e-finale-end-lifecycle',
        confirmed: true,
      })
    })
    await presenter.getByRole('button', { name: /End presentation/ }).click()
    await expect(presenter.getByRole('button', { name: /Start presentation/ })).toBeVisible()
    await expect.poll(() => presenter.evaluate(async () => {
      const [status, snapshot] = await Promise.all([
        window.rocketFuel?.getRuntimeStatus(),
        window.rocketFuel?.getSnapshot(),
      ])
      return status && snapshot && {
        isLive: status.isLive,
        stageOpen: status.stageOpen,
        powerSaveBlocked: status.powerSaveBlocked,
        finaleStatus: snapshot.finale.status,
      }
    })).toEqual({ isLive: false, stageOpen: false, powerSaveBlocked: false, finaleStatus: 'cancelled' })
    await expect.poll(async () => {
      const titles = await Promise.all(app.windows().map((page) => page.title()))
      return titles.some((title) => /Stage/.test(title))
    }).toBe(false)

    expectNoRendererIssues(issues)
  } finally {
    await app.close()
    rmSync(userData, { recursive: true, force: true })
  }
})

test('development renderer boots under the production-like CSP with Fast Refresh disabled', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'rocket-fuel-dev-e2e-'))
  const issues: RendererIssue[] = []
  let server: ViteDevServer | null = null
  let app: ElectronApplication | null = null

  try {
    const loaded = await loadConfigFromFile(
      { command: 'serve', mode: 'development' },
      join(process.cwd(), 'electron.vite.config.ts'),
    )
    expect(loaded, 'electron.vite.config.ts should load').toBeTruthy()
    const renderer = (loaded?.config as { renderer?: InlineConfig }).renderer
    expect(renderer, 'Electron renderer configuration should exist').toBeTruthy()
    expect(renderer?.server?.hmr, 'Fast Refresh injects a CSP-blocked inline preamble').toBe(false)

    server = await createServer({
      ...renderer,
      configFile: false,
      server: {
        ...renderer?.server,
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    })
    await server.listen()
    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') {
      throw new Error('Vite development server did not expose a TCP port')
    }
    const rendererUrl = `http://127.0.0.1:${address.port}`

    app = await electron.launch({
      args: ['.', `--user-data-dir=${userData}`],
      env: { ...process.env, ELECTRON_RENDERER_URL: rendererUrl },
    })
    const presenter = await windowWithTitle(app, /Presenter/)
    monitorRenderer(presenter, 'Development Presenter', issues)
    await presenter.reload()

    await expect(presenter.locator('#root')).not.toBeEmpty()
    await expect(presenter.getByText('Rocket Fuel', { exact: true })).toBeVisible()
    await expect(presenter.getByRole('heading', { name: 'Build the launch lineup' })).toBeVisible()
    expectNoRendererIssues(issues)
  } finally {
    await app?.close()
    await server?.close()
    rmSync(userData, { recursive: true, force: true })
  }
})
