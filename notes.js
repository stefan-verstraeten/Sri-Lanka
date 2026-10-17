// Travel notes. Every note is kept on the phone first; when the trip data holds a
// GitHub token (sync), notes are also stored encrypted as notes/<id>.json on a
// separate branch, so both phones see each other's notes. Without a token, or
// offline, the app keeps working and syncs later.

import { encryptText, decryptText } from './crypto.js';

const API = 'https://api.github.com';

export function createNotes({ key, sync, store, onChange }) {
  const notes = store.get('notes:v1', {});
  const shas = store.get('notes:sha', {});
  const queue = new Set(store.get('notes:queue', []));
  let busy = null;
  let branchReady = false;
  let lastError = '';
  let timer;

  const enabled = !!(sync && sync.token && sync.owner && sync.repo && sync.branch);

  function persist() {
    store.set('notes:v1', notes);
    store.set('notes:sha', shas);
    store.set('notes:queue', [...queue]);
  }

  function list() {
    return Object.values(notes).filter((n) => !n.deleted).sort((a, b) => a.created.localeCompare(b.created));
  }

  function save(note) {
    const now = new Date().toISOString();
    const n = { ...notes[note.id], ...note, updated: now };
    if (!n.created) n.created = now;
    notes[n.id] = n;
    queue.add(n.id);
    persist();
    onChange();
    syncSoon();
    return n;
  }

  function remove(id) {
    if (!notes[id]) return;
    notes[id] = { ...notes[id], deleted: true, updated: new Date().toISOString() };
    queue.add(id);
    persist();
    onChange();
    syncSoon();
  }

  async function gh(path, opts = {}) {
    const res = await fetch(`${API}/repos/${sync.owner}/${sync.repo}${path}`, {
      ...opts,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${sync.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(res.status === 401 ? 'De sleutel voor het delen van notities is verlopen of ongeldig.' : `GitHub antwoordde ${res.status}`);
    return res.status === 204 ? {} : res.json();
  }

  async function ensureBranch() {
    if (branchReady) return;
    if (!(await gh(`/git/ref/heads/${sync.branch}`))) {
      const repo = await gh('');
      const base = await gh(`/git/ref/heads/${repo.default_branch}`);
      await gh('/git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${sync.branch}`, sha: base.object.sha }) });
    }
    branchReady = true;
  }

  async function push(id) {
    const n = notes[id];
    const path = `/contents/notes/${id}.json`;
    const cur = await gh(`${path}?ref=${sync.branch}`);
    if (!n || n.deleted) {
      if (cur) await gh(path, { method: 'DELETE', body: JSON.stringify({ message: 'Notitie verwijderd', sha: cur.sha, branch: sync.branch }) });
      delete notes[id];
      delete shas[id];
    } else {
      const file = JSON.stringify({ v: 1, data: await encryptText(key, JSON.stringify(n)) });
      const res = await gh(path, {
        method: 'PUT',
        body: JSON.stringify({ message: 'Notitie', content: btoa(file), branch: sync.branch, ...(cur ? { sha: cur.sha } : {}) }),
      });
      shas[id] = res.content.sha;
    }
    queue.delete(id);
    persist();
  }

  async function pull() {
    const dir = (await gh(`/contents/notes?ref=${sync.branch}`)) || [];
    const remote = new Map(dir.filter((f) => f.name.endsWith('.json')).map((f) => [f.name.slice(0, -5), f.sha]));
    for (const [id, sha] of remote) {
      if (queue.has(id) || shas[id] === sha) continue;
      const f = await gh(`/contents/notes/${id}.json?ref=${sync.branch}`);
      const box = JSON.parse(atob(f.content.replace(/\s/g, '')));
      notes[id] = JSON.parse(await decryptText(key, box.data));
      shas[id] = sha;
    }
    // A synced note that disappeared remotely was deleted on the other phone.
    for (const id of Object.keys(notes)) {
      if (!remote.has(id) && !queue.has(id) && shas[id]) {
        delete notes[id];
        delete shas[id];
      }
    }
    persist();
  }

  function syncNow() {
    if (!enabled || !navigator.onLine) return Promise.resolve();
    if (busy) return busy;
    busy = (async () => {
      try {
        await ensureBranch();
        for (const id of [...queue]) await push(id);
        await pull();
        lastError = '';
      } catch (e) {
        lastError = e.message || 'Synchroniseren mislukt';
      } finally {
        busy = null;
        onChange();
      }
    })();
    return busy;
  }

  function syncSoon() {
    clearTimeout(timer);
    timer = setTimeout(syncNow, 600);
  }

  function status() {
    if (!enabled) return { kind: 'local', text: 'Notities staan alleen op deze telefoon (delen is nog niet ingesteld).' };
    if (lastError) return { kind: 'error', text: `Niet gesynchroniseerd: ${lastError}` };
    if (queue.size) return { kind: 'pending', text: `${queue.size} ${queue.size === 1 ? 'notitie wacht' : 'notities wachten'} op internet om te delen.` };
    return { kind: 'ok', text: 'Gedeeld en bijgewerkt.' };
  }

  return { list, save, remove, syncNow, status };
}
