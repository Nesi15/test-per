'use strict';

/* ============================================================
   Test PER — lógica de la aplicación (JavaScript puro)
   El progreso se guarda en localStorage tras cada respuesta.
   ============================================================ */

const STORE_KEY = 'per-progreso-v1';
const $app = document.getElementById('app');
const $title = document.getElementById('title');
const $home = document.getElementById('btn-home');
const $extra = document.getElementById('topbar-extra');

let DATA = null;      // contenido de preguntas.json
let BY_ID = {};       // id -> pregunta
let BY_TEMA = {};     // tema -> [preguntas]
let S = null;         // estado persistente
let timer = null;

/* ---------------- Utilidades ---------------- */

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
const LETTERS = 'ABCD';

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function temaName(t) { return DATA.temas[t] || `Tema ${t}`; }
function temasDisponibles() {
  return Object.keys(BY_TEMA).map(Number).sort((a, b) => a - b);
}

/* ---------------- Persistencia ---------------- */

function emptyState() {
  return { v: 1, q: {}, rounds: {}, session: null, last: null };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1 && s.q) return Object.assign(emptyState(), s);
    }
  } catch (e) { /* almacenamiento no disponible o corrupto */ }
  return emptyState();
}

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(S));
  } catch (e) {
    toast('No se pudo guardar el progreso en este navegador');
  }
}

/* Estadísticas por pregunta:
   s = veces respondida, ok/ko = aciertos/fallos, str = aciertos seguidos,
   rev = está en "Repasar falladas", lok = acertó la última vez */
function st(id) {
  return S.q[id] || (S.q[id] = { s: 0, ok: 0, ko: 0, str: 0, rev: 0, lok: null, t: 0 });
}

function round(tema) {
  return S.rounds[tema] || (S.rounds[tema] = { n: 1, seen: {} });
}

/* Registra una respuesta (se llama en cada pulsación, y se guarda al momento) */
function record(id, correct) {
  const q = BY_ID[id];
  const x = st(id);
  x.s++; x.t = Date.now(); x.lok = correct;
  if (correct) {
    x.ok++; x.str++;
    if (x.rev && x.str >= 2) x.rev = 0;      // sale de falladas tras 2 aciertos seguidos
  } else {
    x.ko++; x.str = 0; x.rev = 1;
  }
  // Vuelta (ronda) del tema: cuando se han visto todas, empieza otra
  const r = round(q.tema);
  r.seen[id] = 1;
  if ((BY_TEMA[q.tema] || []).every(p => r.seen[p.id])) {
    S.rounds[q.tema] = { n: r.n + 1, seen: {} };
  }
}

/* ---------------- Selección de preguntas ---------------- */

// Prioridad: falladas pendientes primero, luego las que se fallaron la última vez.
function priority(id) {
  const x = S.q[id];
  if (!x) return 1;
  if (x.rev) return 0;
  if (x.lok === false) return 0.5;
  return 1;
}

function ordered(list) {
  return shuffle(list).sort((a, b) => priority(a.id) - priority(b.id));
}

/* Elige n preguntas de los temas dados sin repetir las ya vistas en la vuelta actual.
   Si no quedan suficientes, completa con las ya vistas priorizando las falladas. */
function pick(temas, n) {
  let unseen = [], seen = [];
  for (const t of temas) {
    const r = round(t);
    for (const q of BY_TEMA[t] || []) (r.seen[q.id] ? seen : unseen).push(q);
  }
  if (n === 'all') {
    if (unseen.length) return ordered(unseen).map(q => q.id);
    n = seen.length;
  }
  const out = ordered(unseen).slice(0, n);
  if (out.length < n) out.push(...ordered(seen).slice(0, n - out.length));
  return out.map(q => q.id);
}

/* Orden de opciones: se barajan, pero "Todas/Ninguna…" se queda en su sitio
   y las preguntas con opciones tipo "a y b son correctas" no se barajan. */
const REF_LETTERS = /\b(respuestas?|la|las)?\s*\(?[a-d]\)?\s*,?\s*(y|e)\s+(la\s+)?\(?[a-d]\)?[\s,.]|\b[a-d]\),?\s*(b|c)\)?\s*y\s*[c-d]\)/i;
const PINNED = /(todas|ninguna|anteriores|tres respuestas|son (correctas|ciertas|falsas|incorrectas))/i;

