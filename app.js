import { decryptJSON, importContentKey, decryptBytes } from './crypto.js';
import { placeById, findPlaces, nearestPlaces, fold } from './places.js';
import { createNotes } from './notes.js';

const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// localStorage can throw (private mode) or be wiped; the app must work without it.
const store = {
  get(k, fallback = null) { try { const v = localStorage.getItem(k); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

let DATA = null;
let KEY = null;
let NOTES = null;
const reading = { query: '', mode: 'start', near: null, message: '' };
const noteFilter = { who: 'all' };
let editingNote = null;

/* ---------- dates ---------- */

const DAY_MS = 86400000;
const parseDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayIso = () => isoOf(new Date());
const fmt = (d, opts) => d.toLocaleDateString('nl-BE', opts);
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' });

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

// The day to feature: today during the trip, otherwise the first day.
function featuredDay() {
  const days = tripDays();
  return days.find((d) => d.iso === todayIso()) || (todayIso() > days[days.length - 1].iso ? days[days.length - 1] : days[0]);
}

const dayImages = (day) => [...(day.items || []).map((i) => i.img), day.stay?.img, day.heroImg].filter(Boolean);

/* ---------- small helpers ---------- */

const telHref = (p) => `tel:${p.replace(/[^+\d]/g, '')}`;
const mapsQuery = (q) => `https://maps.apple.com/?q=${encodeURIComponent(q)}`;
const mapsAt = (lat, lon, label) => `https://maps.apple.com/?ll=${lat},${lon}&q=${encodeURIComponent(label || 'Hier')}`;
const googleQuery = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
const paras = (text) => String(text || '').split(/\n{2,}/).map((p) => `<p>${esc(p)}</p>`).join('');

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Gekopieerd'); } catch { toast(text); }
}

function getPosition(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Locatie wordt niet ondersteund'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) => reject(new Error(e.code === 1 ? 'Geen toestemming voor je locatie. Zet ze aan via Instellingen › Privacy › Locatievoorzieningen.' : 'Je locatie kon niet bepaald worden.')),
      { enableHighAccuracy: false, timeout, maximumAge: 300000 },
    );
  });
}

/* ---------- encrypted photos ---------- */

const imgUrls = new Map();

function imageUrl(name) {
  const meta = DATA.images?.[name];
  if (!meta) return Promise.resolve(null);
  if (!imgUrls.has(name)) {
    imgUrls.set(name, fetch(`data/img/${meta.id}.bin`)
      .then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); })
      .then((buf) => decryptBytes(KEY, buf))
      .then((bytes) => URL.createObjectURL(new Blob([bytes], { type: meta.type })))
      .catch(() => { imgUrls.delete(name); return null; }));
  }
  return imgUrls.get(name);
}

const photo = (name, cls = 'photo') => (name && DATA.images?.[name] ? `<div class="${cls}"><img data-img="${esc(name)}" alt=""></div>` : '');

function hydrateImages(root = document) {
  root.querySelectorAll('img[data-img]:not([src])').forEach(async (el) => {
    const url = await imageUrl(el.dataset.img);
    if (url) { el.src = url; el.closest('.photo, .thumb, .hero')?.classList.add('loaded'); }
  });
}

// Fetch every photo once so the whole trip works offline (the service worker keeps them).
async function prefetchImages() {
  for (const { id } of Object.values(DATA.images || {})) {
    try { await fetch(`data/img/${id}.bin`); } catch { return; }
  }
}

/* ---------- views ---------- */

