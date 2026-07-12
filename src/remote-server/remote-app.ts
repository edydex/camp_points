export const REMOTE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#08132f" />
    <title>Rocket Fuel Remote</title>
    <link rel="stylesheet" href="/remote.css" />
    <script src="/remote.js" defer></script>
  </head>
  <body>
    <div class="stars" aria-hidden="true"></div>
    <main>
      <header class="masthead">
        <div class="mark" aria-hidden="true"><span></span></div>
        <div><p class="eyebrow">CAMP MISSION CONTROL</p><h1>Rocket Fuel Remote</h1></div>
        <span id="connectionBadge" class="badge offline">Offline</span>
      </header>

      <section id="pairingPanel" class="panel pairing">
        <p class="eyebrow">PAIR CONTROLLER</p>
        <h2>Enter the six-digit code</h2>
        <p class="muted">The code is shown in the Presenter Console. Both devices must be on the same Wi-Fi or hotspot.</p>
        <label for="pin">Pairing code</label>
        <input id="pin" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]*" placeholder="000000" />
        <button id="pairButton" class="primary">Connect to show</button>
        <button id="replaceButton" class="danger hidden">Replace current phone</button>
      </section>

      <section id="controlPanel" class="hidden" aria-live="polite">
        <div class="showbar panel"><div><p class="eyebrow">LIVE SHOW</p><h2 id="showTitle">Rocket Fuel</h2></div><div class="cue"><span>CUE</span><strong id="cuePosition">0 / 0</strong></div></div>
        <section class="panel"><div class="section-title"><h2>Select a team</h2><span>Tap before awarding fuel</span></div><div id="teams" class="teams"></div></section>
        <section class="panel score-panel">
          <div class="section-title"><h2>Award fuel</h2><span id="selectedName">Select a team</span></div>
          <div id="presets" class="presets"></div>
          <div class="score-actions"><button id="subtractButton" class="score minus" aria-label="Subtract selected preset">−</button><button id="addButton" class="score plus" aria-label="Add selected preset">+1</button></div>
        </section>
        <section class="transport panel">
          <button id="undoButton"><span>UNDO</span><strong>↶</strong></button>
          <button id="backButton"><span>BACK CUE</span><strong>‹</strong></button>
          <button id="nextButton" class="launch"><span>NEXT CUE</span><strong>›</strong></button>
          <button id="redoButton"><span>REDO</span><strong>↷</strong></button>
        </section>
        <section class="panel utility"><button id="volumeDownButton">Volume −</button><button id="volumeUpButton">Volume +</button><button id="muteButton">Sound: On</button><button id="reconnectButton">Reconnect</button></section>
      </section>
      <p id="status" class="status" role="status"></p>
    </main>
  </body>