function makePerm(q) {
  const n = q.opciones.length;
  const idx = [...Array(n).keys()];
  if (q.opciones.some(o => REF_LETTERS.test(o + ' '))) return idx;
  const free = idx.filter(i => !PINNED.test(q.opciones[i]));
  const shuffled = shuffle(free);
  return idx.map(i => PINNED.test(q.opciones[i]) ? i : shuffled.shift());
}

/* ---------------- Simulacro ---------------- */

function examPlan() {
  const ex = DATA.examen;
  const bloques = ex.bloques.filter(b => (BY_TEMA[b.tema] || []).length >= b.n);
  const total = bloques.reduce((a, b) => a + b.n, 0);
  const completo = total === ex.preguntas;
  const maxFallosOficial = ex.preguntas - ex.aciertos_min;
  return {
    bloques, total, completo,
    faltan: ex.bloques.filter(b => !bloques.includes(b)).map(b => b.tema),
    minutos: completo ? ex.duracion_min : Math.round(ex.duracion_min * total / ex.preguntas),
    maxFallos: completo ? maxFallosOficial : Math.floor(maxFallosOficial * total / ex.preguntas),
  };
}

/* ---------------- Sesiones de test ---------------- */

function startSession(mode, ids, opts = {}) {
  if (!ids.length) { toast('No hay preguntas para este test'); return; }
  S.session = {
    mode, ids, idx: 0, perm: {}, ans: {},
    temas: opts.temas || [],
    title: opts.title || 'Test',
    instant: opts.instant !== false,
    limit: opts.limit || null,
    elapsed: 0,
    created: Date.now(),
  };
  save();
  go('test');
}

function sessionScore(sess) {
  let ok = 0, ko = 0;
  for (const k in sess.ans) sess.ans[k].ok ? ok++ : ko++;
  return { ok, ko };
}

function confirmReplace(cb) {
  if (!S.session) return cb();
  modal('Hay un test a medias', '<p>Si empiezas otro, se descarta el test en curso. Las respuestas que ya diste siguen contando en tu progreso.</p>', [
    { label: 'Empezar uno nuevo', cls: 'btn', onClick: cb },
    { label: 'Cancelar', cls: 'btn secondary' },
  ]);
}

/* ---------------- Navegación ---------------- */

const VIEWS = {};
let current = 'home';

function go(view, push = true) {
  stopTimer();
  current = view;
  if (push && view !== 'home') history.pushState({ view }, '');
  $home.hidden = view === 'home';
  $extra.textContent = '';
  window.scrollTo(0, 0);
  VIEWS[view]();
}

window.addEventListener('popstate', () => {
  if (current !== 'home') go('home', false);
});
$home.addEventListener('click', () => { history.replaceState(null, ''); go('home', false); });

/* ---------------- Vista: inicio ---------------- */

VIEWS.home = () => {
  $title.textContent = 'Test PER';
  const nFall = Object.values(S.q).filter(x => x.rev).length;
  const plan = examPlan();
  const sess = S.session;
  let html = '';
  if (sess) {
    const sc = sessionScore(sess);
    const answered = Object.keys(sess.ans).length;
    html += `<section class="card resume">
      <h2>Continuar donde lo dejaste</h2>
      <div>${esc(sess.title)}</div>
      <div class="muted">Pregunta ${Math.min(sess.idx + 1, sess.ids.length)} de ${sess.ids.length} · ${answered} respondidas ·
        <span style="color:var(--ok)">✓ ${sc.ok}</span> · <span style="color:var(--ko)">✗ ${sc.ko}</span>
        ${sess.limit ? ` · ⏱ ${fmtTime(sess.limit - sess.elapsed)}` : ''}</div>
      <div class="row">
        <button class="btn" id="resume">Continuar</button>
        <button class="btn secondary" id="discard" style="max-width:40%">Descartar</button>
      </div>
    </section>`;
  }
  html += `<nav class="menu">
    <button class="menu-btn" data-go="setupTema"><span class="ico">📚</span><span><strong>Por tema</strong><span class="sub">Elige uno o varios temas</span></span></button>
    <button class="menu-btn" data-go="setupRandom"><span class="ico">🎲</span><span><strong>Aleatorio</strong><span class="sub">N preguntas de todos los temas</span></span></button>
    <button class="menu-btn" data-go="setupFalladas" ${nFall ? '' : 'disabled'}><span class="ico">🔁</span><span><strong>Repasar falladas</strong><span class="sub">${nFall ? 'Salen al acertarlas 2 veces seguidas' : 'No tienes falladas pendientes'}</span></span>${nFall ? `<span class="badge">${nFall}</span>` : ''}</button>
    <button class="menu-btn" data-go="setupExam"><span class="ico">⏱️</span><span><strong>Simulacro de examen</strong><span class="sub">${plan.total} preguntas · ${plan.minutos} min</span></span></button>
    <button class="menu-btn" data-go="progress"><span class="ico">📈</span><span><strong>Mi progreso</strong><span class="sub">Por tema, exportar o importar</span></span></button>
  </nav>
  <p class="muted small" style="text-align:center;margin-top:24px">${DATA.preguntas.length} preguntas · temas ${temasDisponibles().join(', ')}</p>`;
  $app.innerHTML = html;
  $app.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => go(b.dataset.go)));
  if (sess) {
    document.getElementById('resume').onclick = () => go('test');
    document.getElementById('discard').onclick = () => modal('¿Descartar el test?', '<p>Las respuestas ya dadas siguen contando en tu progreso.</p>', [
      { label: 'Descartar', cls: 'btn danger', onClick: () => { S.session = null; save(); go('home', false); } },
      { label: 'Cancelar', cls: 'btn secondary' },
    ]);
  }
};

