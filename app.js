import { decryptJSON } from './crypto.js';
import { placeById, findPlaces, nearestPlaces, fold } from './places.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// localStorage can throw (private mode) or be wiped; the app must work without it.
const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let DATA = null;
let tab = store.get('tab', 'reis');
const reading = { query: '', mode: 'start', near: null, message: '' };

/* ---------- dates ---------- */

const DAY_MS = 86400000;
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoOf(new Date());
const fmt = (d, opts) => d.toLocaleDateString('nl-BE', opts);

function tripDays() {
  const byDate = new Map((DATA.days || []).map((d) => [d.date, d]));
  const out = [];
  for (let d = parseDate(DATA.trip.start), n = 1; d <= parseDate(DATA.trip.end); d = new Date(d.getTime() + DAY_MS), n++) {
    const iso = isoOf(d);
    out.push({ n, iso, d, ...(byDate.get(iso) || { title: 'Programma volgt', items: [] }) });
  }
  return out;
}

function tripStatus() {
  const start = parseDate(DATA.trip.start);
  const end = parseDate(DATA.trip.end);
  const now = parseDate(todayIso());
  const total = Math.round((end - start) / DAY_MS) + 1;
  if (now < start) {
    const n = Math.round((start - now) / DAY_MS);
    return n === 1 ? 'Morgen vertrekken jullie!' : `Nog ${n} dagen tot vertrek`;
  }
  if (now > end) return 'Welkom thuis';
  return `Dag ${Math.round((now - start) / DAY_MS) + 1} van ${total}`;
}

/* ---------- small helpers ---------- */

const telHref = (p) => `tel:${p.replace(/[^+\d]/g, '')}`;
const mapsQuery = (q) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
const googleQuery = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 1800);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Gekopieerd'); } catch { toast(text); }
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Locatie wordt niet ondersteund'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => reject(new Error(e.code === 1 ? 'Geen toestemming voor je locatie. Zet ze aan via Instellingen › Privacy › Locatievoorzieningen.' : 'Je locatie kon niet bepaald worden.')),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}

/* ---------- views ---------- */

function viewReis() {
  const today = todayIso();
  const days = tripDays();
  const html = days.map((day) => {
    const past = day.iso < today;
    const isToday = day.iso === today;
    const sub = [day.stay?.area, day.stay ? `${day.stay.name}` : null].filter(Boolean).join(' · ');
    const items = (day.items || []).map((it) => `
      <div class="item">
        <h4>${it.time ? `<span class="time">${esc(it.time)}</span>` : ''}${esc(it.title)}</h4>
        ${it.text ? `<p>${esc(it.text)}</p>` : ''}
      </div>`).join('');
    const flights = (day.flights || []).map((f) => `
      <div class="flight">
        <div><b>${esc(f.dep)}</b><small>${esc(f.from)}</small></div>
        <div class="dur">✈︎<br>${esc(f.dur)}</div>
        <div class="end"><b>${esc(f.arr)}</b><small>${esc(f.to)}</small></div>
      </div>`).join('');
    const stay = day.stay ? `
      <div class="stay">
        <div class="stay-label">Overnachting · ${day.stay.nights} ${day.stay.nights === 1 ? 'nacht' : 'nachten'}</div>
        <h4>${esc(day.stay.name)}</h4>
        <p class="note">${esc(day.stay.area)}${day.stay.room ? ` · ${esc(day.stay.room)}` : ''}</p>
        ${day.stay.info ? `<p>${esc(day.stay.info)}</p>` : ''}
        <div class="btn-row">
          <a class="btn small" href="${mapsQuery(`${day.stay.name}, ${day.stay.area}, Sri Lanka`)}">Apple Kaarten</a>
          <a class="btn small" href="${googleQuery(`${day.stay.name} ${day.stay.area} Sri Lanka`)}">Google Maps</a>
        </div>
      </div>` : '';
    const reads = (day.places || []).map(placeById).filter(Boolean)
      .map((p) => `<button class="chip" data-read="${esc(p.name)}">📖 ${esc(p.name)}</button>`).join(' ');
    return `
      <details class="day${isToday ? ' today' : ''}${past ? ' past' : ''}" id="d-${day.iso}"${isToday ? ' open' : ''}>
        <summary>
          <div class="day-date"><b>${day.d.getDate()}</b><small>${esc(fmt(day.d, { month: 'short' }))}</small></div>
          <div class="day-head">
            <h3>${esc(day.title)}</h3>
            <p>Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'long' }))}${sub ? ` · ${esc(sub)}` : ''}</p>
          </div>
        </summary>
        <div class="day-body">
          ${flights}${items}${stay}
          ${reads ? `<div class="btn-row">${reads}</div>` : ''}
        </div>
      </details>`;
  }).join('');
  return `${DATA.trip.boardNote ? `<p class="note" style="margin:4px 4px 12px">${esc(DATA.trip.boardNote)}</p>` : ''}${html}`;
}

