#!/usr/bin/env node
// Encrypts private/trip.json into data/trip.enc.json (committed), or decrypts it back.
//
//   TRIP_PASSPHRASE='...' node tools/vault.mjs encrypt
//   TRIP_PASSPHRASE='...' node tools/vault.mjs decrypt
//
// private/ is git-ignored: only the encrypted file ever reaches the repository.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encryptJSON, decryptJSON } from '../crypto.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plainPath = join(root, 'private', 'trip.json');
const boxPath = join(root, 'data', 'trip.enc.json');

const [cmd] = process.argv.slice(2);
const pass = process.env.TRIP_PASSPHRASE;
if (!pass || !['encrypt', 'decrypt'].includes(cmd)) {
  console.error("usage: TRIP_PASSPHRASE='...' node tools/vault.mjs encrypt|decrypt");
  process.exit(1);
}

if (cmd === 'encrypt') {
  const obj = JSON.parse(await readFile(plainPath, 'utf8'));
  const box = await encryptJSON(obj, pass);
  await decryptJSON(box, pass); // round-trip check before overwriting
  await mkdir(dirname(boxPath), { recursive: true });
  await writeFile(boxPath, JSON.stringify(box) + '\n');
  console.log(`encrypted ${plainPath} -> ${boxPath}`);
} else {
  const box = JSON.parse(await readFile(boxPath, 'utf8'));
  const obj = await decryptJSON(box, pass);
  await mkdir(dirname(plainPath), { recursive: true });
  await writeFile(plainPath, JSON.stringify(obj, null, 2) + '\n');
  console.log(`decrypted ${boxPath} -> ${plainPath}`);
}