/* ---------------- Vistas de configuración ---------------- */

function chipsHTML(values, selected, labelFn = v => v) {
  return `<div class="chips">${values.map(v => `<button class="chip" data-v="${v}" aria-pressed="${v == selected}">${labelFn(v)}</button>`).join('')}</div>`;
}
function bindChips(container, onChange) {
  container.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    container.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', 'false'));
    c.setAttribute('aria-pressed', 'true');
    onChange(c.dataset.v);
  }));
}
function bottomButton(label, onClick, disabled = false) {
  const bar = document.createElement('div');
  bar.className = 'bottom-bar';
  bar.innerHTML = `<button class="btn" ${disabled ? 'disabled' : ''}>${esc(label)}</button>`;
  bar.firstChild.addEventListener('click', onClick);
  $app.appendChild(bar);
  return bar.firstChild;
}

VIEWS.setupTema = () => {
  $title.textContent = 'Por tema';
  let n = 20;
  const temas = temasDisponibles();
  const rows = temas.map(t => {
    const qs = BY_TEMA[t];
    const r = round(t);
    const pend = qs.filter(q => !r.seen[q.id]).length;
    return `<label class="check"><input type="checkbox" value="${t}">
      <span class="info">${t}. ${esc(temaName(t))}<small>${qs.length} preguntas · vuelta ${r.n}: quedan ${pend} sin ver</small></span></label>`;
  }).join('');
  $app.innerHTML = `
    <div class="card"><div class="check-list">
      <label class="check"><input type="checkbox" id="all"><span class="info"><strong>Todos los temas</strong></span></label>
      ${rows}</div></div>
    <div class="field">Número de preguntas</div>
    <div id="nchips">${chipsHTML([10, 20, 30, 'all'], n, v => v === 'all' ? 'Todas las pendientes' : v)}</div>
    <p class="muted small">No se repiten preguntas hasta haber visto todas las del tema. Al empezar una vuelta nueva salen primero las que fallaste.</p>`;
  const boxes = [...$app.querySelectorAll('.check input[value]')];
  const all = document.getElementById('all');
  const btn = bottomButton('Empezar', () => {
    const sel = boxes.filter(b => b.checked).map(b => +b.value);
    confirmReplace(() => startSession('tema', pick(sel, n === 'all' ? 'all' : +n), {
      temas: sel, title: sel.length === 1 ? `Tema ${sel[0]}: ${temaName(sel[0])}` : `Temas ${sel.join(', ')}`,
    }));
  }, true);
  const refresh = () => {
    btn.disabled = !boxes.some(b => b.checked);
    all.checked = boxes.every(b => b.checked);
  };
  boxes.forEach(b => b.addEventListener('change', refresh));
  all.addEventListener('change', () => { boxes.forEach(b => b.checked = all.checked); refresh(); });
  bindChips(document.getElementById('nchips'), v => n = v);
};