function viewBoekingen() {
  const cards = (DATA.bookings || []).map((b) => `
    <div class="card">
      <h3>${esc(b.title)}</h3>
      <dl class="rows">${b.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${/^[A-Z0-9-]{5,}$/.test(v) ? `<button class="copy" data-copy="${esc(v)}">${esc(v)}</button>` : esc(v)}</dd>`).join('')}</dl>
      ${b.note ? `<p class="note">${esc(b.note)}</p>` : ''}
    </div>`).join('');
  const practical = (DATA.practical || []).length ? `
    <h2 class="section-title">Praktisch</h2>
    <div class="card"><dl class="rows">${DATA.practical.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></div>` : '';
  return `<h2 class="section-title">Boekingen</h2>${cards}${practical}
    <p class="note" style="margin:16px 4px">Tik op een nummer om het te kopiëren.</p>`;
}

function viewNood() {
  const groups = (DATA.contacts || []).map((g) => `
    <h2 class="section-title">${esc(g.group)}</h2>
    ${g.items.map((c) => `
      <div class="card contact">
        <h3>${esc(c.name)}</h3>
        ${c.role ? `<div class="role">${esc(c.role)}</div>` : ''}
        ${c.address ? `<p><a href="${mapsQuery(c.address)}">${esc(c.address)}</a></p>` : ''}
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ''}
        <div class="btn-row">
          ${c.phone ? `<a class="btn call" href="${telHref(c.phone)}">📞 ${esc(c.phone)}</a>` : ''}
          ${c.phoneAlt ? `<a class="btn call alt" href="${telHref(c.phoneAlt)}">📞 ${esc(c.phoneAlt)}${c.phoneAltLabel ? ` · ${esc(c.phoneAltLabel)}` : ''}</a>` : ''}
          ${c.email ? `<a class="btn small" href="mailto:${esc(c.email)}">✉︎ ${esc(c.email)}</a>` : ''}
        </div>
      </div>`).join('')}`).join('');
  return `
    <div class="sos">
      <a href="tel:119"><b>119</b><small>Politie</small></a>
      <a href="tel:1990"><b>1990</b><small>Ambulance</small></a>
      <a href="tel:1912"><b>1912</b><small>Toeristen</small></a>
    </div>
    <div class="btn-row"><button class="btn" id="share-loc" style="width:100%">📍 Deel mijn locatie</button></div>
    ${groups}`;
}

/* ---------- literary companion ---------- */

const passages = () => DATA.passages || [];
const favs = () => new Set(store.get('favs', []));

function routePlaces() {
  const seen = new Set();
  const out = [];
  for (const d of DATA.days || []) for (const id of d.places || []) if (!seen.has(id) && placeById(id)) { seen.add(id); out.push(placeById(id)); }
  return out;
}

function passagesForPlaces(ids) {
  return passages().filter((p) => (p.places || []).some((id) => ids.includes(id)));
}

function searchPassages(q) {
  const placeIds = findPlaces(q).map((p) => p.id);
  const fq = fold(q);
  const toks = fq.split(/\s+/).filter(Boolean);
  return passages().map((p) => {
    let score = 0;
    if ((p.places || []).some((id) => placeIds.includes(id))) score += 10;
    if ((p.tags || []).some((t) => fold(t) === fq)) score += 6;
    const hay = fold([p.text, p.title, p.source, p.author, ...(p.tags || []), ...(p.places || []).map((id) => placeById(id)?.name)].join(' '));
    if (toks.length && toks.every((t) => hay.includes(t))) score += 3;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => x.p);
}

function passageCard(p, f) {
  const where = [p.author, p.source, p.where].filter(Boolean).map(esc).join(' · ');
  const chips = [
    ...(p.places || []).map((id) => placeById(id)?.name).filter(Boolean),
    ...(p.tags || []),
  ].map((t) => `<button class="chip" data-read="${esc(t)}">${esc(t)}</button>`).join('');
  return `
    <article class="card passage">
      ${p.title ? `<h3 style="margin-bottom:8px">${esc(p.title)}</h3>` : ''}
      <blockquote>${esc(p.text)}</blockquote>
      ${where ? `<cite>${where}</cite>` : ''}
      <div class="foot">
        <div class="tags">${chips}</div>
        <button class="star" data-fav="${esc(p.id)}" aria-label="Favoriet">${f.has(p.id) ? '★' : '☆'}</button>
      </div>
    </article>`;
}

function readingResults() {
  const f = favs();
  if (reading.mode === 'fav') return { title: `Favorieten (${f.size})`, list: passages().filter((p) => f.has(p.id)) };
  if (reading.mode === 'near' && reading.near) {
    const ids = reading.near.map((p) => p.id);
    const list = passagesForPlaces(ids).sort((a, b) => Math.min(...a.places.map((id) => ids.indexOf(id)).filter((i) => i >= 0)) - Math.min(...b.places.map((id) => ids.indexOf(id)).filter((i) => i >= 0)));
    const here = reading.near[0];
    return { title: `Je bent bij ${here.name} (${Math.round(here.km)} km). Ook dichtbij: ${reading.near.slice(1).map((p) => p.name).join(', ')}.`, list };
  }
  if (reading.mode === 'search' && reading.query) {
    const list = searchPassages(reading.query);
    return { title: `${list.length} ${list.length === 1 ? 'resultaat' : 'resultaten'} voor “${reading.query}”`, list };
  }
  const today = (DATA.days || []).find((d) => d.date === todayIso());
  if (today?.places?.length) {
    const names = today.places.map((id) => placeById(id)?.name).filter(Boolean).join(', ');
    return { title: `Vandaag: ${names}`, list: passagesForPlaces(today.places) };
  }
  return null;
}

function viewLezen() {
  const res = readingResults();
  const route = routePlaces().map((p) => `<button class="chip" data-read="${esc(p.name)}">${esc(p.name)}</button>`).join('');
  let body;
  if (!passages().length) {
    body = `<div class="empty"><h3>Nog geen teksten</h3><p>Zodra de bronteksten toegevoegd zijn, verschijnen hier citaten, beschrijvingen en weetjes per plaats.</p></div>`;
  } else if (reading.message) {
    body = `<p class="status">${esc(reading.message)}</p>`;
  } else if (!res) {
    body = `<div class="empty"><h3>Waar ben je?</h3><p>Tik op <b>In de buurt</b>, zoek een plaats of een woord, of kies een halte van de reis hierboven.</p></div>`;
  } else {
    body = `<p class="status">${esc(res.title)}</p>${res.list.length ? res.list.map((p) => passageCard(p, favs())).join('') : '<div class="empty"><p>Nog niets gevonden. Probeer een andere plaats of een ruimer woord.</p></div>'}`;
  }
  return `
    <form class="search" id="search-form">
      <input id="q" type="search" placeholder="Plaats of trefwoord" value="${esc(reading.mode === 'search' ? reading.query : '')}" enterkeyhint="search" autocapitalize="none" autocorrect="off">
      <button type="button" class="btn primary" id="near">📍 In de buurt</button>
    </form>
    <div class="filters">${route}<button class="chip" id="favs">★ Favorieten</button></div>
    ${body}`;
}

/* ---------- shell ---------- */

const VIEWS = { reis: viewReis, boekingen: viewBoekingen, nood: viewNood, lezen: viewLezen };

function render() {
  if (!VIEWS[tab]) tab = 'reis';
  $('#view').innerHTML = VIEWS[tab]();
  document.querySelectorAll('#tabs button').forEach((b) => b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false'));
  $('#top-sub').textContent = tripStatus();
}

function go(next) {
  tab = next;
  store.set('tab', tab);
  render();
  window.scrollTo(0, 0);
  if (tab === 'reis') document.getElementById(`d-${todayIso()}`)?.scrollIntoView({ block: 'start' });
}

function readAbout(q) {
  reading.mode = 'search';
  reading.query = q;
  reading.message = '';
  go('lezen');
}

async function nearMe() {
  reading.mode = 'near';
  reading.message = 'Locatie bepalen…';
  render();
  try {
    const c = await getPosition();
    reading.near = nearestPlaces(c.latitude, c.longitude, 4);
    reading.message = '';
  } catch (e) {
    reading.message = e.message;
  }
  render();
}

async function shareLocation() {
  try {
    const c = await getPosition();
    const url = `https://maps.apple.com/?ll=${c.latitude.toFixed(5)},${c.longitude.toFixed(5)}&q=Hier`;
    const text = `Mijn locatie: ${url}`;
    if (navigator.share) await navigator.share({ text });
    else await copy(text);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message);
  }
}