</html>`

export const REMOTE_CSS = `
:root{color-scheme:dark;font-family:Inter,ui-rounded,"SF Pro Rounded",system-ui,sans-serif;background:#040918;color:#f7fbff;--cyan:#56dbff;--blue:#2766ff;--panel:rgba(13,29,65,.86);--line:rgba(128,190,255,.2)}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}body{margin:0;min-height:100dvh;background:radial-gradient(circle at 20% -10%,#1d3e88 0,transparent 35%),radial-gradient(circle at 110% 40%,#3d155e 0,transparent 38%),linear-gradient(#071127,#030611);overflow-x:hidden}.stars{position:fixed;inset:0;pointer-events:none;opacity:.34;background-image:radial-gradient(#fff 1px,transparent 1px),radial-gradient(#8bdcff 1px,transparent 1px);background-size:47px 47px,83px 83px;background-position:5px 13px,22px 9px}main{position:relative;width:min(760px,100%);margin:auto;padding:max(18px,env(safe-area-inset-top)) 14px max(26px,env(safe-area-inset-bottom))}.masthead{display:flex;align-items:center;gap:12px;margin:3px 2px 20px}.masthead h1{font-size:clamp(20px,5vw,29px);margin:1px 0;letter-spacing:-.03em}.mark{width:46px;height:46px;border:1px solid #6de4ff;border-radius:14px;display:grid;place-items:center;background:linear-gradient(145deg,#173f84,#092044);box-shadow:0 0 28px #38beff3d}.mark span{width:15px;height:25px;border:3px solid white;border-radius:50% 50% 36% 36%;position:relative}.mark span:after{content:"";position:absolute;width:7px;height:9px;background:linear-gradient(#ffe86a,#ff6c22);left:1px;bottom:-11px;clip-path:polygon(50% 100%,0 0,100% 0)}.eyebrow{font-size:10px;letter-spacing:.2em;color:#8faee9;font-weight:800;margin:0}.badge{margin-left:auto;font-size:11px;font-weight:800;padding:7px 10px;border-radius:99px;border:1px solid}.badge.offline{color:#ff9ea7;border-color:#ff697955;background:#5b142340}.badge.online{color:#82ffcf;border-color:#38eaa555;background:#0a593640}.panel{background:linear-gradient(145deg,rgba(18,39,85,.94),rgba(7,18,43,.94));border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:0 16px 45px #0006,inset 0 1px #ffffff0c;margin-bottom:12px;backdrop-filter:blur(18px)}.pairing{max-width:520px;margin:8vh auto 0}.pairing h2{font-size:26px;margin:5px 0 7px}.muted,.section-title span{color:#9aaed4;font-size:13px;line-height:1.45}.pairing label{display:block;font-size:12px;font-weight:700;color:#b8caf0;margin:22px 0 7px}.pairing input{width:100%;font:800 30px ui-monospace,monospace;text-align:center;letter-spacing:.34em;padding:16px;border-radius:14px;background:#020918;border:1px solid #4f79bd;color:white;outline:none}.pairing input:focus{border-color:var(--cyan);box-shadow:0 0 0 3px #50d7ff28}.pairing button{width:100%;margin-top:12px}.primary,.launch{background:linear-gradient(145deg,#35cdfa,#2864ff)!important;color:white!important;border-color:#78dfff!important;box-shadow:0 10px 28px #1a64ff55!important}.danger{background:#4b1723;color:#ffbdc4;border-color:#b14c5d}button{min-height:48px;border:1px solid #335587;border-radius:13px;background:#102752;color:#eaf5ff;font:700 14px inherit;cursor:pointer;touch-action:manipulation}button:active{transform:scale(.975)}button:disabled{opacity:.38;cursor:not-allowed}.hidden{display:none!important}.showbar{display:flex;align-items:center;justify-content:space-between}.showbar h2{margin:3px 0 0;font-size:22px}.cue{text-align:right;color:#8ca8d8;font-size:10px}.cue strong{display:block;color:white;font-size:18px}.section-title{display:flex;align-items:baseline;justify-content:space-between;gap:10px}.section-title h2{font-size:17px;margin:0 0 14px}.teams{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.team{position:relative;text-align:left;display:flex;align-items:center;gap:9px;padding:11px}.team .dot{width:14px;height:14px;border-radius:50%;box-shadow:0 0 13px currentColor}.team .team-copy{min-width:0}.team strong,.team small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.team small{color:#9aafd7;margin-top:2px}.team.selected{border-color:var(--team);background:color-mix(in srgb,var(--team) 22%,#0e2248);box-shadow:inset 0 0 0 1px var(--team),0 0 22px color-mix(in srgb,var(--team) 25%,transparent)}.presets{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.preset{min-height:42px}.preset.selected{background:#245dc4;border-color:#69cfff}.score-actions{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:11px}.score{font-size:27px;min-height:68px}.minus{background:#351c3d;border-color:#794b83}.plus{background:linear-gradient(145deg,#168e77,#16c686);border-color:#6affd1}.transport{display:grid;grid-template-columns:1fr 1fr 1.5fr 1fr;gap:7px;padding:10px}.transport button{padding:8px 3px}.transport span{display:block;font-size:8px;letter-spacing:.09em;color:#a9bde4}.transport strong{font-size:25px;line-height:1}.utility{display:grid;grid-template-columns:1fr 1fr;gap:8px}.status{text-align:center;color:#a9bde4;font-size:12px;min-height:18px;margin:12px 10px}@media(min-width:580px){.teams{grid-template-columns:repeat(3,1fr)}}@media(prefers-reduced-motion:no-preference){.badge.online{animation:pulse 2.2s infinite}@keyframes pulse{50%{box-shadow:0 0 18px #37e8a438}}}
`

export const REMOTE_JS = String.raw`
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const elements = {
    badge: $('connectionBadge'), pairing: $('pairingPanel'), controls: $('controlPanel'),
    pin: $('pin'), pair: $('pairButton'), replace: $('replaceButton'), status: $('status'),
    title: $('showTitle'), cue: $('cuePosition'), teams: $('teams'), presets: $('presets'),
    selected: $('selectedName'), add: $('addButton'), subtract: $('subtractButton'),
    undo: $('undoButton'), redo: $('redoButton'), next: $('nextButton'), back: $('backButton'),
    volumeDown: $('volumeDownButton'), volumeUp: $('volumeUpButton'),
    mute: $('muteButton'), reconnect: $('reconnectButton')
  };
  const clientId = localStorage.getItem('rocketFuelClientId') || makeId();
  localStorage.setItem('rocketFuelClientId', clientId);
  let socket = null;
  let sessionToken = sessionStorage.getItem('rocketFuelSessionToken');
  let snapshot = null;
  let paired = false;
  let selectedTeamId = null;
  let presetIndex = 0;
  let reconnectTimer = null;
  let allowReconnect = true;

  function makeId() {
    return self.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function setStatus(message, error) {
    elements.status.textContent = message || '';
    elements.status.style.color = error ? '#ff9ea7' : '#a9bde4';
  }
  function setConnected(connected) {
    elements.badge.textContent = connected ? 'Connected' : 'Offline';
    elements.badge.className = 'badge ' + (connected ? 'online' : 'offline');
    document.querySelectorAll('#controlPanel button').forEach((button) => button.disabled = !connected);
  }
  function returnToPairing(allowReplacement) {
    paired = false;
    sessionToken = null;
    sessionStorage.removeItem('rocketFuelSessionToken');
    elements.controls.classList.add('hidden');
    elements.pairing.classList.remove('hidden');
    elements.replace.classList.toggle('hidden', !allowReplacement);
    setConnected(false);
  }
  function connect() {
    clearTimeout(reconnectTimer);
    if (socket) { socket.onclose = null; socket.close(); }
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(protocol + '//' + location.host + '/ws');
    socket.addEventListener('open', () => { setConnected(false); setStatus('Connected to presenter. Pairing…'); });
    socket.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'hello') {
        if (sessionToken) sendPair(false, true);
      } else if (message.type === 'paired') {
        paired = true;
        sessionToken = message.sessionToken;
        sessionStorage.setItem('rocketFuelSessionToken', sessionToken);
        elements.pairing.classList.add('hidden');
        elements.controls.classList.remove('hidden');
        elements.replace.classList.add('hidden');
        setConnected(true);
        setStatus('Mission control connected.');
        updateSnapshot(message.snapshot);
      } else if (message.type === 'snapshot') {
        updateSnapshot(message.snapshot);
      } else if (message.type === 'ack') {
        if (!message.result.accepted) setStatus(message.result.reason || 'Command was not accepted.', true);
        else setStatus(message.result.duplicate ? 'Already received — no duplicate points added.' : 'Command received.');
        updateSnapshot(message.result.snapshot);
      } else if (message.type === 'error') {
        if (['invalid-pin', 'pairing-expired', 'not-paired', 'active-controller'].includes(message.code)) {
          returnToPairing(message.code === 'active-controller' || Boolean(message.canReplace));
        }
        setStatus(message.message, true);
      } else if (message.type === 'pong') { /* heartbeat response */ }
    });
    socket.addEventListener('close', (event) => {
      if (event.code === 4001) returnToPairing(false);
      else { paired = false; setConnected(false); }
      setStatus(event.code === 4001 ? 'This phone was replaced. Enter the current pairing code to reconnect.' : 'Connection lost. Trying again…', true);
      if (allowReconnect) reconnectTimer = setTimeout(connect, 1500);
    });
    socket.addEventListener('error', () => setStatus('Cannot reach the presenter. Check Wi-Fi and keep the desktop remote enabled.', true));
  }
  function send(value) {
    if (!socket || socket.readyState !== WebSocket.OPEN) { setStatus('Remote is disconnected.', true); return false; }
    socket.send(JSON.stringify(value)); return true;
  }
  function sendPair(replace, resume) {
    const pin = elements.pin.value.replace(/\D/g, '').slice(0, 6);
    if (!resume && pin.length !== 6) { setStatus('Enter all six digits from the Presenter Console.', true); return; }
    send({ type: 'pair', clientId, clientLabel: navigator.userAgent.includes('iPhone') ? 'iPhone' : navigator.userAgent.includes('Android') ? 'Android phone' : 'Mobile controller', pin: resume ? undefined : pin, sessionToken: resume ? sessionToken : undefined, replace: Boolean(replace) });
  }
  function command(command) {
    if (!paired) { setStatus('Pair the phone before sending commands.', true); return; }
    const id = makeId();
    send({ type: 'command', id, command: Object.assign({ commandId: id }, command) });
  }
  function updateSnapshot(next) {
    if (!next) return;
    snapshot = next;
    selectedTeamId = snapshot.selectedTeamId || selectedTeamId || (snapshot.teams[0] && snapshot.teams[0].id);
    presetIndex = Number.isInteger(snapshot.activePresetIndex) ? snapshot.activePresetIndex : presetIndex;
    elements.title.textContent = snapshot.title;
    elements.cue.textContent = Math.min(snapshot.cueIndex + 1, snapshot.cueCount) + ' / ' + snapshot.cueCount;
    elements.selected.textContent = (snapshot.teams.find((team) => team.id === selectedTeamId) || {}).name || 'Select a team';
    renderTeams(); renderPresets();
    const finaleActive = ['countdown', 'running', 'paused'].includes(snapshot.finale.status);
    elements.add.disabled = !paired || finaleActive;
    elements.subtract.disabled = !paired || finaleActive;
    elements.undo.disabled = !paired || finaleActive || !snapshot.canUndo;
    elements.redo.disabled = !paired || finaleActive || !snapshot.canRedo;
    elements.back.disabled = !paired || finaleActive || snapshot.cueIndex === 0;
    elements.next.disabled = !paired || finaleActive || snapshot.cueIndex >= snapshot.cueCount;
    if (finaleActive) elements.selected.textContent = 'Finale active — scores frozen';
    elements.volumeDown.disabled = !paired || snapshot.audio.masterVolume <= 0;
    elements.volumeUp.disabled = !paired || snapshot.audio.masterVolume >= 1;
    elements.mute.textContent = 'Sound: ' + (snapshot.audio.muted ? 'Muted' : 'On');
  }
  function renderTeams() {
    elements.teams.replaceChildren();
    snapshot.teams.forEach((team, index) => {
      const button = document.createElement('button');
      button.className = 'team' + (team.id === selectedTeamId ? ' selected' : '');
      button.style.setProperty('--team', team.color);
      const dot = document.createElement('span'); dot.className = 'dot'; dot.style.color = team.color; dot.style.background = team.color;
      const copy = document.createElement('span'); copy.className = 'team-copy';
      const name = document.createElement('strong'); name.textContent = (index + 1) + '. ' + team.name;
      const score = document.createElement('small'); score.textContent = (snapshot.scores[team.id] || 0) + ' fuel';
      copy.append(name, score); button.append(dot, copy);
      button.addEventListener('click', () => { selectedTeamId = team.id; command({ type: 'team.select', teamId: team.id }); renderTeams(); elements.selected.textContent = team.name; });
      elements.teams.append(button);
    });
  }
  function renderPresets() {
    const presets = snapshot.scoreConfig.awardPresets;
    if (presetIndex >= presets.length) presetIndex = 0;
    elements.presets.replaceChildren();
    presets.forEach((value, index) => {
      const button = document.createElement('button'); button.className = 'preset' + (index === presetIndex ? ' selected' : ''); button.textContent = '+' + value;
      button.addEventListener('click', () => { presetIndex = index; command({ type: 'preset.select', presetIndex: index }); renderPresets(); });
      elements.presets.append(button);
    });
    const amount = presets[presetIndex] || 1;
    elements.add.textContent = '+' + amount; elements.subtract.textContent = '−' + amount;
  }
  function adjust(sign) {
    if (!selectedTeamId || !snapshot) { setStatus('Select a team first.', true); return; }
    const amount = snapshot.scoreConfig.awardPresets[presetIndex] || 1;
    command({ type: 'score.adjust', teamId: selectedTeamId, delta: sign * amount });
  }

  elements.pin.addEventListener('input', () => elements.pin.value = elements.pin.value.replace(/\D/g, '').slice(0, 6));
  elements.pin.addEventListener('keydown', (event) => { if (event.key === 'Enter') sendPair(false, false); });
  elements.pair.addEventListener('click', () => sendPair(false, false));
  elements.replace.addEventListener('click', () => sendPair(true, false));
  elements.add.addEventListener('click', () => adjust(1));
  elements.subtract.addEventListener('click', () => adjust(-1));
  elements.undo.addEventListener('click', () => command({ type: 'history.undo' }));
  elements.redo.addEventListener('click', () => command({ type: 'history.redo' }));
  elements.next.addEventListener('click', () => command({ type: 'cue.execute' }));
  elements.back.addEventListener('click', () => command({ type: 'cue.rewind' }));
  elements.volumeDown.addEventListener('click', () => snapshot && command({ type: 'audio.set', channel: 'master', value: Math.max(0, Math.round((snapshot.audio.masterVolume - 0.1) * 10) / 10) }));
  elements.volumeUp.addEventListener('click', () => snapshot && command({ type: 'audio.set', channel: 'master', value: Math.min(1, Math.round((snapshot.audio.masterVolume + 0.1) * 10) / 10) }));
  elements.mute.addEventListener('click', () => command({ type: 'audio.mute' }));
  elements.reconnect.addEventListener('click', () => { allowReconnect = true; connect(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (!socket || socket.readyState > 1)) connect(); });
  setInterval(() => { if (socket && socket.readyState === WebSocket.OPEN) send({ type: 'ping', at: Date.now() }); }, 20000);
  connect();
})();
`