VIEWS.setupRandom = () => {
  $title.textContent = 'Aleatorio';
  let n = 20;
  $app.innerHTML = `
    <div class="card"><h2>Preguntas de todos los temas</h2>
    <p class="muted">Se eligen al azar entre las que aún no has visto en esta vuelta. Las falladas tienen prioridad cuando empieza una vuelta nueva.</p></div>
    <div class="field">Número de preguntas</div>
    <div id="nchips">${chipsHTML([10, 20, 30, 45], n)}</div>`;
  bindChips(document.getElementById('nchips'), v => n = +v);
  bottomButton('Empezar', () => {
    const temas = temasDisponibles();
    confirmReplace(() => startSession('aleatorio', shuffle(pick(temas, n)), { temas, title: `Aleatorio (${n})` }));
  });
};

VIEWS.setupFalladas = () => {
  $title.textContent = 'Repasar falladas';
  const ids = Object.keys(S.q).filter(id => S.q[id].rev && BY_ID[id]);
  let n = 'all';
  const porTema = {};
  ids.forEach(id => { const t = BY_ID[id].tema; porTema[t] = (porTema[t] || 0) + 1; });
  $app.innerHTML = `
    <div class="card"><h2>${ids.length} preguntas por repasar</h2>
    <p class="muted">Una pregunta sale de aquí cuando la aciertas 2 veces seguidas, en cualquier modo.</p>
    <table>${Object.keys(porTema).sort((a, b) => a - b).map(t => `<tr><td>${t}. ${esc(temaName(t))}</td><td class="num">${porTema[t]}</td></tr>`).join('')}</table></div>
    <div class="field">Número de preguntas</div>
    <div id="nchips">${chipsHTML([10, 20, 'all'], n, v => v === 'all' ? `Todas (${ids.length})` : v)}</div>`;
  bindChips(document.getElementById('nchips'), v => n = v);
  bottomButton('Empezar repaso', () => {
    const sel = shuffle(ids).sort((a, b) => S.q[b].ko - S.q[a].ko).slice(0, n === 'all' ? ids.length : +n);
    confirmReplace(() => startSession('falladas', shuffle(sel), { title: 'Repaso de falladas' }));
  }, !ids.length);
};

VIEWS.setupExam = () => {
  $title.textContent = 'Simulacro';
  const p = examPlan();
  const ex = DATA.examen;
  const rows = ex.bloques.map(b => {
    const ok = p.bloques.includes(b);
    return `<tr${ok ? '' : ' style="opacity:.45"'}><td>${b.tema}. ${esc(temaName(b.tema))}</td><td class="num">${b.n}</td><td class="num">${b.max_fallos != null ? b.max_fallos : '—'}</td></tr>`;
  }).join('');
  $app.innerHTML = `
    <div class="card">
      <h2>Formato oficial del PER</h2>
      <p class="muted">${ex.preguntas} preguntas, ${ex.duracion_min} minutos. Apto con al menos ${ex.aciertos_min} aciertos y sin superar el máximo de fallos de RIPA, Balizamiento y Carta.</p>
      <table><tr><th>Bloque</th><th class="num">Preg.</th><th class="num">Máx. fallos</th></tr>${rows}</table>
      <p class="muted small">Fuente: ${esc(ex.fuente)}.</p>
    </div>
    ${p.completo ? '' : `<div class="card"><h2>Adaptado a tus temas</h2>
      <p>Sin ${p.faltan.map(t => `el tema ${t}`).join(', ')}: <strong>${p.total} preguntas, ${p.minutos} minutos</strong>, apto con un máximo de <strong>${p.maxFallos} fallos</strong> (proporcional a los 13 oficiales) y los mismos límites por bloque.</p></div>`}
    <label class="toggle"><input type="checkbox" id="instant"> Corregir cada pregunta al momento</label>
    <p class="muted small">Si no lo marcas, verás la corrección y las justificaciones al terminar, como en el examen real. Las preguntas no respondidas cuentan como fallo.</p>`;
  bottomButton('Empezar simulacro', () => {
    const ids = [];
    for (const b of p.bloques) ids.push(...pick([b.tema], b.n));
    confirmReplace(() => startSession('simulacro', ids, {
      title: 'Simulacro de examen', limit: p.minutos * 60,
      instant: document.getElementById('instant').checked,
      temas: p.bloques.map(b => b.tema),
    }));
  });
};

/* ---------------- Vista: pregunta ---------------- */

