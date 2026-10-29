// ==UserScript==
// @name         Auto Typer voor Google Docs
// @namespace    https://github.com/Wander2026projects/Auto-typer
// @version      1.0.0
// @description  Typt geplakte tekst letter voor letter in Google Docs, met instelbare snelheid (woorden per minuut), menselijke variatie, pauzes en tikfouten.
// @author       Wander2026projects
// @match        https://docs.google.com/document/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  if (window.__autoTyperLoaded) return;
  window.__autoTyperLoaded = true;

  // ---------------------------------------------------------------------------
  // Instellingen (worden onthouden in Safari)
  // ---------------------------------------------------------------------------

  const SETTINGS_KEY = 'autoTyper.settings.v1';
  const TEXT_KEY = 'autoTyper.text.v1';

  const DEFAULTS = {
    wpm: 45,              // woorden per minuut (1 woord = 5 tekens)
    variation: 50,        // menselijke variatie in %
    sentencePause: 0.6,   // seconden extra na . ! ?
    paragraphPause: 1.5,  // seconden extra na een nieuwe alinea
    typoRate: 2,          // tikfouten per 100 woorden
    countdown: 3,         // seconden aftellen voor het typen begint
    method: 'auto',       // 'auto' | 'keys' | 'input'
    settingsOpen: false,
    minimized: false,
    left: null,
    top: null,
  };

  const settings = loadSettings();

  function loadSettings() {
    try {
      return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* opslag geblokkeerd: dan onthouden we het gewoon niet */ }
  }

  function loadText() {
    try {
      return localStorage.getItem(TEXT_KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function saveText(text) {
    try {
      localStorage.setItem(TEXT_KEY, text);
    } catch (e) { /* tekst te groot of opslag geblokkeerd */ }
  }

  // ---------------------------------------------------------------------------
  // Google Docs: waar de toetsaanslagen heen moeten
  // ---------------------------------------------------------------------------

  // Google Docs vangt alle toetsaanslagen op in een onzichtbaar iframe.
  function getInputFrame() {
    return document.querySelector('iframe.docs-texteventtarget-iframe');
  }

  function getInputDocument() {
    const frame = getInputFrame();
    if (frame) {
      try {
        return frame.contentDocument;
      } catch (e) {
        return null;
      }
    }
    const el = document.querySelector('.docs-texteventtarget-iframe');
    return el ? el.ownerDocument : null;
  }

  // Het element dat de toetsaanslagen ontvangt (zoals bij een echt toetsenbord).
  function getInputElement() {
    const frame = getInputFrame();
    if (!frame) return document.querySelector('.docs-texteventtarget-iframe');
    const doc = getInputDocument();
    if (!doc) return null;
    return doc.querySelector('[contenteditable="true"]') || doc.body || doc.documentElement;
  }

  function focusDocument() {
    const frame = getInputFrame();
    const el = getInputElement();
    try {
      if (frame && frame.contentWindow) frame.contentWindow.focus();
      if (el && el.focus) el.focus({ preventScroll: true });
    } catch (e) { /* niet erg: toetsaanslagen werken ook zonder focus */ }
  }

  function codeFor(ch) {
    if (/^[a-z]$/i.test(ch)) return 'Key' + ch.toUpperCase();
    if (/^[0-9]$/.test(ch)) return 'Digit' + ch;
    if (ch === ' ') return 'Space';
    return '';
  }

  // Google Docs leest nog de oude keyCode/charCode-velden, dus die vullen we ook in.
  function keyEvent(type, key, code, keyCode) {
    return new KeyboardEvent(type, {
      key: key,
      code: code,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
  }

  // Enter, Backspace en Tab verwerkt Google Docs bij 'keydown'.
  function pressSpecialKey(key, keyCode) {
    const el = getInputElement();
    if (!el) throw new Error(MSG_NO_DOCS);
    el.dispatchEvent(keyEvent('keydown', key, key, keyCode));
  }

  // Gewone tekens: 'keys' = toetsaanslag (keypress), 'input' = tekstinvoer (zoals het schermtoetsenbord).
  function insertChar(ch, method) {
    const el = getInputElement();
    if (!el) throw new Error(MSG_NO_DOCS);
    if (method === 'input') {
      const doc = el.ownerDocument;
      if (doc.activeElement !== el && el.focus) el.focus({ preventScroll: true });
      doc.execCommand('insertText', false, ch);
    } else {
      el.dispatchEvent(keyEvent('keypress', ch, codeFor(ch), ch.codePointAt(0)));
    }
  }

  // Positie van de cursor in het document; verandert als er echt iets getypt is.
  function caretSignature() {
    const root = document.getElementById('docs-editor') || document.body;
    const cursors = root.querySelectorAll('.kix-cursor');
    if (!cursors.length) return null;
    return Array.from(cursors, (c) => {
      const caret = c.querySelector('.kix-cursor-caret') || c;
      const r = caret.getBoundingClientRect();
      return [Math.round(r.left), Math.round(r.top), Math.round(r.height)].join(',');
    }).join('|');
  }

  async function caretMoved(before, timeout) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      await sleep(50);
      if (caretSignature() !== before) return true;
    }
    return false;
  }

  const METHOD_NAMES = { keys: 'toetsaanslagen', input: 'tekstinvoer' };
  const MSG_NO_DOCS = 'Ik kan het Google Docs-document niet vinden. Wacht tot het document helemaal geladen is, of herlaad de pagina.';
  const MSG_NOT_TYPING = 'Er verschijnt geen tekst in je document. Tik eerst in je document waar de tekst moet komen. ' +
    'Werkt het dan nog niet? Kies bij Instellingen → Methode een andere methode en druk op Test.';

  // Typt het eerste teken en kijkt welke methode werkt (alleen bij Methode: Automatisch).
  async function detectMethod(ch) {
    const before = caretSignature();
    insertChar(ch, 'keys');
    if (before === null) return 'keys'; // geen cursor gevonden: dan gaan we uit van toetsaanslagen
    if (await caretMoved(before, 700)) return 'keys';

    const before2 = caretSignature();
    insertChar(ch, 'input');
    if (await caretMoved(before2, 700)) return 'input';

    throw new Error(MSG_NOT_TYPING);
  }

  async function typeChar(ch) {
    if (ch === '\n') return pressSpecialKey('Enter', 13);
    if (ch === '\t') return pressSpecialKey('Tab', 9);
    if (!run.method) {
      run.method = await detectMethod(ch);
      return;
    }
    insertChar(ch, run.method);
  }

  // ---------------------------------------------------------------------------
  // Snelheid, pauzes en tikfouten
  // ---------------------------------------------------------------------------

  const SENTENCE_END = new Set(['.', '!', '?', '…']);
  const CLAUSE_END = new Set([',', ';', ':']);
  const CLAUSE_PAUSE_FACTOR = 0.35;
  const THINK_CHANCE = 0.03; // kans op een korte denkpauze voor een woord (bij 100% variatie)

  // Toetsen die naast elkaar liggen op een QWERTY-toetsenbord.
  const NEIGHBORS = {
    q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol',
    a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb', j: 'huikmn', k: 'jiolm', l: 'kop',
    z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
  };

  function charDelay() {
    return 12000 / settings.wpm; // 60.000 ms / (wpm × 5 tekens)
  }

  function gaussian() {
    let u = 0;
    let v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Willekeurige factor rond 1: bij 0% variatie altijd precies 1 (robot).
  function jitter() {
    const sigma = 0.55 * (settings.variation / 100);
    if (sigma <= 0) return 1;
    const f = Math.exp(gaussian() * sigma - (sigma * sigma) / 2);
    return Math.min(4, Math.max(0.25, f));
  }

  function spread(ms) {
    const v = settings.variation / 100;
    return ms * (1 + (Math.random() * 2 - 1) * 0.5 * v);
  }

  function pauseBefore(chars, i) {
    const prev = chars[i - 1];
    if (prev === '\n') return chars[i] === '\n' ? 0 : settings.paragraphPause * 1000;
    if (prev === ' ' || prev === '\t') {
      if (SENTENCE_END.has(chars[i - 2])) return settings.sentencePause * 1000;
      if (CLAUSE_END.has(chars[i - 2])) return settings.sentencePause * 1000 * CLAUSE_PAUSE_FACTOR;
    }
    return 0;
  }

  function isWordStart(chars, i) {
    return chars[i - 1] === ' ' && chars[i] !== ' ';
  }

  function delayBefore(chars, i) {
    if (i === 0) return 0;
    let ms = charDelay() * jitter();
    const pause = pauseBefore(chars, i);
    if (pause) ms += spread(pause);
    if (isWordStart(chars, i) && Math.random() < THINK_CHANCE * (settings.variation / 100)) {
      ms += 400 + Math.random() * 1600;
    }
    return ms;
  }

  function canTypo(ch) {
    return !!ch && Object.prototype.hasOwnProperty.call(NEIGHBORS, ch.toLowerCase());
  }

  // 100 woorden ≈ 500 tekens ≈ 400 letters.
  function typoChance() {
    return settings.typoRate / 400;
  }

  function wrongCharFor(ch) {
    const options = NEIGHBORS[ch.toLowerCase()];
    const wrong = options[Math.floor(Math.random() * options.length)];
    return ch === ch.toUpperCase() ? wrong.toUpperCase() : wrong;
  }

  // Verkeerde letter typen, soms nog 1-2 letters doortypen, dan terug wissen.
  async function makeTypo(chars, i) {
    await typeChar(wrongCharFor(chars[i]));
    const keepGoing = Math.floor(Math.random() * 3);
    let extra = 0;
    while (extra < keepGoing && canTypo(chars[i + 1 + extra])) {
      await wait(charDelay() * jitter());
      await typeChar(chars[i + 1 + extra]);
      extra++;
    }
    await wait(350 + Math.random() * 550);
    for (let k = 0; k <= extra; k++) {
      pressSpecialKey('Backspace', 8);
      await wait(charDelay() * 0.6 * jitter());
    }
    await wait(150 + Math.random() * 250);
  }

  // Verwachte tijd per teken, voor de schatting "nog ongeveer ...".
  function expectedCost(chars, i) {
    const base = charDelay();
    let ms = i === 0 ? 0 : base + pauseBefore(chars, i);
    if (isWordStart(chars, i)) ms += THINK_CHANCE * (settings.variation / 100) * 1200;
    if (canTypo(chars[i])) ms += typoChance() * (base * 3.6 + 1000);
    return ms;
  }

  function buildEstimate(chars) {
    const remaining = new Float64Array(chars.length + 1);
    for (let j = chars.length - 1; j >= 0; j--) {
      remaining[j] = remaining[j + 1] + expectedCost(chars, j);
    }
    return remaining;
  }

  function toChars(text) {
    return Array.from(text.replace(/\r\n?/g, '\n'));
  }

  // ---------------------------------------------------------------------------
  // Typen: starten, pauzeren, stoppen
  // ---------------------------------------------------------------------------

  const STOP = new Error('gestopt');

  const run = {
    active: false,
    paused: false,
    stopRequested: false,
    method: null,
    chars: [],
    index: 0,
    estimate: null,
    startedAt: 0,
    pausedAt: 0,
    pausedTotal: 0,
    waiters: [],
    countingDown: false,
  };

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Wachten dat rekening houdt met Pauze en Stop.
  async function wait(ms) {
    let left = ms;
    for (;;) {
      if (run.stopRequested) throw STOP;
      if (run.paused) {
        await new Promise((resolve) => run.waiters.push(resolve));
        continue;
      }
      if (left <= 0) return;
      const step = Math.min(left, 100);
      await sleep(step);
      left -= step;
    }
  }

  function wakeWaiters() {
    const waiters = run.waiters;
    run.waiters = [];
    waiters.forEach((resolve) => resolve());
  }

  let wakeLock = null;

  async function keepScreenOn(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* niet ondersteund: zet dan zelf automatische vergrendeling uit */ }
  }

  async function startTyping() {
    if (run.active) return;
    const text = ui.textarea.value;
    if (!text.trim()) {
      setStatus('Plak eerst je tekst in het vak hierboven.', 'warn');
      return;
    }

    Object.assign(run, {
      active: true,
      paused: false,
      stopRequested: false,
      method: settings.method === 'auto' ? null : settings.method,
      chars: toChars(text),
      index: 0,
      startedAt: 0,
      pausedAt: 0,
      pausedTotal: 0,
      waiters: [],
      countingDown: settings.countdown > 0,
    });
    run.estimate = buildEstimate(run.chars);

    ui.textarea.blur();
    focusDocument();
    watchEscape();
    keepScreenOn(true);
    updateControls();
    updateProgress();

    try {
      for (let s = settings.countdown; s > 0; s--) {
        setStatus('Begint over ' + s + '… Tik nu in je document waar de tekst moet komen.');
        await wait(1000);
      }
      run.countingDown = false;
      focusDocument();
      await wait(150);

      run.startedAt = Date.now();
      updateControls();
      setStatus('Bezig met typen…');
      const chars = run.chars;
      for (let i = 0; i < chars.length; i++) {
        await wait(delayBefore(chars, i));
        if (i > 0 && canTypo(chars[i]) && Math.random() < typoChance()) {
          await makeTypo(chars, i);
        }
        await typeChar(chars[i]);
        run.index = i + 1;
        updateProgress();
      }

      const words = countWords(ui.textarea.value);
      setStatus('Klaar! ✓ ' + words + ' woorden getypt in ' + formatDuration(activeTime()) + '.', 'ok');
    } catch (e) {
      if (e === STOP) {
        setStatus('Gestopt na ' + run.index.toLocaleString('nl-NL') + ' tekens.');
      } else {
        setStatus(e.message || String(e), 'error');
      }
    } finally {
      run.active = false;
      run.paused = false;
      run.countingDown = false;
      keepScreenOn(false);
      updateControls();
      updateProgress();
    }
  }

  function pauseTyping() {
    if (!run.active || run.paused) return;
    run.paused = true;
    run.pausedAt = Date.now();
    setStatus('Gepauzeerd. Druk op Doorgaan om verder te typen.');
    keepScreenOn(false);
    updateControls();
  }

  function resumeTyping() {
    if (!run.active || !run.paused) return;
    if (run.startedAt) run.pausedTotal += Date.now() - run.pausedAt;
    run.paused = false;
    focusDocument();
    keepScreenOn(true);
    setStatus(run.countingDown ? 'Aftellen…' : 'Bezig met typen…');
    updateControls();
    wakeWaiters();
  }

  function stopTyping() {
    if (!run.active) return;
    run.stopRequested = true;
    run.paused = false;
    wakeWaiters();
  }

  function activeTime() {
    if (!run.startedAt) return 0;
    const end = run.paused ? run.pausedAt : Date.now();
    return end - run.startedAt - run.pausedTotal;
  }

  // Esc op je toetsenbord = pauze.
  const watchedDocs = new WeakSet();

  function onKeyDown(e) {
    if (e.key === 'Escape' && e.isTrusted && run.active && !run.paused) pauseTyping();
  }

  function watchEscape() {
    [document, getInputDocument()].forEach((doc) => {
      if (doc && !watchedDocs.has(doc)) {
        doc.addEventListener('keydown', onKeyDown, true);
        watchedDocs.add(doc);
      }
    });
  }

  // Test: typt "Test", controleert of het verschijnt en wist het weer.
  async function runTest() {
    if (run.active) return;
    run.active = true;
    run.stopRequested = false;
    run.paused = false;
    run.method = settings.method === 'auto' ? null : settings.method;
    updateControls();
    try {
      focusDocument();
      await sleep(250);
      if (!getInputElement()) throw new Error(MSG_NO_DOCS);

      setStatus('Test bezig…');
      const before = caretSignature();
      for (const ch of 'Test') {
        await typeChar(ch);
        await sleep(120);
      }
      await sleep(300);
      const typed = before === null ? null : caretSignature() !== before;

      const beforeDelete = caretSignature();
      for (let k = 0; k < 4; k++) {
        pressSpecialKey('Backspace', 8);
        await sleep(120);
      }
      await sleep(300);
      const deleted = beforeDelete === null ? null : caretSignature() !== beforeDelete;

      const method = METHOD_NAMES[run.method] || run.method;
      if (typed === null) {
        setStatus('Test klaar (methode: ' + method + '). Kijk zelf: verscheen "Test" even in je document en werd het weer gewist?');
      } else if (typed && deleted) {
        setStatus('Test gelukt ✓ Typen en wissen werken (methode: ' + method + ').', 'ok');
      } else if (typed) {
        setStatus('Typen werkt ✓, maar wissen lukte misschien niet. Haal "Test" zo nodig zelf weg.', 'warn');
      } else {
        setStatus(MSG_NOT_TYPING, 'error');
      }
    } catch (e) {
      setStatus(e.message || String(e), 'error');
    } finally {
      run.active = false;
      run.method = null;
      updateControls();
    }
  }

  // ---------------------------------------------------------------------------
  // Paneel
  // ---------------------------------------------------------------------------

  const PANEL_WIDTH = 320;
  const BUBBLE_SIZE = 52;

  const CSS = `
    :host {
      all: initial;
      --accent: #4f46e5; --accent-dark: #4338ca; --text: #1f2330; --muted: #646a7a; --line: #e3e5ec; --soft: #f4f5f9;
    }
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .panel {
      position: fixed; z-index: 2147483000; width: ${PANEL_WIDTH}px; max-height: calc(100vh - 24px);
      display: flex; flex-direction: column; background: #fff; color: var(--text);
      border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 12px 36px rgba(20, 22, 40, .22);
      font-size: 14px; line-height: 1.4; overflow: hidden;
    }
    .panel[hidden], .bubble[hidden] { display: none; }
    .header {
      display: flex; align-items: center; gap: 8px; padding: 10px 10px 10px 14px; background: var(--accent); color: #fff;
      cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; flex: none;
    }
    .header:active { cursor: grabbing; }
    .title { font-weight: 650; font-size: 15px; flex: 1; }
    .icon-btn {
      width: 34px; height: 34px; border-radius: 10px; border: 0; background: rgba(255,255,255,.18); color: #fff;
      font-size: 20px; line-height: 1; cursor: pointer; display: grid; place-items: center;
    }
    .body { padding: 12px 14px 14px; overflow-y: auto; -webkit-overflow-scrolling: touch; }
    textarea {
      width: 100%; min-height: 120px; max-height: 40vh; resize: vertical; padding: 10px; border-radius: 10px;
      border: 1px solid var(--line); background: var(--soft); color: var(--text); font-size: 14px; line-height: 1.45;
    }
    textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; background: #fff; }
    textarea[readonly] { opacity: .7; }
    .meta { color: var(--muted); font-size: 12.5px; margin: 6px 2px 10px; }
    .buttons { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 8px; }
    button.btn {
      height: 42px; border-radius: 10px; border: 1px solid var(--line); background: #fff; color: var(--text);
      font-size: 14.5px; font-weight: 600; cursor: pointer;
    }
    button.btn:disabled { opacity: .45; cursor: default; }
    button.start { background: var(--accent); border-color: var(--accent); color: #fff; }
    button.start:not(:disabled):active { background: var(--accent-dark); }
    button.stop { color: #c62828; }
    .progress { height: 8px; border-radius: 99px; background: var(--soft); margin: 12px 0 6px; overflow: hidden; border: 1px solid var(--line); }
    .bar { height: 100%; width: 0; background: var(--accent); border-radius: 99px; transition: width .15s linear; }
    .stats { color: var(--muted); font-size: 12.5px; min-height: 17px; }
    .status { margin-top: 6px; font-size: 13px; padding: 8px 10px; border-radius: 10px; background: var(--soft); }
    .status.ok { background: #e7f6ec; color: #17602f; }
    .status.warn { background: #fff5dc; color: #7a5200; }
    .status.error { background: #fdeaea; color: #a1231f; }
    details { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 8px; }
    summary { cursor: pointer; font-weight: 600; padding: 6px 0; list-style: none; user-select: none; -webkit-user-select: none; }
    summary::-webkit-details-marker { display: none; }
    summary::before { content: "▸ "; color: var(--muted); }
    details[open] summary::before { content: "▾ "; }
    .row { margin: 10px 0 4px; }
    .row-top { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; }
    .row-top label { font-weight: 600; }
    .val { color: var(--accent); font-weight: 600; white-space: nowrap; }
    .hint { color: var(--muted); font-size: 12px; }
    input[type=range] { width: 100%; height: 30px; margin: 2px 0 0; accent-color: var(--accent); }
    .method { display: flex; gap: 8px; align-items: center; margin-top: 4px; }
    select {
      flex: 1; height: 38px; border-radius: 10px; border: 1px solid var(--line); background: #fff; color: var(--text);
      font-size: 14px; padding: 0 8px;
    }
    .method button.btn { height: 38px; padding: 0 14px; }
    .tip { color: var(--muted); font-size: 12px; margin-top: 12px; }
    .bubble {
      position: fixed; z-index: 2147483000; width: ${BUBBLE_SIZE}px; height: ${BUBBLE_SIZE}px; border-radius: 50%;
      border: 0; background: var(--accent); color: #fff; font-size: 13px; font-weight: 700; cursor: pointer;
      box-shadow: 0 8px 24px rgba(20, 22, 40, .3); display: grid; place-items: center;
    }
  `;

  const ui = {};

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function formatNumber(n) {
    return n.toLocaleString('nl-NL', { maximumFractionDigits: 1 });
  }

  function formatDuration(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }

  function countWords(text) {
    const words = text.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }

  function sliderRow(label, key, min, max, step, format, hint) {
    const row = el('div', 'row');
    const top = el('div', 'row-top');
    const id = 'at-' + key;
    const lab = el('label', null, label);
    lab.htmlFor = id;
    const val = el('span', 'val');
    top.append(lab, val);

    const input = el('input');
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(settings[key]);

    const show = () => { val.textContent = format(Number(input.value)); };
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      show();
      onSettingsChanged();
    });
    show();

    row.append(top, input);
    if (hint) row.append(el('div', 'hint', hint));
    return row;
  }

  function buildUI() {
    const host = document.createElement('div');
    host.id = 'auto-typer-host';
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.append(el('style', null, CSS));

    // Klikken en toetsen in het paneel niet doorgeven aan Google Docs.
    ['keydown', 'keypress', 'keyup', 'paste', 'copy', 'cut', 'beforeinput', 'input',
      'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend',
      'click', 'dblclick', 'contextmenu', 'wheel'].forEach((type) => {
      host.addEventListener(type, (e) => e.stopPropagation());
    });

    const panel = el('div', 'panel');

    // Kop
    const header = el('div', 'header');
    header.append(el('span', 'title', '⌨️ Auto Typer'));
    const minBtn = el('button', 'icon-btn', '–');
    minBtn.type = 'button';
    minBtn.title = 'Klein maken';
    minBtn.setAttribute('aria-label', 'Klein maken');
    header.append(minBtn);

    // Inhoud
    const body = el('div', 'body');

    const textarea = el('textarea');
    textarea.placeholder = 'Plak hier de tekst die getypt moet worden…';
    textarea.value = loadText();
    textarea.spellcheck = false;
    let saveTimer = 0;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveText(textarea.value), 400);
      updateMeta();
    });

    const meta = el('div', 'meta');

    const buttons = el('div', 'buttons');
    const startBtn = el('button', 'btn start', '▶ Start');
    const pauseBtn = el('button', 'btn pause', '⏸ Pauze');
    const stopBtn = el('button', 'btn stop', '■ Stop');
    [startBtn, pauseBtn, stopBtn].forEach((b) => { b.type = 'button'; });
    buttons.append(startBtn, pauseBtn, stopBtn);

    const progress = el('div', 'progress');
    const bar = el('div', 'bar');
    progress.append(bar);
    const stats = el('div', 'stats');
    const status = el('div', 'status', 'Tik in je document waar de tekst moet komen en druk op Start.');

    // Instellingen
    const details = el('details');
    details.open = !!settings.settingsOpen;
    details.addEventListener('toggle', () => {
      settings.settingsOpen = details.open;
      saveSettings();
    });
    details.append(el('summary', null, 'Instellingen'));

    details.append(
      sliderRow('Snelheid', 'wpm', 10, 300, 1, (v) => v + ' woorden per minuut',
        'Gemiddeld typt iemand 35–45 woorden per minuut.'),
      sliderRow('Menselijke variatie', 'variation', 0, 100, 5, (v) => (v === 0 ? 'uit (robot)' : v + '%'),
        'Hoe meer variatie, hoe ongelijker de tijd tussen de letters.'),
      sliderRow('Pauze na een zin', 'sentencePause', 0, 5, 0.1, (v) => formatNumber(v) + ' s',
        'Extra wachten na . ! ? (na een komma ongeveer een derde hiervan).'),
      sliderRow('Pauze na een alinea', 'paragraphPause', 0, 10, 0.5, (v) => formatNumber(v) + ' s',
        'Extra wachten na een nieuwe regel.'),
      sliderRow('Tikfouten', 'typoRate', 0, 10, 0.5, (v) => (v === 0 ? 'uit' : formatNumber(v) + ' per 100 woorden'),
        'Typt soms een verkeerde letter en verbetert die meteen.'),
      sliderRow('Aftellen voor start', 'countdown', 0, 10, 1, (v) => (v === 0 ? 'meteen' : v + ' s'),
        'Tijd om in je document te tikken nadat je op Start hebt gedrukt.')
    );

    const methodRow = el('div', 'row');
    const methodTop = el('div', 'row-top');
    const methodLabel = el('label', null, 'Methode');
    methodLabel.htmlFor = 'at-method';
    methodTop.append(methodLabel);
    const method = el('div', 'method');
    const select = el('select');
    select.id = 'at-method';
    [['auto', 'Automatisch (aanbevolen)'], ['keys', 'Toetsaanslagen'], ['input', 'Tekstinvoer']].forEach(([value, label]) => {
      select.append(new Option(label, value));
    });
    select.value = settings.method;
    select.addEventListener('change', () => {
      settings.method = select.value;
      if (run.active && settings.method !== 'auto') run.method = settings.method;
      saveSettings();
    });
    const testBtn = el('button', 'btn', 'Test');
    testBtn.type = 'button';
    method.append(select, testBtn);
    methodRow.append(methodTop, method,
      el('div', 'hint', 'Test typt "Test" in je document en wist het meteen weer. Lukt het niet? Kies een andere methode.'));
    details.append(methodRow);

    const tip = el('div', 'tip', 'Tip: houd Safari open en je scherm aan tijdens het typen. Druk op Esc om te pauzeren.');

    body.append(textarea, meta, buttons, progress, stats, status, details, tip);
    panel.append(header, body);

    // Klein gemaakt: alleen een rond knopje
    const bubble = el('button', 'bubble', '⌨️');
    bubble.type = 'button';
    bubble.title = 'Auto Typer openen';
    bubble.setAttribute('aria-label', 'Auto Typer openen');

    shadow.append(panel, bubble);
    document.documentElement.append(host);

    Object.assign(ui, {
      host, panel, header, textarea, meta, startBtn, pauseBtn, stopBtn, testBtn, select, bar, stats, status, bubble,
    });

    startBtn.addEventListener('click', startTyping);
    pauseBtn.addEventListener('click', () => (run.paused ? resumeTyping() : pauseTyping()));
    stopBtn.addEventListener('click', stopTyping);
    testBtn.addEventListener('click', runTest);
    minBtn.addEventListener('click', () => setMinimized(true));
    bubble.addEventListener('click', () => setMinimized(false));

    enableDragging(header);
    window.addEventListener('resize', () => placePanel());
    setMinimized(!!settings.minimized);
    placePanel();
    updateMeta();
    updateControls();
  }

  // ---------------------------------------------------------------------------
  // Paneel bijwerken
  // ---------------------------------------------------------------------------

  function setStatus(text, kind) {
    ui.status.textContent = text;
    ui.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  let metaTimer = 0;

  function onSettingsChanged() {
    saveSettings();
    if (run.active && run.chars.length) {
      run.estimate = buildEstimate(run.chars);
      updateProgress();
    }
    updateMeta();
  }

  function updateMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => {
      const text = ui.textarea.value;
      if (!text.trim()) {
        ui.meta.textContent = 'Nog geen tekst.';
        return;
      }
      const chars = toChars(text);
      const estimate = buildEstimate(chars)[0];
      ui.meta.textContent = countWords(text).toLocaleString('nl-NL') + ' woorden · ' +
        chars.length.toLocaleString('nl-NL') + ' tekens · duurt ongeveer ' + formatDuration(estimate);
    }, 150);
  }

  function updateProgress() {
    const total = run.chars.length;
    const pct = total ? Math.floor((run.index / total) * 100) : 0;
    ui.bar.style.width = (total ? (run.index / total) * 100 : 0) + '%';

    if (!total) {
      ui.stats.textContent = '';
    } else {
      const parts = [pct + '%', run.index.toLocaleString('nl-NL') + ' / ' + total.toLocaleString('nl-NL') + ' tekens'];
      if (run.active && run.estimate) parts.push('nog ± ' + formatDuration(run.estimate[run.index]));
      const minutes = activeTime() / 60000;
      if (run.active && minutes > 0.05) parts.push(Math.round(run.index / 5 / minutes) + ' wpm');
      ui.stats.textContent = parts.join(' · ');
    }
    ui.bubble.textContent = run.active ? pct + '%' : '⌨️';
  }

  function updateControls() {
    ui.startBtn.disabled = run.active;
    ui.testBtn.disabled = run.active;
    ui.pauseBtn.disabled = !run.active || (!run.startedAt && !run.countingDown);
    ui.stopBtn.disabled = !run.active;
    ui.pauseBtn.textContent = run.paused ? '▶ Verder' : '⏸ Pauze';
    ui.textarea.readOnly = run.active;
  }

  function setMinimized(min) {
    settings.minimized = min;
    saveSettings();
    ui.panel.hidden = min;
    ui.bubble.hidden = !min;
    placePanel();
  }

  // ---------------------------------------------------------------------------
  // Verslepen en plaatsen
  // ---------------------------------------------------------------------------

  function placePanel() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = settings.left == null ? vw - PANEL_WIDTH - 16 : settings.left;
    let top = settings.top == null ? 72 : settings.top;
    left = Math.min(Math.max(8, left), Math.max(8, vw - PANEL_WIDTH - 8));
    top = Math.min(Math.max(8, top), Math.max(8, vh - 60));
    ui.panel.style.left = left + 'px';
    ui.panel.style.top = top + 'px';
    ui.panel.style.maxHeight = (vh - top - 12) + 'px';
    ui.bubble.style.left = (left + PANEL_WIDTH - BUBBLE_SIZE) + 'px';
    ui.bubble.style.top = top + 'px';
  }

  function enableDragging(handle) {
    let start = null;
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const rect = ui.panel.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      settings.left = start.left + e.clientX - start.x;
      settings.top = start.top + e.clientY - start.y;
      placePanel();
    });
    const end = () => {
      if (!start) return;
      start = null;
      saveSettings();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && run.active && !run.paused) keepScreenOn(true);
  });

  buildUI();
})();
