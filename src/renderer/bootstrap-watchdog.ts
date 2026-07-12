// This module is intentionally independent from React. If the application
// bundle fails before React can mount, it replaces an otherwise blank window
// with an actionable local recovery message.
window.setTimeout(() => {
  const root = document.getElementById('root')
  if (!root || root.childElementCount > 0) return

  const screen = document.createElement('main')
  screen.className = 'renderer-failure renderer-failure--bootstrap'
  screen.setAttribute('role', 'alert')

  const eyebrow = document.createElement('p')
  eyebrow.textContent = 'Launch system fault'
  const heading = document.createElement('h1')
  heading.textContent = 'Rocket Fuel could not start this window.'
  const detail = document.createElement('p')
  detail.textContent = 'Your saved show is safe. Close this window and start the app again.'
  const reload = document.createElement('button')
  reload.type = 'button'
  reload.textContent = 'Try reloading'
  reload.addEventListener('click', () => window.location.reload())

  screen.append(eyebrow, heading, detail, reload)
  root.append(screen)
}, 4_000)