VIEWS.test = () => {
  const sess = S.session;
  if (!sess) return go('home', false);
  if (sess.idx >= sess.ids.length) return finish();
  const id = sess.ids[sess.idx];
  const q = BY_ID[id];
  if (!q) { sess.idx++; save(); return VIEWS.test(); }   // pregunta eliminada del banco
  if (!sess.perm[sess.idx]) { sess.perm[sess.idx] = makePerm(q); save(); }
  const perm = sess.perm[sess.idx];
  const a = sess.ans[sess.idx];
  const sc = sessionScore(sess);
  const showScore = sess.instant;
  const reveal = a && sess.instant;

  $title.textContent = sess.title;
  let html = `
    <div class="q-meta">
      <span>${sess.idx + 1} / ${sess.ids.length} <span class="tag">Tema ${q.tema}</span></span>
      ${showScore ? `<span class="score"><span class="ok">✓ ${sc.ok}</span> &nbsp; <span class="ko">✗ ${sc.ko}</span></span>` : `<span class="muted">${Object.keys(sess.ans).length} respondidas</span>`}
    </div>
    <div class="progress"><div style="width:${pct(sess.idx, sess.ids.length)}%"></div></div>
    <div class="enunciado">${esc(q.enunciado)}</div>
    ${q.imagen ? `<img class="q-img" src="${esc(q.imagen)}" alt="Imagen de la pregunta">` : ''}
    <div class="options">`;
  perm.forEach((orig, pos) => {
    let cls = '';
    if (a) {
      if (reveal && (orig === q.correcta || (orig === a.c && a.ok))) cls = 'correct';
      else if (reveal && orig === a.c) cls = 'wrong';
      else if (!reveal && orig === a.c) cls = 'chosen';
    }
    html += `<button class="opt ${cls}" data-o="${orig}" ${a ? 'disabled' : ''}><span class="letter">${LETTERS[pos]}</span><span>${esc(q.opciones[orig])}</span></button>`;
  });
  html += `</div>`;
  if (reveal) html += feedbackHTML(q, a.ok);
  $app.innerHTML = html;

  $app.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(+b.dataset.o)));
  if (a) {
    const last = sess.idx === sess.ids.length - 1;
    const next = bottomButton(last ? 'Ver resultado' : 'Siguiente', () => { sess.idx++; save(); go('test', false); });
    if (reveal) setTimeout(() => next.scrollIntoView({ block: 'nearest' }), 50);
  } else if (sess.limit) {
    bottomButton('Terminar examen', () => modal('¿Terminar el simulacro?', '<p>Las preguntas sin responder contarán como fallo.</p>', [
      { label: 'Terminar y corregir', cls: 'btn', onClick: () => { sess.idx = sess.ids.length; save(); finish(); } },
      { label: 'Seguir', cls: 'btn secondary' },
    ])).classList.add('secondary');
  }
  if (sess.limit) startTimer();
};

/* "tambien_correctas" (opcional): otras opciones que también se dan por buenas. */
function isCorrect(q, orig) {
  return orig === q.correcta || (q.tambien_correctas || []).includes(orig);
}

function feedbackHTML(q, ok) {
  return `<div class="feedback ${ok ? 'ok' : 'ko'}">
    <strong>${ok ? '¡Correcto!' : `Incorrecto. La correcta es: ${esc(q.opciones[q.correcta])}`}</strong>
    ${esc(q.justificacion)}
    <div class="src">Fuente: ${esc(q.fuente)}</div>
    ${q.verificada === false ? '<div class="warn">Respuesta deducida del temario: el examen original no traía solución clara.</div>' : ''}
    ${q.duda ? `<div class="warn">⚠ ${esc(q.duda)}</div>` : ''}
  </div>`;
}

function answer(orig) {
  const sess = S.session;
  if (!sess || sess.ans[sess.idx]) return;
  const q = BY_ID[sess.ids[sess.idx]];
  const ok = isCorrect(q, orig);
  sess.ans[sess.idx] = { c: orig, ok };
  record(q.id, ok);
  save();                                   // guardado inmediato tras cada respuesta
  if (navigator.vibrate && sess.instant && !ok) navigator.vibrate(60);
  go('test', false);
}

