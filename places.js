// Gazetteer used by the literary companion: passages are tagged with these ids,
// and "In de buurt" matches the phone's position against these coordinates.

export const PLACES = [
  { id: 'colombo', name: 'Colombo', lat: 6.9271, lon: 79.8612 },
  { id: 'negombo', name: 'Negombo', lat: 7.2083, lon: 79.8358, aliases: ['kochchikade'] },
  { id: 'kandy', name: 'Kandy', lat: 7.2906, lon: 80.6337, aliases: ['mahanuwara', 'hanthana', 'peradeniya', 'heel oya', 'kadugannawa', 'nawalapitiya', 'tempel van de tand', 'temple of the tooth', 'dalada maligawa'] },
  { id: 'pinnawala', name: 'Pinnawala', lat: 7.3, lon: 80.387 },
  { id: 'matale', name: 'Matale', lat: 7.4675, lon: 80.6234 },
  { id: 'knuckles', name: 'Knuckles', lat: 7.45, lon: 80.8 },
  { id: 'dambulla', name: 'Dambulla', lat: 7.8567, lon: 80.6492, aliases: ['grottempel', 'cave temple'] },
  { id: 'sigiriya', name: 'Sigiriya', lat: 7.957, lon: 80.7603, aliases: ['leeuwenrots', 'lion rock', 'pidurangala'] },
  { id: 'habarana', name: 'Habarana', lat: 8.036, lon: 80.75 },
  { id: 'minneriya', name: 'Minneriya', lat: 8.04, lon: 80.9, aliases: ['kaudulla'] },
  { id: 'polonnaruwa', name: 'Polonnaruwa', lat: 7.9403, lon: 81.0188, aliases: ['gal vihara'] },
  { id: 'anuradhapura', name: 'Anuradhapura', lat: 8.3114, lon: 80.4037 },
  { id: 'mihintale', name: 'Mihintale', lat: 8.351, lon: 80.51 },
  { id: 'wilpattu', name: 'Wilpattu', lat: 8.456, lon: 80.014 },
  { id: 'kalpitiya', name: 'Kalpitiya', lat: 8.2333, lon: 79.7667 },
  { id: 'kurunegala', name: 'Kurunegala', lat: 7.4863, lon: 80.3647 },
  { id: 'trincomalee', name: 'Trincomalee', lat: 8.5874, lon: 81.2152, aliases: ['trinco', 'nilaveli', 'uppuveli'] },
  { id: 'pasikudah', name: 'Pasikudah', lat: 7.928, lon: 81.561 },
  { id: 'batticaloa', name: 'Batticaloa', lat: 7.717, lon: 81.7 },
  { id: 'jaffna', name: 'Jaffna', lat: 9.6615, lon: 80.0255 },
  { id: 'arugam-bay', name: 'Arugam Bay', lat: 6.84, lon: 81.836 },
  { id: 'kitulgala', name: 'Kitulgala', lat: 6.9895, lon: 80.4176 },
  { id: 'hatton', name: 'Hatton', lat: 6.8916, lon: 80.5955 },
  { id: 'adams-peak', name: "Adam's Peak", lat: 6.8096, lon: 80.4994, aliases: ['sri pada', 'adamspiek', 'adams peak'] },
  { id: 'nuwara-eliya', name: 'Nuwara Eliya', lat: 6.9497, lon: 80.7891, aliases: ['little england', 'nanu oya', 'kandapola', 'gregory lake', 'hakgala', 'moon plains', 'talawakele', 'thalawakele', 'st clair'] },
  { id: 'horton-plains', name: 'Horton Plains', lat: 6.802, lon: 80.806, aliases: ["world's end", 'worlds end', 'pattipola', 'ohiya', 'ambewela'] },
  { id: 'haputale', name: 'Haputale', lat: 6.7656, lon: 80.951, aliases: ["lipton's seat", 'liptons seat', 'dambatenne'] },
  { id: 'bambarakanda', name: 'Bambarakanda', lat: 6.7737, lon: 80.8303, aliases: ['kalupahana'] },
  { id: 'bandarawela', name: 'Bandarawela', lat: 6.829, lon: 80.987 },
  { id: 'ella', name: 'Ella', lat: 6.8667, lon: 81.0466, aliases: ['nine arch bridge', 'little adams peak'] },
  { id: 'badulla', name: 'Badulla', lat: 6.9934, lon: 81.055 },
  { id: 'ratnapura', name: 'Ratnapura', lat: 6.6828, lon: 80.3992 },
  { id: 'pelmadulla', name: 'Pelmadulla', lat: 6.6236, lon: 80.5428 },
  { id: 'sinharaja', name: 'Sinharaja', lat: 6.4, lon: 80.5, aliases: ['rakwana'] },
  { id: 'udawalawe', name: 'Udawalawe', lat: 6.474, lon: 80.8987 },
  { id: 'tissamaharama', name: 'Tissamaharama', lat: 6.2833, lon: 81.2833, aliases: ['tissa', 'kataragama'] },
  { id: 'yala', name: 'Yala', lat: 6.3725, lon: 81.5185 },
  { id: 'tangalle', name: 'Tangalle', lat: 6.024, lon: 80.794 },
  { id: 'mirissa', name: 'Mirissa', lat: 5.9483, lon: 80.4716 },
  { id: 'weligama', name: 'Weligama', lat: 5.975, lon: 80.429 },
  { id: 'ahangama', name: 'Ahangama', lat: 5.973, lon: 80.37, aliases: ['koggala'] },
  { id: 'unawatuna', name: 'Unawatuna', lat: 6.01, lon: 80.249 },
  { id: 'galle', name: 'Galle', lat: 6.0329, lon: 80.2168, aliases: ['galle fort'] },
  { id: 'hikkaduwa', name: 'Hikkaduwa', lat: 6.1395, lon: 80.1063 },
  { id: 'madu-river', name: 'Madu-rivier', lat: 6.287, lon: 80.05, aliases: ['madu ganga', 'maduganga', 'balapitiya'] },
  { id: 'ambalangoda', name: 'Ambalangoda', lat: 6.2355, lon: 80.0538 },
  { id: 'bentota', name: 'Bentota', lat: 6.421, lon: 80.003, aliases: ['lunuganga', 'brief garden'] },
];

const byId = new Map(PLACES.map((p) => [p.id, p]));
export const placeById = (id) => byId.get(id);

export const fold = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();

export function findPlaces(query) {
  const q = fold(query);
  if (!q) return [];
  return PLACES.filter((p) => [p.name, p.id, ...(p.aliases || [])].some((n) => {
    const f = fold(n);
    return f === q || f.includes(q) || (q.length > 3 && q.includes(f));
  }));
}

function km(aLat, aLon, bLat, bLon) {
  const r = Math.PI / 180;
  const dLat = (bLat - aLat) * r;
  const dLon = (bLon - aLon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function nearestPlaces(lat, lon, count = 4) {
  return PLACES.map((p) => ({ ...p, km: km(lat, lon, p.lat, p.lon) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count);
}
