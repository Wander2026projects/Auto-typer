// ==UserScript==
// @name         Auto Typer voor Google Docs
// @namespace    https://github.com/Wander2026projects/Auto-typer
// @version      1.4.0
// @description  Typt geplakte tekst letter voor letter in Google Docs, met instelbare snelheid (woorden per minuut), menselijke variatie, natuurlijk ritme, pauzes, tikfouten, zinnen herschrijven, typen in stukjes en een vaste eindtijd. Met Verbeter-typer: past alleen de veranderde woorden aan.
// @author       Wander2026projects
// @match        https://docs.google.com/document/*
// @run-at       document-idle
// @inject-into  content
// @noframes
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Maar één paneel, ook als het script twee keer wordt geladen.
  // Het attribuut op de pagina wordt gedeeld tussen losse userscript-omgevingen.
  if (window.__autoTyperLoaded || document.getElementById('auto-typer-host') ||
      (document.documentElement && document.documentElement.hasAttribute('data-auto-typer'))) return;
  if (document.documentElement) document.documentElement.setAttribute('data-auto-typer', '1');

  // ---------------------------------------------------------------------------
  // Instellingen (worden onthouden in Safari)
  // ---------------------------------------------------------------------------

  const SETTINGS_KEY = 'autoTyper.settings.v1';
  const TEXT_KEY = 'autoTyper.text.v1';
  const OLD_TEXT_KEY = 'autoTyper.oldText.v1';
  const NEW_TEXT_KEY = 'autoTyper.newText.v1';

  const DEFAULTS = {
    wpm: 45,              // woorden per minuut (1 woord = 5 tekens)
    variation: 50,        // menselijke variatie in %
    sentencePause: 0.6,   // seconden extra na . ! ?
    paragraphPause: 1.5,  // seconden extra na een nieuwe alinea
    rhythm: true,         // natuurlijk ritme: bekende woorden sneller, hoofdletters en cijfers langzamer
    typoRate: 2,          // tikfouten per 100 woorden
    rewriteOn: false,     // Zinnen herschrijven aan/uit
    rewriteRate: 10,      // % van de zinnen dat eerst als kladversie komt
    rewriteStyle: 'mix',  // 'mix' | 'sentence' (hele zin opnieuw) | 'diff' (alleen het verschil)
    rewriteTempo: 50,     // % van je snelheid bij het verbeteren van een zin (lager = rustiger)
    burstOn: false,       // Snel typen in stukjes aan/uit
    burstPause: 1,        // seconden nadenken tussen twee stukjes
    readPause: 2,         // seconden "lezen" voor een wijziging (Verbeter-typer en Zinnen herschrijven)
    countdown: 3,         // seconden aftellen voor het typen begint
    targetHours: 0,       // Auto typer: klaar in zoveel uur en minuten (0 en 0 = gewone snelheid)
    targetMinutes: 0,
    method: 'auto',       // 'auto' | 'keys' | 'input'
    tab: 'type',          // 'type' = Auto typer, 'improve' = Verbeter-typer
    settingsOpen: false,
    minimized: false,
    left: null,
    top: null,
  };

  const settings = loadSettings();

  // Versie 2.0.3 bewaarde alles onder ".v2"; dat nemen we over als er nog niets onder ".v1" staat.
  function readStored(key) {
    return localStorage.getItem(key) || localStorage.getItem(key.replace(/\.v1$/, '.v2'));
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(readStored(SETTINGS_KEY) || '{}');
      delete saved.method; // 2.0.3 zette dit vast op 'input'; standaard weer automatisch
      return Object.assign({}, DEFAULTS, saved);
    } catch (e) {
      return Object.assign({}, DEFAULTS);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* opslag geblokkeerd: dan onthouden we het gewoon niet */ }
  }

  function loadText(key) {
    try {
      return readStored(key) || '';
    } catch (e) {
      return '';
    }
  }

  function saveText(key, text) {
    try {
      localStorage.setItem(key, text);
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
  function keyEvent(type, key, code, keyCode, modifiers) {
    return new KeyboardEvent(type, Object.assign({
      key: key,
      code: code,
      keyCode: keyCode,
      charCode: keyCode,
      which: keyCode,
      bubbles: true,
      cancelable: true,
      composed: true,
    }, modifiers));
  }

  // Enter, Backspace, Tab en de pijltjes verwerkt Google Docs bij 'keydown'.
  function pressSpecialKey(key, keyCode, modifiers) {
    const el = getInputElement();
    if (!el) throw new Error(MSG_NO_DOCS);
    el.dispatchEvent(keyEvent('keydown', key, key, keyCode, modifiers));
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

  // Wacht tot de cursor een tijdje stil staat; geeft de laatste positie terug.
  async function settledCaret() {
    let last = caretSignature();
    for (let k = 0; k < 10; k++) {
      await wait(80);
      const now = caretSignature();
      if (now === last) return now;
      last = now;
    }
    return last;
  }

  // Zet de cursor helemaal aan het begin van het document.
  async function goToDocumentStart() {
    pressSpecialKey('ArrowUp', 38, { metaKey: true }); // Mac/iPad: Cmd + pijltje omhoog
    pressSpecialKey('Home', 36, { ctrlKey: true });    // Windows/Chromebook: Ctrl + Home
    const atStart = await settledCaret();
    if (atStart === null) return; // cursor niet te zien: we vertrouwen op de sneltoetsen

    // Controle: aan het begin doet pijltje-links niets.
    pressSpecialKey('ArrowLeft', 37);
    if (await settledCaret() === atStart) return;

    // Sneltoetsen werkten niet: dan met de pijltjes naar boven en naar links tot het niet verder kan.
    for (const [key, keyCode] of [['ArrowUp', 38], ['ArrowLeft', 37]]) {
      let before = caretSignature();
      for (let round = 0; round < 2000; round++) {
        for (let k = 0; k < 20; k++) pressSpecialKey(key, keyCode);
        const now = await settledCaret();
        if (now === before) break;
        before = now;
      }
    }
  }

  // Cursor een aantal tekens naar rechts (of naar links als het getal negatief is), in kleine stapjes.
  async function moveCaret(count) {
    const [key, keyCode] = count < 0 ? ['ArrowLeft', 37] : ['ArrowRight', 39];
    let left = Math.abs(count);
    while (left > 0) {
      const batch = Math.min(left, ARROWS_PER_STEP);
      for (let k = 0; k < batch; k++) pressSpecialKey(key, keyCode);
      left -= batch;
      await wait(ARROW_STEP_MS);
    }
  }

  const ARROWS_PER_STEP = 6;
  const ARROW_STEP_MS = 20;

  function arrowTime(count) {
    return Math.ceil(Math.abs(count) / ARROWS_PER_STEP) * ARROW_STEP_MS;
  }

  // ---------------------------------------------------------------------------
  // Snelheid, pauzes en tikfouten
  // ---------------------------------------------------------------------------

  const SENTENCE_END = new Set(['.', '!', '?', '…']);
  const CLAUSE_END = new Set([',', ';', ':']);
  const CLAUSE_PAUSE_FACTOR = 0.35;
  const THINK_CHANCE = 0.03; // kans op een korte denkpauze voor een woord (bij 100% variatie)
  const WORD_RE = /[\p{L}\p{N}]/u;
  const WARM_UP_CHARS = 150;      // natuurlijk ritme: de eerste tekens gaan wat langzamer
  const MIN_BURST_FACTOR = 0.35;  // typen in stukjes: hooguit ongeveer 3× zo snel als je ingestelde snelheid

  // Woorden die je zo vaak typt dat ze vanzelf gaan.
  const COMMON_WORDS = new Set((
    'de het een en van in is op te dat die met voor zijn niet aan er om ook als bij of maar nog dan wat ' +
    'ik je jij we wij ze zij hij u was had heeft wordt kan naar uit door zo al wel geen meer veel nu dit deze ' +
    'the a an and of to it for on with as at by be are this not or but from have has you they he she my so if do no'
  ).split(' '));

  // Toetsen die naast elkaar liggen op een QWERTY-toetsenbord.
  const NEIGHBORS = {
    q: 'wa', w: 'qeas', e: 'wrsd', r: 'etdf', t: 'ryfg', y: 'tugh', u: 'yihj', i: 'uojk', o: 'ipkl', p: 'ol',
    a: 'qwsz', s: 'awedxz', d: 'serfcx', f: 'drtgvc', g: 'ftyhbv', h: 'gyujnb', j: 'huikmn', k: 'jiolm', l: 'kop',
    z: 'asx', x: 'zsdc', c: 'xdfv', v: 'cfgb', b: 'vghn', n: 'bhjm', m: 'njk',
  };

  let paceWpm = null;  // de snelheid die hij zelf uitrekent als je een tijd hebt ingevuld
  let tempoFactor = 1; // groter dan 1 = langzamer (bij het verbeteren van een zin)

  function charDelay() {
    return (12000 / (paceWpm || settings.wpm)) * tempoFactor; // 60.000 ms / (wpm × 5 tekens)
  }

  // Even rekenen met een andere snelheid of een ander tempo (voor de tijdschatting).
  function withWpm(wpm, fn) {
    const saved = paceWpm;
    paceWpm = wpm;
    try {
      return fn();
    } finally {
      paceWpm = saved;
    }
  }

  function withTempo(factor, fn) {
    const saved = tempoFactor;
    tempoFactor = factor;
    try {
      return fn();
    } finally {
      tempoFactor = saved;
    }
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

  // Natuurlijk ritme: een tempofactor per teken. Gemiddeld 1, dus je ingestelde snelheid klopt nog steeds.
  function rhythmFactors(chars, warmUp) {
    const n = chars.length;
    const f = new Float64Array(n).fill(1);
    let i = 0;
    while (i < n) {
      const ch = chars[i];
      if (!WORD_RE.test(ch)) {
        if (ch === ' ') f[i] = 0.9;
        else if (ch === '.' || ch === ',') f[i] = 1.05;
        else if (ch !== '\n' && ch !== '\t') f[i] = 1.3; // haakjes, aanhalingstekens, streepjes…
        i++;
        continue;
      }
      let j = i;
      while (j < n && WORD_RE.test(chars[j])) j++;
      const word = chars.slice(i, j).join('').toLowerCase();
      const wordPace = COMMON_WORDS.has(word) ? 0.8 : word.length >= 8 ? 1.12 : word.length <= 3 ? 0.9 : 1;
      for (let k = i; k < j; k++) {
        let x = wordPace;
        if (k === i) x *= 1.25; // aan het begin van een woord even op gang komen
        if (k > i && chars[k].toLowerCase() === chars[k - 1].toLowerCase()) x *= 0.75; // dubbele letter
        if (chars[k] !== chars[k].toLowerCase()) x *= 1.35; // hoofdletter (Shift)
        else if (/\p{N}/u.test(chars[k])) x *= 1.4;         // cijfer
        f[k] = x;
      }
      i = j;
    }
    if (warmUp) {
      for (let k = 0; k < Math.min(n, WARM_UP_CHARS); k++) f[k] *= 1 + 0.4 * (1 - k / WARM_UP_CHARS);
    }
    // Gemiddeld op 1 zetten. Het eerste teken telt niet mee: daar wacht hij niet voor.
    let sum = 0;
    for (let k = 1; k < n; k++) sum += f[k];
    if (sum > 0) {
      const mean = sum / (n - 1);
      for (let k = 0; k < n; k++) f[k] /= mean;
    }
    return f;
  }

  // Aantal woorden in een stukje: 1–4, meestal 2 of 3.
  function chunkSize() {
    const r = Math.random();
    return r < 0.15 ? 1 : r < 0.5 ? 2 : r < 0.85 ? 3 : 4;
  }

  // Typen in stukjes: de woorden waar een nieuw stukje begint (met een denkpauze ervoor).
  // Na een zin, komma of alinea begint ook een nieuw stukje, maar daar pauzeert hij al.
  function chunkPlan(chars) {
    const chunkStart = new Uint8Array(chars.length);
    let chunks = 0;
    let left = chunkSize() - 1;
    for (let i = 1; i < chars.length; i++) {
      const prev = chars[i - 1];
      if (/\s/.test(chars[i]) || !/\s/.test(prev)) continue;
      if (prev === '\n' || SENTENCE_END.has(chars[i - 2]) || CLAUSE_END.has(chars[i - 2])) {
        left = chunkSize() - 1;
      } else if (left > 0) {
        left--;
      } else {
        chunkStart[i] = 1;
        chunks++;
        left = chunkSize() - 1;
      }
    }
    return { chunkStart, chunks };
  }

  // Het tempo voor een reeks tekens: natuurlijk ritme, en (als dat aan staat) de stukjes.
  function makePace(chars, options) {
    const opts = options || {};
    const pace = { rhythm: rhythmFactors(chars, opts.warmUp), chunkStart: null, chunks: 0, count: Math.max(1, chars.length - 1) };
    if (opts.bursts) Object.assign(pace, chunkPlan(chars));
    return pace;
  }

  // In stukjes typt hij sneller, zodat de denkpauzes je gemiddelde snelheid niet omlaag halen.
  function burstFactor(pace) {
    if (!pace.chunks) return 1;
    const typing = charDelay() * pace.count;
    return Math.max(MIN_BURST_FACTOR, 1 - (pace.chunks * settings.burstPause * 1000) / typing);
  }

  function paceFactor(pace, i) {
    return (settings.rhythm ? pace.rhythm[i] : 1) * burstFactor(pace);
  }

  function delayBefore(chars, i, pace) {
    if (i === 0) return 0;
    let ms = charDelay() * paceFactor(pace, i) * jitter();
    const chunk = pace.chunkStart && pace.chunkStart[i];
    let pause = pauseBefore(chars, i);
    if (chunk) pause += settings.burstPause * 1000;
    if (pause) ms += spread(pause);
    if (!chunk && isWordStart(chars, i) && Math.random() < THINK_CHANCE * (settings.variation / 100)) {
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

  // Typt een reeks tekens met het ingestelde tempo, pauzes en tikfouten.
  // 'after' draait na elk teken (de Auto typer herschrijft daar een zin).
  async function typeSequence(chars, pace, onProgress, after) {
    if (!pace) pace = makePace(chars);
    for (let i = 0; i < chars.length; i++) {
      await wait(delayBefore(chars, i, pace));
      if (i > 0 && canTypo(chars[i]) && Math.random() < typoChance()) {
        await makeTypo(chars, i);
      }
      await typeChar(chars[i]);
      if (onProgress) onProgress(i + 1);
      if (after) await after(i + 1);
    }
  }

  async function deleteChars(count) {
    for (let k = 0; k < count; k++) {
      await wait(charDelay() * 0.6 * jitter());
      pressSpecialKey('Backspace', 8);
    }
  }

  // Verwachte tijd per teken, voor de schatting "nog ongeveer ...".
  function expectedCost(chars, i, pace) {
    const base = charDelay();
    const chunk = pace.chunkStart && pace.chunkStart[i];
    let ms = i === 0 ? 0 : base * paceFactor(pace, i) + pauseBefore(chars, i);
    if (chunk) ms += settings.burstPause * 1000;
    else if (isWordStart(chars, i)) ms += THINK_CHANCE * (settings.variation / 100) * 1200;
    if (canTypo(chars[i])) ms += typoChance() * (base * 3.6 + 1000);
    return ms;
  }

  // 'extra(j)': tijd voor iets dat hij doet voordat hij teken j typt (zoals een zin herschrijven).
  function buildEstimate(chars, pace, extra) {
    if (!pace) pace = makePace(chars);
    const remaining = new Float64Array(chars.length + 1);
    if (extra) remaining[chars.length] = extra(chars.length);
    for (let j = chars.length - 1; j >= 0; j--) {
      remaining[j] = remaining[j + 1] + expectedCost(chars, j, pace) + (extra ? extra(j) : 0);
    }
    return remaining;
  }

  function toChars(text) {
    return Array.from(text.replace(/\r\n?/g, '\n'));
  }

  // ---------------------------------------------------------------------------
  // Verbeter-typer: verschillen tussen oude en nieuwe tekst
  // ---------------------------------------------------------------------------

  // Woorden, spaties, losse leestekens en nieuwe regels.
  const TOKEN_RE = /\n|[^\S\n]+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu;
  const MAX_DIFF_CELLS = 4000000;

  function tokenize(text) {
    return text.match(TOKEN_RE) || [];
  }

  // Lijst a omzetten naar lijst b: [{t: 'eq' | 'del' | 'ins', s: item}, ...]
  function alignLists(a, b) {
    let p = 0;
    while (p < a.length && p < b.length && a[p] === b[p]) p++;
    let q = 0;
    while (q < a.length - p && q < b.length - p && a[a.length - 1 - q] === b[b.length - 1 - q]) q++;

    const ops = [];
    for (let k = 0; k < p; k++) ops.push({ t: 'eq', s: a[k] });

    const am = a.slice(p, a.length - q);
    const bm = b.slice(p, b.length - q);
    const n = am.length;
    const m = bm.length;
    if ((n + 1) * (m + 1) > MAX_DIFF_CELLS) {
      am.forEach((s) => ops.push({ t: 'del', s }));
      bm.forEach((s) => ops.push({ t: 'ins', s }));
    } else {
      // Langste gemeenschappelijke reeks (LCS).
      const w = m + 1;
      const table = new Uint32Array((n + 1) * w);
      for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
          table[i * w + j] = am[i] === bm[j]
            ? table[(i + 1) * w + j + 1] + 1
            : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
        }
      }
      let i = 0;
      let j = 0;
      while (i < n && j < m) {
        if (am[i] === bm[j]) {
          ops.push({ t: 'eq', s: am[i] });
          i++;
          j++;
        } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
          ops.push({ t: 'del', s: am[i++] });
        } else {
          ops.push({ t: 'ins', s: bm[j++] });
        }
      }
      while (i < n) ops.push({ t: 'del', s: am[i++] });
      while (j < m) ops.push({ t: 'ins', s: bm[j++] });
    }

    for (let k = a.length - q; k < a.length; k++) ops.push({ t: 'eq', s: a[k] });
    return ops;
  }

  // Eerst per alinea vergelijken, daarna per woord binnen de veranderde alinea's.
  function diffTexts(oldText, newText) {
    const lines = (text) => text.match(/[^\n]*\n|[^\n]+$/g) || [];
    const ops = [];
    let oldPart = '';
    let newPart = '';
    const flush = () => {
      if (oldPart || newPart) ops.push(...alignLists(tokenize(oldPart), tokenize(newPart)));
      oldPart = '';
      newPart = '';
    };
    alignLists(lines(oldText), lines(newText)).forEach((op) => {
      if (op.t === 'eq') {
        flush();
        ops.push(op);
      } else if (op.t === 'del') {
        oldPart += op.s;
      } else {
        newPart += op.s;
      }
    });
    flush();
    return ops;
  }

  function charLength(s) {
    return Array.from(s).length;
  }

  // Wijzigingen als {start, del, ins} met posities in de oude tekst (in tekens).
  function buildEdits(ops) {
    const edits = [];
    let pos = 0;
    let current = null;
    ops.forEach((op, k) => {
      const len = charLength(op.s);
      if (op.t === 'eq') {
        // Een losse spatie tussen twee wijzigingen hoort bij de wijziging (dan vervangt hij een stukje zin in één keer).
        const next = ops[k + 1];
        if (current && /^[^\S\n]+$/.test(op.s) && next && next.t !== 'eq') {
          current.del += op.s;
          current.ins += op.s;
        } else if (current) {
          edits.push(current);
          current = null;
        }
        pos += len;
        return;
      }
      if (!current) current = { start: pos, del: '', ins: '' };
      if (op.t === 'del') {
        current.del += op.s;
        pos += len;
      } else {
        current.ins += op.s;
      }
    });
    if (current) edits.push(current);

    // Eén woord dat op één woord lijkt: alleen het stukje dat anders is (werkt → werkte: alleen "e" erbij).
    return edits.map((e) => {
      if (/\s/.test(e.del) || /\s/.test(e.ins)) return e;
      const del = Array.from(e.del);
      const ins = Array.from(e.ins);
      let p = 0;
      while (p < del.length && p < ins.length && del[p] === ins[p]) p++;
      let q = 0;
      while (q < del.length - p && q < ins.length - p && del[del.length - 1 - q] === ins[ins.length - 1 - q]) q++;
      return {
        start: e.start + p,
        del: del.slice(p, del.length - q).join(''),
        ins: ins.slice(p, ins.length - q).join(''),
      };
    }).filter((e) => e.del || e.ins);
  }

  function normalizeForCompare(text) {
    return text.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  }

  // Alles wat de Verbeter-typer nodig heeft: wijzigingen, cursorstappen en tijdschatting.
  function planImprovement(oldRaw, newRaw) {
    const oldText = normalizeForCompare(oldRaw);
    let newText = normalizeForCompare(newRaw);
    let note = '';
    // Plak je tekst van ergens anders met lege regels tussen alinea's, terwijl je document die niet heeft?
    if (!/\n\s*\n/.test(oldText) && /\n\s*\n/.test(newText)) {
      newText = newText.replace(/\n(\s*\n)+/g, '\n');
      note = 'Lege regels tussen alinea\'s in de nieuwe tekst worden genegeerd, want je document heeft die niet.';
    }

    const { edits } = planEdits(oldText, newText);
    return { oldText, newText, edits, note };
  }

  // Wijzigingen met cursorstappen, vanaf het begin van de oude tekst.
  // 'caret' is waar de cursor na de laatste wijziging staat (in de nieuwe tekst).
  function planEdits(oldText, newText) {
    const edits = buildEdits(diffTexts(oldText, newText));
    let caret = 0;
    let offset = 0;
    let oldEnd = 0;
    edits.forEach((e) => {
      e.delLen = charLength(e.del);
      e.insChars = Array.from(e.ins);
      e.from = oldEnd; // de cursor loopt over de oude tekst van 'from' tot het eind van het stuk dat weg moet
      oldEnd = e.start + e.delLen;
      const target = e.start + offset + e.delLen;
      e.move = target - caret;
      caret = target - e.delLen + e.insChars.length;
      offset += e.insChars.length - e.delLen;
    });
    return { edits, caret };
  }

  function editCost(e, k) {
    return arrowTime(e.move) + (k > 0 ? settings.readPause * 1000 : 0) + changeCost(e);
  }

  // Wissen en typen, zonder de cursor erheen te brengen.
  function changeCost(e) {
    let ms = e.delLen ? 350 + e.delLen * charDelay() * 0.6 : 0;
    if (e.insChars.length) ms += charDelay() + buildEstimate(e.insChars)[0];
    return ms;
  }

  function buildEditEstimate(edits) {
    const remaining = new Float64Array(edits.length + 1);
    for (let k = edits.length - 1; k >= 0; k--) remaining[k] = remaining[k + 1] + editCost(edits[k], k);
    return remaining;
  }

  // ---------------------------------------------------------------------------
  // Zinnen herschrijven: eerst een kladversie, een paar zinnen later terug om hem te verbeteren
  // ---------------------------------------------------------------------------

  const MAX_BACK = 3;         // hooguit zoveel zinnen doortypen voordat hij teruggaat
  const MIN_DRAFT_WORDS = 6;  // kortere zinnen herschrijft hij niet
  const MIN_DRAFT_ERRORS = 3; // een kladzin heeft minstens 3 fouten (en hooguit 5)
  const WALK_WORD_MS = 180;   // rustig teruglopen: zo lang per woord (bij gewoon tempo)
  const CLOSERS = new Set([')', ']', '"', '\'', '”', '’', '»']);
  // Hier kan het tellen van de cursorstappen misgaan: emoji, of iets dat Google Docs zelf vervangt (zoals (c) → ©).
  const RISKY_RE = /[\p{M}\u200d\ufe0f\u{10000}-\u{10FFFF}]|\((?:c|r|tm)\)|->|<-|=>|<=|>=|!=|--|\d\/\d|\.\.\.|[:;]-?[()DP]/iu;

  const LANG_HINTS = {
    nl: new Set('de het een en van ik je niet dat zijn met voor op maar ook'.split(' ')),
    en: new Set('the and of to that it for with on but not you this are was'.split(' ')),
  };

  // Een extra woordje dat er bij het verbeteren weer uit gaat.
  const FILLERS = {
    nl: ['eigenlijk', 'gewoon', 'echt', 'ook', 'wel', 'best', 'zeker', 'vooral'],
    en: ['really', 'just', 'actually', 'also', 'quite', 'basically'],
  };

  // Werkwoorden waar zo'n woordje achter kan: "Het was echt groter." / "It was really cold."
  const FILLER_AFTER = {
    nl: new Set(('is was ben bent zijn waren had heb hebt heeft hadden wil wilde kan kon moet moest ga gaat ging gingen ' +
      'vind vond denk dacht wordt werd zou zal mag mocht kwam kwamen').split(' ')),
    en: new Set('is was are were am have has had will would can could should must do did'.split(' ')),
  };

  // Hier zet hij soms een komma te veel voor: "Ik denk, dat het klopt."
  const CONJUNCTIONS = {
    nl: new Set('dat die en maar omdat want als wat zodat terwijl toen of'.split(' ')),
    en: new Set('that and which because but so when while'.split(' ')),
  };

  // Zinsdeel vooraan dat hij in de kladversie op een andere plek zet.
  const FRONT_WORDS = {
    nl: new Set(('gisteren vandaag morgen daarna toen eerst later nu soms vaak meestal altijd daarom dus toch ' +
      'vervolgens uiteindelijk opeens ineens vroeger straks hier daar').split(' ')),
    en: new Set('yesterday today tomorrow then later sometimes usually often now afterwards finally eventually recently'.split(' ')),
  };
  const FRONT_FIRST = {
    nl: new Set('vorige volgende afgelopen elke iedere deze'.split(' ')),
    en: new Set('last next every this'.split(' ')),
  };
  const FRONT_SECOND = {
    nl: new Set('week maand jaar keer dag zomer winter ochtend middag avond nacht weekend'.split(' ')),
    en: new Set('week month year time day summer winter morning afternoon evening night weekend'.split(' ')),
  };
  const SUBJECTS_NL = new Set('ik je jij we wij ze zij hij het u men jullie'.split(' '));

  // Woord in je tekst → het woord dat hij eerst in de kladversie typt.
  const SYNONYMS = {
    nl: new Map(Object.entries({
      echter: 'toch', daarom: 'dus', dus: 'daarom', omdat: 'want', want: 'omdat', bovendien: 'ook',
      erg: 'heel', heel: 'erg', zeer: 'heel', moeilijk: 'lastig', lastig: 'moeilijk', snel: 'vlug',
      misschien: 'wellicht', wellicht: 'misschien', meestal: 'vaak', altijd: 'steeds', eigenlijk: 'feitelijk',
      beginnen: 'starten', begint: 'start', begon: 'startte', mooi: 'leuk', leuk: 'mooi', groot: 'flink',
      krijgen: 'ontvangen', krijgt: 'ontvangt', kreeg: 'ontving', denk: 'vind', vind: 'denk', bijna: 'haast',
      direct: 'meteen', meteen: 'direct', helemaal: 'totaal', alleen: 'enkel', enkel: 'alleen', zodat: 'waardoor',
    })),
    en: new Map(Object.entries({
      however: 'but', therefore: 'so', because: 'since', very: 'really',
      big: 'large', large: 'big', often: 'usually', usually: 'often', difficult: 'hard',
      begin: 'start', start: 'begin', maybe: 'perhaps', perhaps: 'maybe', quickly: 'fast',
      almost: 'nearly', nearly: 'almost',
    })),
  };

  function detectLanguage(text) {
    let nl = 0;
    let en = 0;
    (text.toLowerCase().match(/\p{L}+/gu) || []).slice(0, 2000).forEach((w) => {
      if (LANG_HINTS.nl.has(w)) nl++;
      if (LANG_HINTS.en.has(w)) en++;
    });
    return en > nl ? 'en' : 'nl';
  }

  // Zinnen als {start, end, para}: van de eerste letter tot en met de punt (posities in tekens).
  function findSentences(chars) {
    const sentences = [];
    let para = 0;
    let i = 0;
    while (i < chars.length) {
      if (chars[i] === '\n') {
        para++;
        i++;
        continue;
      }
      if (!WORD_RE.test(chars[i])) {
        i++;
        continue;
      }
      const start = i;
      let end = -1;
      while (i < chars.length && chars[i] !== '\n') {
        if (!SENTENCE_END.has(chars[i])) {
          i++;
          continue;
        }
        let j = i + 1;
        while (j < chars.length && (SENTENCE_END.has(chars[j]) || CLOSERS.has(chars[j]))) j++;
        i = j;
        if (j >= chars.length || /\s/.test(chars[j])) {
          end = j;
          break;
        }
      }
      if (end < 0) { // laatste zin van de alinea, zonder punt
        end = i;
        while (end > start && /\s/.test(chars[end - 1])) end--;
      }
      sentences.push({ start, end, para });
    }
    return sentences;
  }

  // Een kladversie maakt hij van stukjes {s: tekst, orig: nog niet veranderd}.
  // Elke fout pakt alleen woorden die nog niet veranderd zijn, zodat fouten elkaar niet opheffen.
  const tok = (text, orig) => ({ s: text, orig: !!orig });
  const isWord = (t) => t != null && WORD_RE.test(t.s);
  const isGap = (t) => t != null && t.s === ' ';
  const endsClause = (t) => t == null || isGap(t) || SENTENCE_END.has(t.s) || CLAUSE_END.has(t.s);
  // Een gewoon woord met kleine letters (geen naam, getal of afkorting) dat nog niet veranderd is.
  const isFresh = (t) => isWord(t) && t.orig && /^\p{Ll}+$/u.test(t.s);
  const lower = (t) => (t ? t.s.toLowerCase() : '');

  function wordPositions(tokens) {
    const list = [];
    tokens.forEach((t, k) => { if (isWord(t)) list.push(k); });
    return list;
  }

  function pickRandom(list) {
    return list.length ? list[Math.floor(Math.random() * list.length)] : undefined;
  }

  function capitalize(word) {
    return word[0].toUpperCase() + word.slice(1);
  }

  function matchCase(word, model) {
    if (model.length > 1 && model === model.toUpperCase()) return word.toUpperCase();
    if (model[0] !== model[0].toLowerCase()) return capitalize(word);
    return word;
  }

  // Een woord vergeten: "Ik ga morgen naar school." → "Ik ga naar school."
  function dropWord(tokens) {
    const k = pickRandom(wordPositions(tokens).slice(1)
      .filter((p) => isFresh(tokens[p]) && isGap(tokens[p - 1]) && isGap(tokens[p + 1])));
    if (k === undefined) return null;
    const out = tokens.slice();
    out.splice(k - 1, 2);
    return out;
  }

  // Een woordje te veel: "Het was groter dan ik dacht." → "Het was echt groter dan ik dacht."
  function addFiller(tokens, lang) {
    const k = pickRandom(wordPositions(tokens).filter((p) => FILLER_AFTER[lang].has(lower(tokens[p])) &&
      isGap(tokens[p + 1]) && isFresh(tokens[p + 2]) && !FILLERS[lang].includes(tokens[p + 2].s)));
    if (k === undefined) return null;
    const out = tokens.slice();
    out.splice(k + 2, 0, tok(pickRandom(FILLERS[lang])), tok(' '));
    return out;
  }

  // Eerst een ander woord: "Het was echter te laat." → "Het was toch te laat."
  function swapSynonym(tokens, lang) {
    const k = pickRandom(wordPositions(tokens).filter((p) => tokens[p].orig && SYNONYMS[lang].has(lower(tokens[p]))));
    if (k === undefined) return null;
    const out = tokens.slice();
    out[k] = tok(matchCase(SYNONYMS[lang].get(lower(tokens[k])), tokens[k].s));
    return out;
  }

  // Twee woorden omgedraaid, midden in de zin: "Ik ga morgen naar school." → "Ik ga naar morgen school."
  function swapWords(tokens) {
    const k = pickRandom(wordPositions(tokens).slice(1).filter((p) =>
      isFresh(tokens[p]) && isFresh(tokens[p + 2]) && tokens[p].s !== tokens[p + 2].s &&
      isGap(tokens[p - 1]) && isGap(tokens[p + 1]) && isGap(tokens[p + 3])));
    if (k === undefined) return null;
    const out = tokens.slice();
    out[k] = tok(tokens[k + 2].s);
    out[k + 2] = tok(tokens[k].s);
    return out;
  }

  // Zin nog niet af: "Ik fiets elke dag naar school." → "Ik fiets elke dag."
  function cutEnd(tokens) {
    let end = tokens.length;
    while (end > 0 && !isWord(tokens[end - 1]) && !isGap(tokens[end - 1])) end--;
    if (!tokens.slice(end).some((t) => SENTENCE_END.has(t.s))) return null;
    let from = end;
    const cut = 1 + Math.floor(Math.random() * 2);
    for (let c = 0; c < cut && isFresh(tokens[from - 1]) && isGap(tokens[from - 2]); c++) from -= 2;
    if (from === end || wordPositions(tokens.slice(0, from)).length < 4) return null;
    return tokens.slice(0, from).concat(tokens.slice(end));
  }

  // Een spelfout die blijft staan: twee letters omgedraaid of een letter ernaast ("school" → "shcool", "schiol").
  // Altijd even lang, zodat het tellen klopt, ook als Google Docs de fout zelf verbetert.
  function misspell(tokens, lang) {
    const k = pickRandom(wordPositions(tokens).filter((p) => isFresh(tokens[p]) && tokens[p].s.length >= 4));
    if (k === undefined) return null;
    const letters = Array.from(tokens[k].s);
    if (lang === 'nl' && /dt$/.test(tokens[k].s) && Math.random() < 0.5) {
      letters.pop(); // dt-fout: "wordt" → "word"
    } else if (Math.random() < 0.5) {
      const spots = [];
      for (let i = 1; i < letters.length - 1; i++) if (letters[i] !== letters[i + 1]) spots.push(i);
      const i = pickRandom(spots);
      if (i === undefined) return null;
      [letters[i], letters[i + 1]] = [letters[i + 1], letters[i]];
    } else {
      const spots = [];
      for (let i = 1; i < letters.length; i++) if (canTypo(letters[i])) spots.push(i);
      const i = pickRandom(spots);
      if (i === undefined) return null;
      letters[i] = wrongCharFor(letters[i]);
    }
    const out = tokens.slice();
    out[k] = tok(letters.join(''));
    return out;
  }

  // Een komma vergeten: "Het was druk, maar we zaten." → "Het was druk maar we zaten."
  function dropComma(tokens) {
    const k = pickRandom(tokens.map((t, p) => p).filter((p) =>
      tokens[p].s === ',' && tokens[p].orig && isWord(tokens[p - 1]) && isGap(tokens[p + 1]) && tokens[p + 1].orig));
    if (k === undefined) return null;
    const out = tokens.slice();
    out.splice(k, 2, tok(' ')); // ook de spatie erna telt als veranderd, zodat er hier geen komma terugkomt
    return out;
  }

  // Een komma te veel: "Ik denk dat het klopt." → "Ik denk, dat het klopt."
  function addComma(tokens, lang) {
    const k = pickRandom(wordPositions(tokens).slice(2).filter((p) => CONJUNCTIONS[lang].has(lower(tokens[p])) &&
      isGap(tokens[p - 1]) && tokens[p - 1].orig && isWord(tokens[p - 2])));
    if (k === undefined) return null;
    const out = tokens.slice();
    out.splice(k - 1, 1, tok(','), tok(' '));
    return out;
  }

  // Hoeveel woorden het zinsdeel vooraan is: "Daarna" (1), "Vorige week" (2), of 0 als het er niet is.
  function frontLength(tokens, lang) {
    if (!isWord(tokens[0]) || !tokens[0].orig) return 0;
    if (FRONT_WORDS[lang].has(lower(tokens[0]))) return 1;
    if (FRONT_FIRST[lang].has(lower(tokens[0])) && isGap(tokens[1]) && isWord(tokens[2]) && tokens[2].orig &&
      FRONT_SECOND[lang].has(lower(tokens[2]))) return 2;
    return 0;
  }

  // Zinsdeel op een andere plek: "Daarna mochten we zelf kijken." → "We mochten daarna zelf kijken."
  // Engels: "Last summer we went to Rome." → "We went to Rome last summer."
  function movePhrase(tokens, lang) {
    const n = frontLength(tokens, lang);
    if (!n) return null;
    const phrase = tokens.slice(0, 2 * n - 1).map((t, i) => tok(i === 0 ? t.s.toLowerCase() : t.s));
    if (lang === 'nl') {
      const verb = tokens[2 * n];
      const subject = tokens[2 * n + 2];
      if (!isGap(tokens[2 * n - 1]) || !isFresh(verb) || !isGap(tokens[2 * n + 1]) || !subject || !subject.orig ||
        !SUBJECTS_NL.has(lower(subject)) || !endsClause(tokens[2 * n + 3])) return null;
      return [tok(capitalize(subject.s.toLowerCase())), tok(' '), tok(verb.s), tok(' ')]
        .concat(phrase, tokens.slice(2 * n + 3));
    }
    let k = 2 * n - 1;
    if (tokens[k] && tokens[k].s === ',') k++;
    if (!isGap(tokens[k]) || !isWord(tokens[k + 1]) || !tokens[k + 1].orig) return null;
    let end = tokens.length;
    while (end > 0 && !isWord(tokens[end - 1]) && !isGap(tokens[end - 1])) end--;
    if (end <= k + 2 || !tokens.slice(end).some((t) => SENTENCE_END.has(t.s))) return null;
    const subject = tokens[k + 1].s === 'I' ? 'I' : capitalize(tokens[k + 1].s);
    return [tok(subject)].concat(tokens.slice(k + 2, end), [tok(' ')], phrase, tokens.slice(end));
  }

  // [hoe vaak hij deze fout kiest, de fout, hooguit zoveel keer per zin]
  const DRAFT_CHANGES = [
    [4, misspell, 2], [3, dropWord, 1], [3, swapSynonym, 1], [3, movePhrase, 1], [2, addFiller, 1],
    [2, dropComma, 1], [2, addComma, 1], [1, swapWords, 1], [1, cutEnd, 1],
  ];

  // Probeert de fouten in willekeurige volgorde (de gewone vaker eerst) tot er één lukt.
  // 'used' telt per fout hoe vaak hij al in deze zin zit.
  function changeOnce(tokens, lang, used) {
    const options = DRAFT_CHANGES.filter(([, change, max]) => (used.get(change) || 0) < max);
    while (options.length) {
      let r = Math.random() * options.reduce((sum, [weight]) => sum + weight, 0);
      let k = 0;
      while (k < options.length - 1 && r >= options[k][0]) r -= options[k++][0];
      const [, change] = options.splice(k, 1)[0];
      const out = change(tokens, lang);
      if (out) {
        used.set(change, (used.get(change) || 0) + 1);
        return out;
      }
    }
    return null;
  }

  // Kladversie van een zin met 3–5 fouten, of null als de zin daar te kort voor is.
  function makeDraft(sentence, lang) {
    let tokens = tokenize(sentence).map((t) => tok(t, true));
    if (wordPositions(tokens).length < MIN_DRAFT_WORDS) return null;
    const wanted = MIN_DRAFT_ERRORS + Math.floor(Math.random() * 3);
    const used = new Map();
    let made = 0;
    while (made < wanted) {
      const next = changeOnce(tokens, lang, used);
      if (!next) break;
      tokens = next;
      made++;
    }
    const draft = tokens.map((t) => t.s).join('');
    return made >= MIN_DRAFT_ERRORS && draft !== sentence ? draft : null;
  }

  // Kiest welke zinnen eerst als kladversie komen, en na hoeveel zinnen hij teruggaat.
  // Hij blijft binnen dezelfde alinea; zo hoeft de cursor nooit over een nieuwe regel of een opsommingsteken.
  function chooseRewrites(chars) {
    const sentences = findSentences(chars);
    const lang = detectLanguage(chars.join(''));
    const fixes = [];
    for (let k = 0; k < sentences.length; k++) {
      const s = sentences[k];
      let after = 0;
      while (after < MAX_BACK && k + after + 1 < sentences.length && sentences[k + after + 1].para === s.para) after++;
      if (!after || Math.random() >= settings.rewriteRate / 100) continue;
      const back = 1 + Math.floor(Math.random() * after);
      const last = sentences[k + back];
      if (RISKY_RE.test(chars.slice(s.start, last.end).join(''))) continue;
      const final = chars.slice(s.start, s.end);
      const draft = makeDraft(final.join(''), lang);
      if (!draft) continue;

      // gapChars: wat hij na de kladzin nog typt voordat hij teruggaat (daar loopt de cursor overheen).
      const fix = { start: s.start, end: s.end, gapChars: chars.slice(s.end, last.end), final, draft: Array.from(draft) };
      fix.gap = fix.gapChars.length;
      fix.style = settings.rewriteStyle === 'mix' ? (Math.random() < 0.5 ? 'sentence' : 'diff') : settings.rewriteStyle;
      if (fix.style === 'diff') {
        const { edits, caret } = planEdits(draft, final.join(''));
        fix.edits = edits;
        fix.caret = caret;
      } else {
        fix.finalPace = makePace(final);
      }
      fixes.push(fix);
      k += back;
    }
    return fixes;
  }

  // Alles wat de Auto typer nodig heeft: wat hij typt (met kladzinnen), waar hij teruggaat, en het tempo.
  function planTyping(chars) {
    const fixes = settings.rewriteOn ? chooseRewrites(chars) : [];
    const stream = [];
    const copy = (from, to) => { for (let k = from; k < to; k++) stream.push(chars[k]); };
    let pos = 0;
    fixes.forEach((fix) => {
      copy(pos, fix.start);
      fix.streamStart = stream.length;
      fix.draft.forEach((ch) => stream.push(ch));
      fix.streamAt = stream.length + fix.gap; // hier gaat hij terug: na de laatste zin die hij doortypt
      pos = fix.end;
    });
    copy(pos, chars.length);
    return { stream, fixes, pace: makePace(stream, { warmUp: true, bursts: settings.burstOn }) };
  }

  // Het plan bewaren we, zodat de tijdschatting in het paneel hoort bij wat hij bij Start echt doet.
  let typingPlan = null;

  function currentTypingPlan(text) {
    const key = [text, settings.rewriteOn, settings.rewriteRate, settings.rewriteStyle, settings.burstOn].join('\u0000');
    if (!typingPlan || typingPlan.key !== key) typingPlan = Object.assign(planTyping(toChars(text)), { key });
    return typingPlan;
  }

  // Rustig teruglopen: de cursor gaat woord voor woord, met een korte pauze na elk woord.
  function walkSteps(chars) {
    return (chars.join('').match(/\S+\s*|\s+/g) || []).map(charLength);
  }

  function walkTime(chars) {
    return walkSteps(chars).reduce((ms, n) => ms + arrowTime(n) + WALK_WORD_MS * tempoFactor, 0);
  }

  function rewriteCost(fix) {
    const reading = settings.readPause * 1000 + 300;
    return reading + withTempo(100 / settings.rewriteTempo, () => {
      if (fix.style === 'diff') {
        let ms = walkTime(fix.draft.concat(fix.gapChars)) + 450 * tempoFactor +
          walkTime(fix.final.slice(fix.caret).concat(fix.gapChars));
        fix.edits.forEach((e, k) => {
          ms += (k ? 550 * tempoFactor : 0) + walkTime(fix.draft.slice(e.from, e.start + e.delLen)) + changeCost(e);
        });
        return ms;
      }
      return 2 * walkTime(fix.gapChars) + 350 + fix.draft.length * charDelay() * 0.6 + charDelay() + 550 +
        450 * tempoFactor + buildEstimate(fix.final, fix.finalPace)[0];
    });
  }

  // 'breaks': lange pauzes tussendoor (als je een lange tijd hebt ingevuld).
  function buildPlanEstimate(plan, breaks) {
    return withTempo(1, () => {
      const extra = new Map(plan.fixes.map((fix) => [fix.streamAt, rewriteCost(fix)]));
      if (breaks) breaks.forEach((ms, j) => extra.set(j, (extra.get(j) || 0) + ms));
      return buildEstimate(plan.stream, plan.pace, (j) => extra.get(j) || 0);
    });
  }

  // ---------------------------------------------------------------------------
  // Klaar in een vaste tijd: zelf de snelheid uitrekenen
  // ---------------------------------------------------------------------------

  const MIN_AUTO_WPM = 20;  // langzamer typt hij niet; is er dan nog tijd over, dan neemt hij pauzes
  const MAX_WPM = 300;
  const BREAK_MS = 3 * 60000; // een lange pauze duurt gemiddeld zo lang

  function targetTime() {
    return ((Number(settings.targetHours) || 0) * 60 + (Number(settings.targetMinutes) || 0)) * 60000;
  }

  function formatTarget() {
    const h = Number(settings.targetHours) || 0;
    const m = Number(settings.targetMinutes) || 0;
    return [h ? plural(h, 'uur', 'uur') : '', m ? plural(m, 'minuut', 'minuten') : ''].filter(Boolean).join(' en ');
  }

  // Welke snelheid (en hoeveel pauze tussendoor) hoort bij de ingevulde tijd?
  // {wpm: null} = geen tijd ingevuld; {tooShort: true, minimum} = lukt niet, ook niet op de hoogste snelheid.
  function solveTiming(plan) {
    const target = targetTime();
    if (!target) return { wpm: null, breaks: null };
    const duration = (wpm) => withWpm(wpm, () => buildPlanEstimate(plan)[0]);
    const fastest = duration(MAX_WPM);
    if (fastest > target) return { wpm: MAX_WPM, tooShort: true, minimum: fastest, breaks: null };
    const slowest = duration(MIN_AUTO_WPM);
    if (slowest <= target) {
      const breaks = planBreaks(plan.stream, target - slowest);
      return { wpm: MIN_AUTO_WPM, breaks, breakTotal: breaks.size ? target - slowest : 0 };
    }
    let lo = MIN_AUTO_WPM;
    let hi = MAX_WPM;
    for (let k = 0; k < 20; k++) {
      const mid = (lo + hi) / 2;
      if (duration(mid) > target) lo = mid;
      else hi = mid;
    }
    return { wpm: hi, breaks: null };
  }

  // Lange pauzes: liefst na een alinea, anders na een zin. Samen precies 'total' ms.
  function planBreaks(stream, total) {
    const breaks = new Map();
    const paragraphs = [];
    const sentences = [];
    for (let j = 2; j < stream.length; j++) {
      if (stream[j - 1] === '\n' && stream[j] !== '\n') paragraphs.push(j);
      else if (stream[j - 1] === ' ' && SENTENCE_END.has(stream[j - 2])) sentences.push(j);
    }
    const shuffled = (list) => list.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const wanted = Math.max(1, Math.round(total / BREAK_MS));
    let points = shuffled(paragraphs).slice(0, wanted);
    if (points.length < wanted) points = points.concat(shuffled(sentences).slice(0, wanted - points.length));
    if (!points.length) return breaks;
    const weights = points.map(() => 0.6 + Math.random() * 0.8);
    const sum = weights.reduce((a, b) => a + b, 0);
    points.forEach((j, k) => breaks.set(j, (total * weights[k]) / sum));
    return breaks;
  }

  async function takeBreak(ms) {
    const end = activeTime() + ms;
    while (activeTime() < end) {
      setStatus('Even pauze… nog ' + formatDuration(end - activeTime()) + '. Daarna typt hij vanzelf verder.');
      await wait(Math.min(1000, end - activeTime()));
    }
  }

  function shorten(text) {
    const words = text.split(/\s+/);
    return words.length > 6 ? words.slice(0, 6).join(' ') + '…' : text;
  }

  // ---------------------------------------------------------------------------
  // Typen: starten, pauzeren, stoppen
  // ---------------------------------------------------------------------------

  const STOP = new Error('gestopt');

  const run = {
    active: false,
    mode: 'type',       // 'type' | 'improve' | 'test'
    paused: false,
    stopRequested: false,
    method: null,
    plan: null,         // Auto typer: wat hij typt en waar hij teruggaat
    fixIndex: 0,        // Auto typer: de volgende zin die hij herschrijft
    breaks: null,       // Auto typer: lange pauzes tussendoor (bij een ingevulde tijd)
    edits: [],          // Verbeter-typer: de wijzigingen
    done: 0,
    total: 0,
    estimate: null,     // verwachte resterende tijd per stap
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

  function beginRun(mode, fields) {
    Object.assign(run, {
      active: true,
      mode: mode,
      paused: false,
      stopRequested: false,
      method: settings.method === 'auto' ? null : settings.method,
      plan: null,
      fixIndex: 0,
      breaks: null,
      edits: [],
      done: 0,
      total: 0,
      estimate: null,
      startedAt: 0,
      pausedAt: 0,
      pausedTotal: 0,
      waiters: [],
      countingDown: settings.countdown > 0,
    }, fields);

    const focused = ui.host.shadowRoot.activeElement;
    if (focused) focused.blur();
    focusDocument();
    watchEscape();
    keepScreenOn(true);
    updateControls();
    updateProgress();
  }

  async function countdown(message) {
    for (let s = settings.countdown; s > 0; s--) {
      setStatus('Begint over ' + s + '… ' + message);
      await wait(1000);
    }
    run.countingDown = false;
    focusDocument();
    await wait(150);
    run.startedAt = Date.now();
    updateControls();
  }

  function endRun() {
    paceWpm = null;
    run.active = false;
    run.paused = false;
    run.countingDown = false;
    keepScreenOn(false);
    updateControls();
    updateProgress();
    updateMeta();
  }

  function showError(e, stoppedMessage) {
    if (e === STOP) {
      setStatus(stoppedMessage);
    } else {
      setStatus(e.message || String(e), 'error');
    }
  }

  // Eén wijziging: cursor erheen, het oude stuk wissen, het nieuwe stuk typen.
  async function applyEdit(e) {
    await moveCaret(e.move);
    await changeAt(e);
  }

  // Het oude stuk wissen en het nieuwe typen (de cursor staat al achter het oude stuk).
  async function changeAt(e) {
    if (e.delLen) {
      await wait(200 + Math.random() * 300);
      await deleteChars(e.delLen);
    }
    if (e.insChars.length) {
      await wait(charDelay() * jitter());
      await typeSequence(e.insChars);
    }
  }

  // Cursor rustig woord voor woord over 'chars' heen (de tekst tussen de cursor en waar hij heen moet).
  async function walkCaret(chars, direction) {
    const steps = walkSteps(chars);
    if (direction < 0) steps.reverse();
    for (const n of steps) {
      await moveCaret(direction * n);
      await wait(spread(WALK_WORD_MS) * tempoFactor);
    }
  }

  // Rustig terug naar de kladzin, hem verbeteren, en weer verder waar hij was.
  async function rewriteSentence(fix) {
    await wait(spread(settings.readPause * 1000) + 300); // even teruglezen
    tempoFactor = 100 / settings.rewriteTempo;
    try {
      if (fix.style === 'diff') {
        await walkCaret(fix.draft.concat(fix.gapChars), -1);
        for (let k = 0; k < fix.edits.length; k++) {
          const e = fix.edits[k];
          if (k > 0) await wait((300 + Math.random() * 500) * tempoFactor);
          await walkCaret(fix.draft.slice(e.from, e.start + e.delLen), 1);
          await changeAt(e);
        }
        await wait((250 + Math.random() * 400) * tempoFactor);
        await walkCaret(fix.final.slice(fix.caret).concat(fix.gapChars), 1);
      } else {
        await walkCaret(fix.gapChars, -1);
        await wait(200 + Math.random() * 300);
        await deleteChars(fix.draft.length);
        await wait(charDelay() * jitter() + 300 + Math.random() * 500);
        await typeSequence(fix.final, fix.finalPace);
        await wait((250 + Math.random() * 400) * tempoFactor);
        await walkCaret(fix.gapChars, 1);
      }
    } finally {
      tempoFactor = 1;
    }
  }

  async function startTyping() {
    if (run.active) return;
    const text = ui.textarea.value;
    if (!text.trim()) {
      setStatus('Plak eerst je tekst in het vak hierboven.', 'warn');
      return;
    }

    const plan = currentTypingPlan(text);
    const timing = solveTiming(plan);
    if (timing.tooShort) {
      setStatus('Dat lukt niet in ' + formatTarget() + ': ook op de hoogste snelheid duurt het minstens ' +
        formatDuration(timing.minimum) + '. Vul een langere tijd in.', 'warn');
      return;
    }
    typingPlan = null; // de volgende keer weer andere zinnen
    paceWpm = timing.wpm;
    beginRun('type', { plan: plan, breaks: timing.breaks, total: plan.stream.length,
      estimate: buildPlanEstimate(plan, timing.breaks) });

    try {
      await countdown('Tik nu in je document waar de tekst moet komen.');
      setStatus('Bezig met typen…');
      await typeSequence(plan.stream, plan.pace, (done) => {
        run.done = done;
        updateProgress();
      }, async (done) => {
        const fix = plan.fixes[run.fixIndex];
        if (fix && fix.streamAt === done) {
          setStatus('Zin verbeteren…');
          await rewriteSentence(fix);
          run.fixIndex++;
          setStatus('Bezig met typen…');
        }
        const pause = timing.breaks && timing.breaks.get(done);
        if (pause) {
          await takeBreak(pause);
          setStatus('Bezig met typen…');
        }
      });
      const words = countWords(text);
      const rewritten = plan.fixes.length ? ', ' + plural(plan.fixes.length, 'zin', 'zinnen') + ' herschreven' : '';
      setStatus('Klaar! ✓ ' + words + ' ' + (words === 1 ? 'woord' : 'woorden') +
        ' getypt in ' + formatDuration(activeTime()) + rewritten + '.', 'ok');
    } catch (e) {
      const fix = plan.fixes[run.fixIndex];
      const draftNote = fix && run.done > fix.streamStart
        ? ' Let op: de zin "' + shorten(fix.final.join('')) + '" is misschien nog niet verbeterd. Kijk die even na.'
        : '';
      showError(e, 'Gestopt na ' + run.done.toLocaleString('nl-NL') + ' tekens.' + draftNote);
    } finally {
      endRun();
    }
  }

  async function startImproving() {
    if (run.active) return;
    if (!ui.oldTextarea.value.trim() || !ui.newTextarea.value.trim()) {
      setStatus('Plak allebei de teksten: de tekst die nu in je document staat, en je nieuwe tekst.', 'warn');
      return;
    }
    const plan = planImprovement(ui.oldTextarea.value, ui.newTextarea.value);
    if (!plan.edits.length) {
      setStatus('Er zijn geen verschillen tussen de twee teksten.', 'warn');
      return;
    }

    beginRun('improve', { edits: plan.edits, total: plan.edits.length, estimate: buildEditEstimate(plan.edits) });

    try {
      await countdown('Tik niet in je document: hij zoekt zelf het begin op.');
      setStatus('Begin van je document opzoeken…');
      await goToDocumentStart();

      for (let k = 0; k < plan.edits.length; k++) {
        const e = plan.edits[k];
        if (k > 0) await wait(spread(settings.readPause * 1000));
        setStatus('Wijziging ' + (k + 1) + ' van ' + plan.edits.length + '…');
        await applyEdit(e);
        run.done = k + 1;
        updateProgress();
      }
      setStatus('Klaar! ✓ ' + plan.edits.length + ' ' + (plan.edits.length === 1 ? 'wijziging' : 'wijzigingen') +
        ' gedaan in ' + formatDuration(activeTime()) + '. Controleer even of alles goed staat.', 'ok');
    } catch (e) {
      showError(e, 'Gestopt na ' + run.done + ' van de ' + run.total + ' wijzigingen. ' +
        'Let op: plak de tekst uit je document opnieuw in "Tekst nu in je document" voordat je opnieuw begint.');
    } finally {
      endRun();
    }
  }

  function pauseTyping() {
    if (!run.active || run.paused || run.mode === 'test') return;
    run.paused = true;
    run.pausedAt = Date.now();
    if (run.mode === 'improve') {
      setStatus('Gepauzeerd. Tik niet in je document, anders klopt de plek van de volgende wijziging niet. Druk op Verder om door te gaan.');
    } else if (run.plan && run.fixIndex < run.plan.fixes.length) {
      setStatus('Gepauzeerd. Tik niet in je document, anders gaat het herschrijven van een zin mis. Druk op Verder om door te gaan.');
    } else {
      setStatus('Gepauzeerd. Druk op Verder om door te gaan.');
    }
    keepScreenOn(false);
    updateControls();
  }

  function resumeTyping() {
    if (!run.active || !run.paused) return;
    if (run.startedAt) run.pausedTotal += Date.now() - run.pausedAt;
    run.paused = false;
    focusDocument();
    keepScreenOn(true);
    setStatus(run.countingDown ? 'Aftellen…' : 'Bezig…');
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
    run.mode = 'test';
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
    [hidden] { display: none !important; }
    .panel {
      position: fixed; z-index: 2147483000; width: ${PANEL_WIDTH}px; max-height: calc(100vh - 24px);
      display: flex; flex-direction: column; background: #fff; color: var(--text);
      border: 2px solid #007aff; border-radius: 16px; box-shadow: 0 12px 36px rgba(20, 22, 40, .22);
      font-size: 14px; line-height: 1.4; overflow: hidden;
    }
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
    .tabs { display: flex; gap: 4px; padding: 4px; margin-bottom: 10px; border-radius: 12px; background: var(--soft); }
    .tab {
      flex: 1; height: 36px; border: 0; border-radius: 9px; background: transparent; color: var(--muted);
      font-size: 14px; font-weight: 600; cursor: pointer;
    }
    .tab.active { background: #fff; color: var(--text); box-shadow: 0 1px 3px rgba(20, 22, 40, .14); }
    .tab:disabled { cursor: default; }
    .field-label { display: block; font-size: 12.5px; font-weight: 600; margin: 8px 2px 4px; }
    .field-label:first-child { margin-top: 0; }
    textarea {
      width: 100%; min-height: 120px; max-height: 40vh; resize: vertical; padding: 10px; border-radius: 10px;
      border: 1px solid var(--line); background: var(--soft); color: var(--text); font-size: 14px; line-height: 1.45;
    }
    textarea.small { min-height: 84px; }
    textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; background: #fff; }
    textarea[readonly] { opacity: .7; }
    .meta { color: var(--muted); font-size: 12.5px; margin: 6px 2px 10px; }
    .preview {
      margin-top: 8px; max-height: 190px; overflow-y: auto; padding: 8px 10px; border: 1px solid var(--line);
      border-radius: 10px; font-size: 13px; line-height: 1.55; white-space: pre-wrap; overflow-wrap: anywhere;
    }
    .preview .del { background: #fde2e2; color: #a1231f; text-decoration: line-through; border-radius: 3px; }
    .preview .ins { background: #dcf5e3; color: #17602f; border-radius: 3px; }
    .preview .del + .ins { margin-left: 3px; }
    .preview .gap { color: var(--muted); }
    .note { color: #7a5200; font-size: 12px; margin-top: 4px; }
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
    .row > select { width: 100%; margin-top: 4px; }
    .toggles { display: grid; gap: 6px; margin: 0 0 12px; }
    .meta.warn-text { color: #b45309; font-weight: 600; }
    .duration {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 10px;
      border: 1px solid var(--line); border-radius: 10px; font-size: 13.5px;
    }
    .duration .switch-title { margin-right: 4px; }
    .duration input {
      width: 58px; height: 34px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--line);
      background: var(--soft); color: var(--text); font-size: 15px; text-align: center;
    }
    .duration input:focus { outline: 2px solid var(--accent); outline-offset: -1px; background: #fff; }
    .duration input:disabled { opacity: .5; }
    .duration .hint { flex-basis: 100%; }
    input[type=range]:disabled { opacity: .5; }
    .switch {
      position: relative; display: flex; align-items: center; gap: 10px; padding: 8px 10px; cursor: pointer;
      border: 1px solid var(--line); border-radius: 10px; user-select: none; -webkit-user-select: none;
    }
    .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; pointer-events: none; }
    .track { position: relative; flex: none; width: 40px; height: 24px; border-radius: 99px; background: #cfd3dd; transition: background .15s; }
    .track::after {
      content: ""; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%;
      background: #fff; box-shadow: 0 1px 3px rgba(20, 22, 40, .3); transition: transform .15s;
    }
    .switch input:checked + .track { background: var(--accent); }
    .switch input:checked + .track::after { transform: translateX(16px); }
    .switch input:focus-visible + .track { outline: 2px solid var(--accent); outline-offset: 2px; }
    .switch input:disabled + .track { opacity: .45; }
    .switch-text { display: flex; flex-direction: column; min-width: 0; }
    .switch-title { font-size: 13.5px; font-weight: 600; }
    .group {
      margin: 18px 0 0; padding-top: 10px; border-top: 1px dashed var(--line); color: var(--muted);
      font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em;
    }
    .group .hint { text-transform: none; letter-spacing: 0; font-weight: 400; margin-top: 2px; }
    .profiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
    .profiles button.btn { height: 36px; font-size: 13.5px; }
    .profiles button.btn.active { border-color: var(--accent); color: var(--accent); background: #eef0ff; }
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

  function plural(n, one, many) {
    return n.toLocaleString('nl-NL') + ' ' + (n === 1 ? one : many);
  }

  // Snelkeuze: een setje instellingen in één keer. 'Gemiddeld' is hetzelfde als de standaard.
  const PROFILES = [
    ['Rustig', { wpm: 30, variation: 60, sentencePause: 1.2, paragraphPause: 3, typoRate: 3, burstPause: 1.5, readPause: 3 }],
    ['Gemiddeld', { wpm: 45, variation: 50, sentencePause: 0.6, paragraphPause: 1.5, typoRate: 2, burstPause: 1, readPause: 2 }],
    ['Snel', { wpm: 75, variation: 40, sentencePause: 0.3, paragraphPause: 0.8, typoRate: 1.5, burstPause: 0.6, readPause: 1 }],
  ];

  const sliderRows = {};
  const profileButtons = [];

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
    sliderRows[key] = {
      input,
      val,
      refresh: () => {
        input.value = String(settings[key]);
        show();
      },
    };

    row.append(top, input);
    if (hint) row.append(el('div', 'hint', hint));
    return row;
  }

  // Aan/uit-schakelaar; geeft [rij, vinkje] terug.
  function toggleRow(label, key, hint) {
    const row = el('label', 'switch');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!settings[key];
    input.addEventListener('change', () => {
      settings[key] = input.checked;
      onSettingsChanged();
    });
    const text = el('span', 'switch-text');
    text.append(el('span', 'switch-title', label));
    if (hint) text.append(el('span', 'hint', hint));
    row.append(input, el('span', 'track'), text);
    return [row, input];
  }

  function selectRow(label, key, options, hint) {
    const row = el('div', 'row');
    const top = el('div', 'row-top');
    const lab = el('label', null, label);
    lab.htmlFor = 'at-' + key;
    top.append(lab);
    const select = el('select');
    select.id = 'at-' + key;
    options.forEach(([value, text]) => select.append(new Option(text, value)));
    select.value = settings[key];
    select.addEventListener('change', () => {
      settings[key] = select.value;
      onSettingsChanged();
    });
    row.append(top, select);
    if (hint) row.append(el('div', 'hint', hint));
    return row;
  }

  // "Klaar in [uur] [min]"; geeft [rij, invoervakjes] terug.
  function durationRow() {
    const box = el('div', 'duration');
    const fields = [];
    box.append(el('span', 'switch-title', 'Klaar in'));
    [['targetHours', 'uur', 'Uren', 99], ['targetMinutes', 'min', 'Minuten', 999]].forEach(([key, unit, name, max]) => {
      const input = el('input');
      input.type = 'number';
      input.min = '0';
      input.max = String(max);
      input.step = '1';
      input.inputMode = 'numeric';
      input.placeholder = '0';
      input.value = settings[key] ? String(settings[key]) : '';
      input.setAttribute('aria-label', name);
      input.addEventListener('input', () => {
        const v = Math.floor(Number(input.value));
        settings[key] = Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0;
        onSettingsChanged();
      });
      box.append(input, el('span', null, unit));
      fields.push(input);
    });
    box.append(el('span', 'hint', 'Leeg laten = je gewone snelheid. Vul je een tijd in, dan rekent hij de snelheid zelf uit.'));
    return [box, fields];
  }

  // Met een ingevulde tijd staat het schuifje Snelheid op automatisch.
  function showAutoWpm(auto, wpm) {
    const row = sliderRows.wpm;
    row.input.disabled = auto;
    if (!auto) row.refresh();
    else row.val.textContent = wpm ? 'automatisch: ' + Math.round(wpm) + ' wpm' : 'automatisch';
  }

  function groupTitle(title, hint) {
    const head = el('div', 'group', title);
    if (hint) head.append(el('div', 'hint', hint));
    return head;
  }

  function profileRow() {
    const row = el('div', 'row');
    const top = el('div', 'row-top');
    top.append(el('label', null, 'Snelkeuze'));
    const list = el('div', 'profiles');
    PROFILES.forEach(([name, values]) => {
      const button = el('button', 'btn', name);
      button.type = 'button';
      button.addEventListener('click', () => {
        Object.assign(settings, values);
        Object.keys(values).forEach((key) => { if (sliderRows[key]) sliderRows[key].refresh(); });
        onSettingsChanged();
      });
      profileButtons.push([button, values]);
      list.append(button);
    });
    row.append(top, list, el('div', 'hint', 'Zet snelheid, variatie, pauzes en tikfouten in één keer. Daarna kun je nog zelf schuiven.'));
    return row;
  }

  // Het profiel waar alle instellingen nog precies op staan, lichten we op.
  function markProfile() {
    profileButtons.forEach(([button, values]) => {
      button.classList.toggle('active', Object.keys(values).every((key) => Math.abs(settings[key] - values[key]) < 1e-6));
    });
  }

  function textField(label, key, placeholder, small) {
    const lab = el('label', 'field-label', label);
    lab.htmlFor = 'at-field-' + key;
    const textarea = el('textarea', small ? 'small' : null);
    textarea.id = 'at-field-' + key;
    textarea.placeholder = placeholder;
    textarea.value = loadText(key);
    textarea.spellcheck = false;
    let saveTimer = 0;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => saveText(key, textarea.value), 400);
      updateMeta();
    });
    return [lab, textarea];
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

    // Tabbladen
    const tabs = el('div', 'tabs');
    const typeTab = el('button', 'tab', 'Auto typer');
    const improveTab = el('button', 'tab', 'Verbeter-typer');
    [typeTab, improveTab].forEach((b) => { b.type = 'button'; });
    tabs.append(typeTab, improveTab);

    // Auto typer
    const typeSection = el('div');
    const [, textarea] = textField('Tekst', TEXT_KEY, 'Plak hier de tekst die getypt moet worden…');
    const typeMeta = el('div', 'meta');
    const toggles = el('div', 'toggles');
    const [rewriteRow, rewriteToggle] = toggleRow('Zinnen herschrijven', 'rewriteOn',
      'Gaat soms 1–3 zinnen terug en verbetert rustig een zin met 3–5 fouten.');
    const [burstRow, burstToggle] = toggleRow('Snel typen in stukjes', 'burstOn',
      'Een paar woorden snel, even nadenken, dan weer verder.');
    const [durationBox, durationFields] = durationRow();
    toggles.append(rewriteRow, burstRow, durationBox);
    typeSection.append(textarea, typeMeta, toggles);

    // Verbeter-typer
    const improveSection = el('div');
    const [oldLabel, oldTextarea] = textField('1. Tekst nu in je document', OLD_TEXT_KEY,
      'In Google Docs: Bewerken → Alles selecteren, kopiëren, en hier plakken…', true);
    const [newLabel, newTextarea] = textField('2. Nieuwe tekst', NEW_TEXT_KEY,
      'Plak hier je verbeterde tekst…', true);
    const previewLabel = el('div', 'field-label', 'Wat er verandert');
    const preview = el('div', 'preview');
    const improveNote = el('div', 'note');
    const improveMeta = el('div', 'meta');
    improveSection.append(oldLabel, oldTextarea, newLabel, newTextarea, previewLabel, preview, improveNote, improveMeta);

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
    const status = el('div', 'status');

    // Instellingen
    const details = el('details');
    details.open = !!settings.settingsOpen;
    details.addEventListener('toggle', () => {
      settings.settingsOpen = details.open;
      saveSettings();
    });
    details.append(el('summary', null, 'Instellingen'));

    const rhythmRow = el('div', 'row');
    rhythmRow.append(toggleRow('Natuurlijk ritme', 'rhythm',
      'Korte, bekende woorden gaan sneller; lange woorden, hoofdletters, cijfers en leestekens langzamer. In het begin warmt hij even op.')[0]);

    details.append(
      profileRow(),
      sliderRow('Snelheid', 'wpm', 10, 300, 1, (v) => v + ' woorden per minuut',
        'Gemiddeld typt iemand 35–45 woorden per minuut.'),
      sliderRow('Menselijke variatie', 'variation', 0, 100, 5, (v) => (v === 0 ? 'uit (robot)' : v + '%'),
        'Hoe meer variatie, hoe ongelijker de tijd tussen de letters.'),
      rhythmRow,
      sliderRow('Pauze na een zin', 'sentencePause', 0, 5, 0.1, (v) => formatNumber(v) + ' s',
        'Extra wachten na . ! ? (na een komma ongeveer een derde hiervan).'),
      sliderRow('Pauze na een alinea', 'paragraphPause', 0, 10, 0.5, (v) => formatNumber(v) + ' s',
        'Extra wachten na een nieuwe regel.'),
      sliderRow('Tikfouten', 'typoRate', 0, 10, 0.5, (v) => (v === 0 ? 'uit' : formatNumber(v) + ' per 100 woorden'),
        'Typt soms een verkeerde letter en verbetert die meteen.'),

      groupTitle('Zinnen herschrijven', 'Zet dit aan op het tabblad Auto typer.'),
      sliderRow('Hoe vaak', 'rewriteRate', 5, 50, 5, (v) => 'ongeveer 1 op de ' + Math.round(100 / v) + ' zinnen',
        'Hij typt eerst een kladversie van de zin met 3–5 fouten (spelfouten, een woord vergeten of te veel, een ander woord, ' +
        'een komma, een zinsdeel op een andere plek), typt 1–3 zinnen verder en gaat dan rustig terug om hem te verbeteren. ' +
        'Zinnen van minder dan 6 woorden slaat hij over. Aan het eind staat je tekst er precies zo als je hem hebt geplakt.'),
      sliderRow('Tempo bij verbeteren', 'rewriteTempo', 20, 100, 10,
        (v) => (v === 100 ? 'gewone snelheid' : v + '% van je snelheid'),
        'Hoe rustig hij typt en wist als hij een zin verbetert. De cursor loopt dan ook woord voor woord terug, en weer verder.'),
      selectRow('Hoe verbeteren', 'rewriteStyle',
        [['mix', 'Afwisselend'], ['sentence', 'Hele zin wissen en opnieuw typen'], ['diff', 'Alleen het verschil aanpassen']]),

      groupTitle('Snel typen in stukjes', 'Zet dit aan op het tabblad Auto typer.'),
      sliderRow('Denkpauze tussen stukjes', 'burstPause', 0.2, 3, 0.1, (v) => formatNumber(v) + ' s',
        'Hij typt steeds 1–4 woorden snel achter elkaar en denkt dan even na. Hoe langer de denkpauze, hoe sneller de stukjes ' +
        'ertussen, zodat je gemiddelde snelheid gelijk blijft. Alleen bij een hoge snelheid met een lange pauze wordt het gemiddelde wat lager.'),

      groupTitle('Overig'),
      sliderRow('Leespauze', 'readPause', 0, 10, 0.5, (v) => formatNumber(v) + ' s',
        'Even "lezen" voordat hij iets verandert: in de Verbeter-typer en bij Zinnen herschrijven.'),
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

    body.append(tabs, typeSection, improveSection, buttons, progress, stats, status, details, tip);
    panel.append(header, body);

    // Klein gemaakt: alleen een rond knopje
    const bubble = el('button', 'bubble', '⌨️');
    bubble.type = 'button';
    bubble.title = 'Auto Typer openen';
    bubble.setAttribute('aria-label', 'Auto Typer openen');

    shadow.append(panel, bubble);
    document.documentElement.append(host);

    Object.assign(ui, {
      host, panel, header, typeTab, improveTab, typeSection, improveSection, textarea, typeMeta,
      rewriteToggle, burstToggle, durationFields, oldTextarea, newTextarea, preview, improveNote, improveMeta,
      startBtn, pauseBtn, stopBtn, testBtn, select, bar, stats, status, bubble,
    });

    typeTab.addEventListener('click', () => setTab('type'));
    improveTab.addEventListener('click', () => setTab('improve'));
    startBtn.addEventListener('click', () => (settings.tab === 'improve' ? startImproving() : startTyping()));
    pauseBtn.addEventListener('click', () => (run.paused ? resumeTyping() : pauseTyping()));
    stopBtn.addEventListener('click', stopTyping);
    testBtn.addEventListener('click', runTest);
    minBtn.addEventListener('click', () => setMinimized(true));
    bubble.addEventListener('click', () => setMinimized(false));

    enableDragging(header);
    window.addEventListener('resize', () => placePanel());
    setMinimized(!!settings.minimized);
    setTab(settings.tab === 'improve' ? 'improve' : 'type');
    placePanel();
    markProfile();
    updateControls();
  }

  // ---------------------------------------------------------------------------
  // Paneel bijwerken
  // ---------------------------------------------------------------------------

  function setStatus(text, kind) {
    ui.status.textContent = text;
    ui.status.className = 'status' + (kind ? ' ' + kind : '');
  }

  function setTab(tab) {
    if (run.active) return;
    settings.tab = tab;
    saveSettings();
    const improve = tab === 'improve';
    ui.typeTab.classList.toggle('active', !improve);
    ui.improveTab.classList.toggle('active', improve);
    ui.typeSection.hidden = improve;
    ui.improveSection.hidden = !improve;
    run.done = 0;
    run.total = 0;
    updateProgress();
    setStatus(improve
      ? 'Plak de tekst uit je document en je nieuwe tekst, bekijk de wijzigingen en druk op Start.'
      : 'Tik in je document waar de tekst moet komen en druk op Start.');
    updateMeta();
  }

  let metaTimer = 0;

  function onSettingsChanged() {
    saveSettings();
    markProfile();
    if (run.active && run.mode === 'type') {
      run.estimate = buildPlanEstimate(run.plan, run.breaks);
      updateProgress();
    } else if (run.active && run.mode === 'improve') {
      run.estimate = buildEditEstimate(run.edits);
      updateProgress();
    }
    updateMeta();
  }

  function updateMeta() {
    clearTimeout(metaTimer);
    metaTimer = setTimeout(() => {
      if (settings.tab === 'improve') {
        showAutoWpm(false); // de ingevulde tijd geldt alleen voor de Auto typer
        updateImproveMeta();
        return;
      }
      const text = ui.textarea.value;
      if (!text.trim()) {
        showAutoWpm(targetTime() > 0);
        ui.typeMeta.classList.remove('warn-text');
        ui.typeMeta.textContent = 'Nog geen tekst.';
        return;
      }
      const plan = currentTypingPlan(text);
      const timing = solveTiming(plan);
      showAutoWpm(timing.wpm != null, timing.wpm);
      const rewrites = plan.fixes.length ? ' · ' + plural(plan.fixes.length, 'zin', 'zinnen') + ' herschrijven' : '';
      let time;
      if (timing.tooShort) {
        time = ' · Lukt niet in ' + formatTarget() + ': het duurt minstens ' + formatDuration(timing.minimum) + '.';
      } else {
        time = ' · duurt ongeveer ' + formatDuration(withWpm(timing.wpm, () => buildPlanEstimate(plan, timing.breaks)[0]));
        if (timing.wpm) {
          time += ' (' + Math.round(timing.wpm) + ' wpm' +
            (timing.breakTotal ? ', met ' + formatDuration(timing.breakTotal) + ' pauze tussendoor' : '') + ')';
        }
      }
      ui.typeMeta.classList.toggle('warn-text', !!timing.tooShort);
      ui.typeMeta.textContent = plural(countWords(text), 'woord', 'woorden') + ' · ' +
        plural(toChars(text).length, 'teken', 'tekens') + rewrites + time;
    }, 150);
  }

  // Kleurenoverzicht: rood doorgestreept = weg, groen = erbij.
  function updateImproveMeta() {
    const preview = ui.preview;
    preview.replaceChildren();
    ui.improveNote.textContent = '';
    if (!ui.oldTextarea.value.trim() || !ui.newTextarea.value.trim()) {
      preview.append(el('span', 'gap', 'Hier zie je de wijzigingen zodra je allebei de teksten hebt geplakt.'));
      ui.improveMeta.textContent = '';
      return;
    }

    const plan = planImprovement(ui.oldTextarea.value, ui.newTextarea.value);
    ui.improveNote.textContent = plan.note;
    if (!plan.edits.length) {
      preview.append(el('span', 'gap', 'Geen verschillen gevonden: de teksten zijn hetzelfde.'));
      ui.improveMeta.textContent = '';
      return;
    }

    const oldChars = Array.from(plan.oldText);
    const showNewlines = (s) => s.replace(/\n/g, '↵\n');
    const unchanged = (from, to, first, last) => {
      const text = oldChars.slice(from, to).join('');
      const chars = Array.from(text);
      const keep = 60;
      if (chars.length <= keep * 2 + 10) return preview.append(text);
      if (!first) preview.append(chars.slice(0, keep).join(''));
      preview.append(el('span', 'gap', first ? '… ' : ' … '));
      if (!last) preview.append(chars.slice(chars.length - keep).join(''));
    };

    let pos = 0;
    let removed = 0;
    let added = 0;
    plan.edits.forEach((e, k) => {
      unchanged(pos, e.start, k === 0, false);
      if (e.del) preview.append(el('span', 'del', showNewlines(e.del)));
      if (e.ins) preview.append(el('span', 'ins', showNewlines(e.ins)));
      pos = e.start + e.delLen;
      removed += countWords(e.del);
      added += countWords(e.ins);
    });
    unchanged(pos, oldChars.length, false, true);

    const time = buildEditEstimate(plan.edits)[0];
    ui.improveMeta.textContent = plural(plan.edits.length, 'wijziging', 'wijzigingen') + ' · ' +
      removed + ' weg · ' + added + ' erbij · duurt ongeveer ' + formatDuration(time);
  }

  function updateProgress() {
    const total = run.total;
    const pct = total ? Math.floor((run.done / total) * 100) : 0;
    ui.bar.style.width = (total ? (run.done / total) * 100 : 0) + '%';

    if (!total) {
      ui.stats.textContent = '';
    } else {
      const unit = run.mode === 'improve' ? 'wijzigingen' : 'tekens';
      const parts = [pct + '%', run.done.toLocaleString('nl-NL') + ' / ' + total.toLocaleString('nl-NL') + ' ' + unit];
      if (run.active && run.estimate) parts.push('nog ± ' + formatDuration(run.estimate[run.done]));
      const minutes = activeTime() / 60000;
      if (run.active && run.mode === 'type' && minutes > 0.05) parts.push(Math.round(run.done / 5 / minutes) + ' wpm');
      ui.stats.textContent = parts.join(' · ');
    }
    ui.bubble.textContent = run.active && total ? pct + '%' : '⌨️';
  }

  function updateControls() {
    ui.startBtn.disabled = run.active;
    ui.testBtn.disabled = run.active;
    ui.typeTab.disabled = run.active;
    ui.improveTab.disabled = run.active;
    ui.rewriteToggle.disabled = run.active;
    ui.burstToggle.disabled = run.active;
    ui.durationFields.forEach((f) => { f.disabled = run.active; });
    ui.pauseBtn.disabled = !run.active || run.mode === 'test' || (!run.startedAt && !run.countingDown);
    ui.stopBtn.disabled = !run.active || run.mode === 'test';
    ui.pauseBtn.textContent = run.paused ? '▶ Verder' : '⏸ Pauze';
    [ui.textarea, ui.oldTextarea, ui.newTextarea].forEach((t) => { t.readOnly = run.active; });
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

  // Opstarten; als Safari of Google Docs nog niet klaar is, probeert hij het opnieuw.
  function init(attempt) {
    if (window.__autoTyperLoaded || document.getElementById('auto-typer-host')) return;
    if (!document.documentElement || !document.body) {
      if (attempt < 30) setTimeout(() => init(attempt + 1), 300);
      return;
    }
    try {
      buildUI();
      window.__autoTyperLoaded = true;
    } catch (error) {
      const host = document.getElementById('auto-typer-host');
      if (host) host.remove();
      console.error('[Auto Typer] Paneel kon niet starten, nieuwe poging volgt.', error);
      if (attempt < 10) setTimeout(() => init(attempt + 1), 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(0), { once: true });
  } else {
    init(0);
  }
})();
