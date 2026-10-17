# Sri Lanka

Travel companion for a trip to Sri Lanka. It is a web app
that installs on an iPhone from Safari (Share › Add to Home Screen) and works offline.

Tabs: **Reis** (day by day program), **Boekingen**, **Nood** (emergency numbers,
Belgian embassy and consulate, tap to call, share location) and **Lezen**
(literary companion: passages by nearby place or search term).

## Private data

All trip details live in `data/trip.enc.json`, encrypted with a passphrase
(PBKDF2 + AES-GCM, see `crypto.js`). The plaintext `private/trip.json` is
git-ignored and never committed.

```sh
TRIP_PASSPHRASE='...' node tools/vault.mjs decrypt   # data/trip.enc.json -> private/trip.json
# edit private/trip.json
TRIP_PASSPHRASE='...' node tools/vault.mjs encrypt   # private/trip.json -> data/trip.enc.json
```

## Literary passages

Passages go in the `passages` array of the trip data:

```json
{ "id": "knox-1", "text": "…", "author": "Robert Knox", "source": "An Historical Relation of Ceylon",
  "where": "Part I, ch. 2", "places": ["kandy"], "tags": ["koning", "geschiedenis"] }
```

`places` uses the ids from `places.js`.

## Run locally

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```