function viewStart() {
  const day = featuredDay();
  const me = store.get('me');
  const people = DATA.trip.people || [];
  const st = NOTES.status();
  const isToday = day.iso === todayIso();
  const tiles = [
    ['#/reis', 'Reisplan', 'Alle 16 dagen'],
    ['#/notities', 'Notities', `${NOTES.list().length} ${NOTES.list().length === 1 ? 'notitie' : 'notities'}`],
    ['#/lezen', 'Lezen', 'Teksten per plaats'],
    ['#/boekingen', 'Boekingen', 'Vluchten, hotels, verzekering'],
    ['#/nood', 'Nood', 'Hulpdiensten en ambassade'],
  ];
  return `
    <section class="start">
      <div class="start-hero">
        ${DATA.trip.startImgPublic ? `<img src="${esc(DATA.trip.startImgPublic)}" alt="">` : `<img data-img="${esc(DATA.trip.heroImg || '')}" alt="">`}
        <div class="start-title">
          <h1>Sri Lanka</h1>
          <p>${esc(tripStatus())}</p>
        </div>
      </div>
      ${!me ? `
        <div class="card who">
          <h3>Wie gebruikt deze telefoon?</h3>
          <p class="note">Zo weet de app wie een notitie schreef.</p>
          <div class="btn-row">${people.map((p) => `<button class="btn primary" data-me="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        </div>` : ''}
      <a class="card today-card" href="#/dag/${day.iso}">
        <div class="eyebrow">${isToday ? 'Vandaag' : todayIso() < day.iso ? 'Eerste dag' : 'Laatste dag'} · dag ${day.n}</div>
        <h3>${esc(day.title)}</h3>
        <p class="note">${esc(fmt(day.d, { weekday: 'long', day: 'numeric', month: 'long' }))}${day.stay ? ` · ${esc(day.stay.name)}` : ''}</p>
      </a>
      <nav class="tiles">
        ${tiles.map(([href, t, s]) => `<a class="tile" href="${href}"><b>${t}</b><small>${esc(s)}</small></a>`).join('')}
      </nav>
      <p class="foot-note">${me ? `Je bent <b>${esc(me)}</b> · <button class="link" data-me="">wijzig</button><br>` : ''}${esc(st.text)}</p>
    </section>`;
}

function viewReis() {
  const today = todayIso();
  return `<div class="day-list">${tripDays().map((day) => {
    const img = dayImages(day)[0];
    return `
      <a class="day-row${day.iso === today ? ' today' : ''}${day.iso < today ? ' past' : ''}" href="#/dag/${day.iso}" id="d-${day.iso}">
        <div class="thumb">${img && DATA.images?.[img] ? `<img data-img="${esc(img)}" alt="">` : ''}<span class="thumb-date"><b>${day.d.getDate()}</b>${esc(fmt(day.d, { month: 'short' }))}</span></div>
        <div class="day-row-text">
          <small>Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'long' }))}</small>
          <h3>${esc(day.title)}</h3>
          ${day.stay ? `<p>${esc(day.stay.name)}</p>` : ''}
        </div>
      </a>`;
  }).join('')}</div>`;
}

function noteMeta(n) {
  const bits = [esc(n.author || '?'), fmtTime(n.created)];
  if (n.date) {
    const d = parseDate(n.date);
    bits.splice(1, 0, esc(fmt(d, { weekday: 'short', day: 'numeric', month: 'short' })));
  }
  const where = n.place ? (n.lat != null ? `<a href="${mapsAt(n.lat, n.lon, n.place)}">${esc(n.place)}</a>` : esc(n.place)) : '';
  return `${bits.join(' · ')}${where ? ` · 📍 ${where}` : ''}`;
}

function noteCard(n, { actions = true } = {}) {
  const mine = n.author === store.get('me');
  return `
    <article class="card note-card" data-note="${esc(n.id)}">
      <div class="note-text">${paras(n.text)}</div>
      <div class="note-meta">${noteMeta(n)}</div>
      ${mine && actions ? `<div class="btn-row"><button class="btn small" data-edit="${esc(n.id)}">Bewerk</button><button class="btn small" data-del="${esc(n.id)}">Verwijder</button></div>` : ''}
    </article>`;
}

function dayNotesHtml(iso) {
  const list = NOTES.list().filter((n) => n.date === iso);
  return list.length ? list.map((n) => noteCard(n)).join('') : '<p class="note">Nog geen notities voor deze dag.</p>';
}

function viewDag(iso) {
  const days = tripDays();
  const i = days.findIndex((d) => d.iso === iso);
  if (i < 0) return viewReis();
  const day = days[i];
  const prev = days[i - 1];
  const next = days[i + 1];
  const hero = dayImages(day)[0];
  const me = store.get('me');
  const editing = editingNote && NOTES.list().find((n) => n.id === editingNote);

  const flights = (day.flights || []).map((f) => `
    <div class="flight">
      <div><b>${esc(f.dep)}</b><small>${esc(f.from)}</small></div>
      <div class="dur">✈︎<br>${esc(f.dur)}</div>
      <div class="end"><b>${esc(f.arr)}</b><small>${esc(f.to)}</small></div>
    </div>`).join('');

  const items = (day.items || []).map((it, k) => `
    <section class="block">
      ${it.img && !(k === 0 && it.img === hero) ? photo(it.img) : ''}
      <h3>${it.time ? `<span class="time">${esc(it.time)}</span>` : ''}${esc(it.title)}</h3>
      <div class="prose">${paras(it.text)}</div>
    </section>`).join('');

  const stay = day.stay ? `
    <section class="block stay">
      ${day.stay.img && day.stay.img !== hero ? photo(day.stay.img) : ''}
      <div class="eyebrow">Overnachting · ${day.stay.nights} ${day.stay.nights === 1 ? 'nacht' : 'nachten'}</div>
      <h3>${esc(day.stay.name)}</h3>
      <p class="note">${esc(day.stay.area)}${day.stay.room ? ` · kamer: ${esc(day.stay.room)}` : ''}</p>
      <div class="prose">${paras(day.stay.info)}</div>
      <div class="btn-row">
        <a class="btn small" href="${mapsQuery(`${day.stay.name}, ${day.stay.area}, Sri Lanka`)}">Apple Kaarten</a>
        <a class="btn small" href="${googleQuery(`${day.stay.name} ${day.stay.area} Sri Lanka`)}">Google Maps</a>
      </div>
    </section>` : '';

  const reads = (day.places || []).map(placeById).filter(Boolean)
    .map((p) => `<button class="chip" data-read="${esc(p.name)}">📖 ${esc(p.name)}</button>`).join(' ');

  return `
    <article class="day-page">
      ${hero ? `<div class="hero"><img data-img="${esc(hero)}" alt=""></div>` : ''}
      <header class="day-title">
        <div class="eyebrow">Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'long', day: 'numeric', month: 'long' }))}</div>
        <h2>${esc(day.title)}</h2>
      </header>
      ${flights}${items}${stay}
      ${reads ? `<section class="block"><div class="eyebrow">Lezen over</div><div class="btn-row">${reads}</div></section>` : ''}
      <section class="block notes-block">
        <h3>Notities</h3>
        <div id="day-notes">${dayNotesHtml(day.iso)}</div>
        ${me ? `
          <form id="note-form" data-date="${day.iso}">
            <textarea id="note-text" rows="4" placeholder="Wat wil je onthouden van vandaag?">${editing ? esc(editing.text) : ''}</textarea>
            <div class="btn-row">
              <button class="btn primary" type="submit">${editing ? 'Wijziging bewaren' : 'Bewaar notitie'}</button>
              ${editing ? '<button class="btn" type="button" id="note-cancel">Annuleer</button>' : ''}
            </div>
            <p class="note">Notitie van ${esc(me)}. Je locatie wordt toegevoegd als je dat toestaat.</p>
          </form>` : '<p class="note">Kies eerst op het startscherm wie deze telefoon gebruikt.</p>'}
      </section>
      <nav class="pager">
        ${prev ? `<a class="btn" href="#/dag/${prev.iso}">‹ Dag ${prev.n}</a>` : '<span></span>'}
        ${next ? `<a class="btn" href="#/dag/${next.iso}">Dag ${next.n} ›</a>` : '<span></span>'}
      </nav>
    </article>`;
}

function viewNotities() {
  const people = DATA.trip.people || [];
  const all = NOTES.list().filter((n) => noteFilter.who === 'all' || n.author === noteFilter.who);
  const days = tripDays();
  const groups = days.map((day) => ({ day, notes: all.filter((n) => n.date === day.iso) })).filter((g) => g.notes.length);
  const st = NOTES.status();
  return `
    <div class="filters">
      <button class="chip${noteFilter.who === 'all' ? ' on' : ''}" data-who="all">Iedereen</button>
      ${people.map((p) => `<button class="chip${noteFilter.who === p ? ' on' : ''}" data-who="${esc(p)}">${esc(p)}</button>`).join('')}
    </div>
    <p class="status sync-${st.kind}">${esc(st.text)}</p>
    ${groups.length ? groups.map(({ day, notes }) => `
      <h2 class="section-title"><a href="#/dag/${day.iso}">Dag ${day.n} · ${esc(fmt(day.d, { weekday: 'short', day: 'numeric', month: 'short' }))} · ${esc(day.title)}</a></h2>
      ${notes.map((n) => noteCard(n, { actions: false })).join('')}`).join('')
    : '<div class="empty"><h3>Nog geen notities</h3><p>Open een dag in het reisplan en schrijf onderaan je eerste notitie.</p></div>'}`;
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
  return `${cards}${practical}<p class="note" style="margin:16px 4px">Tik op een nummer om het te kopiëren.</p>`;
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
    const rank = (p) => Math.min(...p.places.map((id) => ids.indexOf(id)).filter((i) => i >= 0));
    const list = passagesForPlaces(ids).sort((a, b) => rank(a) - rank(b));
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
    body = '<div class="empty"><h3>Nog geen teksten</h3><p>Zodra de bronteksten toegevoegd zijn, verschijnen hier citaten, beschrijvingen en weetjes per plaats.</p></div>';
  } else if (reading.message) {
    body = `<p class="status">${esc(reading.message)}</p>`;
  } else if (!res) {
    body = '<div class="empty"><h3>Waar ben je?</h3><p>Tik op <b>In de buurt</b>, zoek een plaats of een woord, of kies een halte van de reis hierboven.</p></div>';
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

/* ---------- shell & routing ---------- */

const ROUTES = {
  '': { tab: 'start', title: 'Sri Lanka', view: viewStart },
  reis: { tab: 'reis', title: 'Reisplan', view: viewReis },
  dag: { tab: 'reis', title: 'Reisplan', view: viewDag, back: '#/reis' },
  notities: { tab: 'notities', title: 'Notities', view: viewNotities },
  lezen: { tab: 'lezen', title: 'Lezen', view: viewLezen },
  boekingen: { tab: 'start', title: 'Boekingen', view: viewBoekingen, back: '#/' },
  nood: { tab: 'nood', title: 'Nood', view: viewNood },
};

function currentRoute() {
  const [name = '', arg] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: ROUTES[name] ? name : '', arg };
}

function render({ keepScroll = false } = {}) {
  const { name, arg } = currentRoute();
  const r = ROUTES[name];
  const y = window.scrollY;
  document.body.dataset.route = name || 'start';
  $('#top').hidden = !name;
  $('#top-title').textContent = r.title;
  $('#top-sub').textContent = tripStatus();
  $('#back').hidden = !r.back;
  $('#back').href = r.back || '#/';
  $('#view').innerHTML = r.view(arg);
  document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.tab === r.tab ? 'page' : 'false'));
  hydrateImages($('#view'));
  if (keepScroll) window.scrollTo(0, y);
}

function onRoute() {
  editingNote = null;
  render();
  if (['notities', 'dag', ''].includes(currentRoute().name)) NOTES.syncNow();
  window.scrollTo(0, 0);
  if (currentRoute().name === 'reis') document.getElementById(`d-${todayIso()}`)?.scrollIntoView({ block: 'center' });
}

// Notes changed (saved here or synced from the other phone): refresh without
// touching a note that is being typed.
function onNotesChange() {
  const { name } = currentRoute();
  if (name === 'dag') {
    const box = $('#day-notes');
    if (box) box.innerHTML = dayNotesHtml(currentRoute().arg);
  } else if (name === 'notities' || name === '') {
    render({ keepScroll: true });
  }
}

function readAbout(q) {
  reading.mode = 'search';
  reading.query = q;
  reading.message = '';
  location.hash = '#/lezen';
}

async function nearMe() {
  reading.mode = 'near';
  reading.message = 'Locatie bepalen…';
  render({ keepScroll: true });
  try {
    const c = await getPosition();
    reading.near = nearestPlaces(c.latitude, c.longitude, 4);
    reading.message = '';
  } catch (e) {
    reading.message = e.message;
  }
  render({ keepScroll: true });
}

async function shareLocation() {
  try {
    const c = await getPosition();
    const text = `Mijn locatie: ${mapsAt(c.latitude.toFixed(5), c.longitude.toFixed(5), 'Hier')}`;
    if (navigator.share) await navigator.share({ text });
    else await copy(text);
  } catch (e) {
    if (e.name !== 'AbortError') toast(e.message);
  }
}

async function saveNote(form) {
  const text = $('#note-text').value.trim();
  if (!text) return;
  const date = form.dataset.date;
  const day = (DATA.days || []).find((d) => d.date === date);
  const fallbackPlace = placeById(day?.places?.[0])?.name || day?.stay?.area || '';
  const existing = editingNote && NOTES.list().find((n) => n.id === editingNote);
  const note = existing
    ? NOTES.save({ ...existing, text })
    : NOTES.save({ id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, date, text, author: store.get('me'), place: fallbackPlace });
  editingNote = null;
  render({ keepScroll: true });
  toast('Notitie bewaard');
  if (existing) return;
  // Add the real position when the phone gives it; the day's place stands in until then.
  try {
    const c = await getPosition(8000);
    const near = nearestPlaces(c.latitude, c.longitude, 1)[0];
    const place = near && near.km < 25 ? `bij ${near.name}` : `${c.latitude.toFixed(3)}, ${c.longitude.toFixed(3)}`;
    NOTES.save({ ...note, place, lat: +c.latitude.toFixed(5), lon: +c.longitude.toFixed(5) });
  } catch { /* keep the day's place */ }
}

function wire() {
  window.addEventListener('hashchange', onRoute);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) NOTES.syncNow(); });
  window.addEventListener('online', () => NOTES.syncNow());
  setInterval(() => { if (!document.hidden) NOTES.syncNow(); }, 120000);

  $('#view').addEventListener('click', (e) => {
    const t = e.target.closest('[data-read],[data-fav],[data-copy],[data-me],[data-who],[data-edit],[data-del],#near,#favs,#share-loc,#note-cancel');
    if (!t) return;
    if (t.dataset.read) { e.preventDefault(); readAbout(t.dataset.read); }
    else if (t.dataset.fav) {
      const f = favs();
      f.has(t.dataset.fav) ? f.delete(t.dataset.fav) : f.add(t.dataset.fav);
      store.set('favs', [...f]);
      t.textContent = f.has(t.dataset.fav) ? '★' : '☆';
    } else if (t.dataset.copy) copy(t.dataset.copy);
    else if (t.dataset.me !== undefined) {
      if (t.dataset.me) store.set('me', t.dataset.me); else store.del('me');
      render({ keepScroll: true });
    } else if (t.dataset.who) { noteFilter.who = t.dataset.who; render({ keepScroll: true }); }
    else if (t.dataset.edit) {
      editingNote = t.dataset.edit;
      render({ keepScroll: true });
      $('#note-text')?.focus();
    } else if (t.dataset.del) {
      if (confirm('Deze notitie verwijderen?')) NOTES.remove(t.dataset.del);
    } else if (t.id === 'note-cancel') { editingNote = null; render({ keepScroll: true }); }
    else if (t.id === 'near') nearMe();
    else if (t.id === 'favs') { reading.mode = 'fav'; reading.message = ''; render({ keepScroll: true }); }
    else if (t.id === 'share-loc') shareLocation();
  });

  $('#view').addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'note-form') { saveNote(e.target); return; }
    if (e.target.id !== 'search-form') return;
    const q = $('#q').value.trim();
    reading.mode = q ? 'search' : 'start';
    reading.query = q;
    reading.message = '';
    render({ keepScroll: true });
    $('#q').blur();
  });
}

async function showApp() {
  KEY = await importContentKey(DATA.contentKey);
  NOTES = createNotes({ key: KEY, sync: DATA.sync, store, onChange: onNotesChange });
  $('#lock').hidden = true;
  for (const id of ['view', 'tabs']) $(`#${id}`).hidden = false;
  wire();
  onRoute();
  setTimeout(prefetchImages, 1500);
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
  $('#lock-form').onsubmit = async (e) => {
    e.preventDefault();
    if (!box) { location.reload(); return; }
    const pass = $('#pass').value;
    $('#lock-msg').textContent = 'Openen…';
    try {
      DATA = await decryptJSON(box, pass);
      store.set('pass', pass);
      await showApp();
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
    try { DATA = await decryptJSON(box, saved); await showApp(); return; } catch { store.del('pass'); }
  }
  showLock(box);
}

start();