document.addEventListener('keydown', e => {
  if (current !== 'test' || document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const i = '1234'.indexOf(k) >= 0 ? '1234'.indexOf(k) : 'abcd'.indexOf(k);
  const opts = $app.querySelectorAll('.opt:not([disabled])');
  if (i >= 0 && opts[i]) opts[i].click();
  else if (k === 'enter') { const b = $app.querySelector('.bottom-bar .btn'); if (b) b.click(); }
});

/* ---------------- Temporizador del simulacro ---------------- */

function startTimer() {
  stopTimer();
  const sess = S.session;
  const tick = () => {
    $extra.textContent = '⏱ ' + fmtTime(sess.limit - sess.elapsed);
  };
  tick();
  timer = setInterval(() => {
    if (document.hidden) return;            // el tiempo solo corre con la app abierta
    sess.elapsed++;
    tick();
    if (sess.elapsed % 5 === 0) save();
    if (sess.elapsed >= sess.limit) {
      stopTimer();
      sess.idx = sess.ids.length;
      save();
      toast('Se acabó el tiempo');
      finish();
    }
  }, 1000);
}
function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
document.addEventListener('visibilitychange', () => { if (document.hidden && S) save(); });

/* ---------------- Resultado ---------------- */

function finish() {
  const sess = S.session;
  const res = {
    mode: sess.mode, title: sess.title, total: sess.ids.length, ok: 0, ko: 0, blank: 0,
    porTema: {}, fallos: [], elapsed: sess.elapsed, limit: sess.limit, date: Date.now(),
  };
  sess.ids.forEach((id, i) => {
    const q = BY_ID[id];
    if (!q) return;
    const a = sess.ans[i];
    const pt = res.porTema[q.tema] || (res.porTema[q.tema] = { n: 0, ok: 0 });
    pt.n++;
    if (a && a.ok) { res.ok++; pt.ok++; }
    else {
      a ? res.ko++ : res.blank++;
      res.fallos.push({ id, c: a ? a.c : null });
    }
  });
  if (sess.mode === 'simulacro') {
    const p = examPlan();
    const fallos = res.ko + res.blank;
    const bloquesKO = p.bloques.filter(b => b.max_fallos != null && res.porTema[b.tema] &&
      (res.porTema[b.tema].n - res.porTema[b.tema].ok) > b.max_fallos).map(b => b.tema);
    res.exam = { maxFallos: p.maxFallos, bloques: p.bloques, apto: fallos <= p.maxFallos && !bloquesKO.length, bloquesKO };
  }
  S.last = res;
  S.session = null;
  save();
  history.replaceState({ view: 'result' }, '');
  go('result', false);
}

VIEWS.result = () => {
  const r = S.last;
  if (!r) return go('home', false);
  $title.textContent = 'Resultado';
  let html = `<div class="card" style="text-align:center">
    <div class="big">${r.ok} / ${r.total}</div>
    <div class="muted">${pct(r.ok, r.total)}% de aciertos · ${r.ko} fallos${r.blank ? ` · ${r.blank} sin responder` : ''}${r.limit ? ` · ${fmtTime(r.elapsed)} usados` : ''}</div>`;
  if (r.exam) {
    html += `<div class="verdict ${r.exam.apto ? 'ok' : 'ko'}" style="margin-top:10px">${r.exam.apto ? 'APTO' : 'NO APTO'}</div>
      <div class="muted small">Máximo ${r.exam.maxFallos} fallos en total${r.exam.bloquesKO.length ? ` · superado el límite en tema ${r.exam.bloquesKO.join(', ')}` : ''}</div>`;
  }
  html += `</div><div class="card"><h2>Por tema</h2><table>
    <tr><th>Tema</th><th class="num">Aciertos</th>${r.exam ? '<th class="num">Fallos / máx.</th>' : ''}</tr>`;
  Object.keys(r.porTema).sort((a, b) => a - b).forEach(t => {
    const pt = r.porTema[t];
    const b = r.exam && r.exam.bloques.find(x => x.tema == t);
    const f = pt.n - pt.ok;
    const bad = b && b.max_fallos != null && f > b.max_fallos;
    html += `<tr><td>${t}. ${esc(temaName(t))}</td><td class="num">${pt.ok}/${pt.n}</td>${r.exam ? `<td class="num ${bad ? 'bad' : ''}">${f}${b && b.max_fallos != null ? ' / ' + b.max_fallos : ''}</td>` : ''}</tr>`;
  });
  html += `</table></div>`;
  if (r.fallos.length) {
    html += `<div class="card"><h2>Preguntas falladas (${r.fallos.length})</h2>`;
    r.fallos.forEach(f => {
      const q = BY_ID[f.id];
      if (!q) return;
      html += `<div class="review-item">
        <p><strong>${esc(q.enunciado)}</strong></p>
        ${f.c != null ? `<p class="yours">✗ ${esc(q.opciones[f.c])}</p>` : '<p class="muted">Sin responder</p>'}
        <p class="right">✓ ${esc(q.opciones[q.correcta])}</p>
        <p class="muted small">${esc(q.justificacion)}<br>Fuente: ${esc(q.fuente)}</p>
        ${q.duda ? `<div class="warn">⚠ ${esc(q.duda)}</div>` : ''}
      </div>`;
    });
    html += `</div>`;
  }
  $app.innerHTML = html;
  bottomButton('Volver al inicio', () => go('home', false));
};

/* ---------------- Progreso ---------------- */

VIEWS.progress = () => {
  $title.textContent = 'Mi progreso';
  let tVistas = 0, tTotal = 0, tOk = 0, tAns = 0;
  const rows = temasDisponibles().map(t => {
    const qs = BY_TEMA[t];
    let vistas = 0, ok = 0, ans = 0, fall = 0;
    qs.forEach(q => {
      const x = S.q[q.id];
      if (!x) return;
      if (x.s) vistas++;
      ok += x.ok; ans += x.ok + x.ko;
      if (x.rev) fall++;
    });
    tVistas += vistas; tTotal += qs.length; tOk += ok; tAns += ans;
    return `<div class="stat-row">
      <div class="top"><span>${t}. ${esc(temaName(t))}</span><span class="muted small">${fall ? `🔁 ${fall}` : ''}</span></div>
      <div class="nums">
        <div>Visto ${pct(vistas, qs.length)}% <span class="small">(${vistas}/${qs.length})</span><div class="bar"><div style="width:${pct(vistas, qs.length)}%"></div></div></div>
        <div>Aciertos ${ans ? pct(ok, ans) + '%' : '—'} <span class="small">${ans ? `(${ok}/${ans})` : ''}</span><div class="bar acc"><div style="width:${pct(ok, ans)}%"></div></div></div>
      </div></div>`;
  }).join('');
  $app.innerHTML = `
    <div class="card" style="display:flex;justify-content:space-around;text-align:center">
      <div><div class="big">${pct(tVistas, tTotal)}%</div><div class="muted small">visto</div></div>
      <div><div class="big">${tAns ? pct(tOk, tAns) + '%' : '—'}</div><div class="muted small">aciertos</div></div>
      <div><div class="big">${Object.values(S.q).filter(x => x.rev).length}</div><div class="muted small">por repasar</div></div>
    </div>
    <div class="card"><h2>Por tema</h2>${rows}</div>
    <div class="card">
      <h2>Copia de seguridad</h2>
      <p class="muted small">Para pasar tu progreso a otro móvil o navegador: exporta aquí e importa allí.</p>
      <button class="btn" id="exp-file">Exportar a archivo</button>
      <button class="btn secondary" id="exp-code">Copiar código de progreso</button>
      <button class="btn secondary" id="imp-file">Importar desde archivo</button>
      <button class="btn secondary" id="imp-code">Pegar código de progreso</button>
      <input type="file" id="file" accept=".json,application/json" hidden>
    </div>
    <div class="card">
      <h2>Reiniciar</h2>
      <p class="muted small">Borra todas tus respuestas, falladas y el test en curso de este navegador.</p>
      <button class="btn danger" id="reset">Reiniciar progreso</button>
    </div>`;
  document.getElementById('exp-file').onclick = exportFile;
  document.getElementById('exp-code').onclick = exportCode;
  document.getElementById('imp-file').onclick = () => document.getElementById('file').click();
  document.getElementById('file').onchange = e => importFile(e.target.files[0]);
  document.getElementById('imp-code').onclick = importCodeDialog;
  document.getElementById('reset').onclick = () => modal('¿Reiniciar todo el progreso?', '<p>Esta acción no se puede deshacer. Si quieres conservarlo, exporta antes una copia.</p>', [
    { label: 'Sí, borrar todo', cls: 'btn danger', onClick: () => { S = emptyState(); save(); toast('Progreso reiniciado'); go('progress', false); } },
    { label: 'Cancelar', cls: 'btn secondary' },
  ]);
};

/* ---------------- Exportar / importar ---------------- */

function exportPayload() {
  return { app: 'test-per', exported: new Date().toISOString(), state: S };
}

function exportFile() {
  const blob = new Blob([JSON.stringify(exportPayload())], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `per-progreso-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const b64 = {
  enc: bytes => { let s = ''; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s); },
  dec: str => Uint8Array.from(atob(str), c => c.charCodeAt(0)),
};

async function streamBytes(bytes, stream) {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

async function makeCode() {
  const bytes = new TextEncoder().encode(JSON.stringify(exportPayload()));
  if (window.CompressionStream) return 'PERZ:' + b64.enc(await streamBytes(bytes, new CompressionStream('gzip')));
  return 'PER0:' + b64.enc(bytes);
}

async function readCode(code) {
  code = code.trim().replace(/\s+/g, '');
  if (code.startsWith('PERZ:')) {
    if (!window.DecompressionStream) throw new Error('Este navegador no puede leer códigos comprimidos; usa el archivo.');
    return JSON.parse(new TextDecoder().decode(await streamBytes(b64.dec(code.slice(5)), new DecompressionStream('gzip'))));
  }
  if (code.startsWith('PER0:')) return JSON.parse(new TextDecoder().decode(b64.dec(code.slice(5))));
  throw new Error('El código no tiene el formato esperado.');
}

async function exportCode() {
  const code = await makeCode();
  let copied = false;
  try { await navigator.clipboard.writeText(code); copied = true; } catch (e) { /* sin permiso de portapapeles */ }
  modal('Código de progreso', `<p class="muted small">${copied ? 'Copiado al portapapeles. ' : ''}Pégalo en «Pegar código de progreso» en el otro dispositivo.</p><textarea readonly id="codebox">${esc(code)}</textarea>`, [
    { label: 'Copiar', cls: 'btn', keep: true, onClick: () => { const t = document.getElementById('codebox'); t.select(); try { navigator.clipboard.writeText(code); } catch (e) { document.execCommand('copy'); } toast('Copiado'); } },
    { label: 'Cerrar', cls: 'btn secondary' },
  ]);
}

function importCodeDialog() {
  modal('Pegar código de progreso', '<textarea id="codein" placeholder="PERZ:…"></textarea>', [
    { label: 'Importar', cls: 'btn', onClick: async () => {
      try { applyImport(await readCode(document.getElementById('codein').value)); }
      catch (e) { toast(e.message || 'Código no válido'); }
    } },
    { label: 'Cancelar', cls: 'btn secondary' },
  ]);
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { applyImport(JSON.parse(reader.result)); }
    catch (e) { toast('El archivo no es una copia válida'); }
  };
  reader.readAsText(file);
}

function applyImport(payload) {
  const st2 = payload && payload.state;
  if (!st2 || st2.v !== 1 || typeof st2.q !== 'object') { toast('La copia no es válida'); return; }
  const n = Object.keys(st2.q).length;
  modal('¿Sustituir tu progreso?', `<p>La copia contiene ${n} preguntas respondidas${payload.exported ? ` (exportada el ${new Date(payload.exported).toLocaleDateString('es-ES')})` : ''}. Reemplazará el progreso de este navegador.</p>`, [
    { label: 'Importar', cls: 'btn', onClick: () => { S = Object.assign(emptyState(), st2); save(); toast('Progreso importado'); go('progress', false); } },
    { label: 'Cancelar', cls: 'btn secondary' },
  ]);
}

/* ---------------- Diálogo genérico ---------------- */

function modal(title, content, actions) {
  const dlg = document.getElementById('modal');
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-content').innerHTML = content;
  const box = document.getElementById('modal-actions');
  box.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = a.cls || 'btn';
    b.textContent = a.label;
    b.type = a.keep ? 'button' : 'submit';
    b.addEventListener('click', () => { if (a.onClick) setTimeout(a.onClick, 0); });
    box.appendChild(b);
  });
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}

/* ---------------- Arranque ---------------- */

async function init() {
  S = load();
  try {
    const res = await fetch('preguntas.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    $app.innerHTML = '<div class="card"><h2>No se pudieron cargar las preguntas</h2><p class="muted">Abre la web con conexión al menos una vez para poder usarla sin conexión.</p></div>';
    return;
  }
  DATA.preguntas.forEach(q => {
    BY_ID[q.id] = q;
    (BY_TEMA[q.tema] || (BY_TEMA[q.tema] = [])).push(q);
  });
  // Si el banco cambió y la sesión guardada ya no tiene preguntas válidas, se descarta
  if (S.session && !S.session.ids.some(id => BY_ID[id])) { S.session = null; save(); }
  history.replaceState(null, '');
  go('home', false);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