function wire() {
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) go(b.dataset.tab);
  });
  $('#view').addEventListener('click', (e) => {
    const t = e.target.closest('[data-read],[data-fav],[data-copy],#near,#favs,#share-loc');
    if (!t) return;
    if (t.dataset.read) { e.preventDefault(); readAbout(t.dataset.read); }
    else if (t.dataset.fav) {
      const f = favs();
      f.has(t.dataset.fav) ? f.delete(t.dataset.fav) : f.add(t.dataset.fav);
      store.set('favs', [...f]);
      t.textContent = f.has(t.dataset.fav) ? '★' : '☆';
    } else if (t.dataset.copy) copy(t.dataset.copy);
    else if (t.id === 'near') nearMe();
    else if (t.id === 'favs') { reading.mode = 'fav'; reading.message = ''; render(); }
    else if (t.id === 'share-loc') shareLocation();
  });
  $('#view').addEventListener('submit', (e) => {
    if (e.target.id !== 'search-form') return;
    e.preventDefault();
    const q = $('#q').value.trim();
    reading.mode = q ? 'search' : 'start';
    reading.query = q;
    reading.message = '';
    render();
    $('#q').blur();
  });
}

function showApp() {
  $('#lock').hidden = true;
  for (const id of ['top', 'view', 'tabs']) $(`#${id}`).hidden = false;
  wire();
  go(tab);
}

/* ---------- unlock ---------- */

async function loadBox() {
  const res = await fetch('data/trip.enc.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function showLock(box, msg = '') {
  $('#lock').hidden = false;
  $('#lock-msg').textContent = msg;
  const form = $('#lock-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!box) { location.reload(); return; }
    const pass = $('#pass').value;
    $('#lock-msg').textContent = 'Openen…';
    try {
      DATA = await decryptJSON(box, pass);
      store.set('pass', pass);
      showApp();
    } catch {
      $('#lock-msg').textContent = 'Dat wachtwoord klopt niet.';
      $('#pass').select();
    }
  };
}

async function start() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  let box;
  try {
    box = await loadBox();
  } catch {
    showLock(null, 'De reisgegevens konden niet geladen worden. Open de app één keer met internet.');
    return;
  }
  const saved = store.get('pass');
  if (saved) {
    try { DATA = await decryptJSON(box, saved); showApp(); return; } catch { store.del('pass'); }
  }
  showLock(box);
}

start();
