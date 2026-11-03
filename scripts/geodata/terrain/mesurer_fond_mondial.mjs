#!/usr/bin/env node
/**
 * Mesure des performances du fond mondial à la demande (TER-09, budgets du plan : point p95 < 1 s en cache, vue < 3 s en
 * cache) contre une API Fadi en marche dont une version mondiale est publiée, à froid puis en cache, sur plusieurs zones.
 * Lecture seule (aucune écriture hors de l'inscription d'un compte de mesure) ; les conditions sont à consigner avec les
 * résultats (réseau, machine, cache, concurrence).
 *
 *   BASE_URL=http://localhost:3011 node scripts/geodata/terrain/mesurer_fond_mondial.mjs [phase]
 *
 * `phase` : libellé de la mesure (« froid », « cache-disque », « cache-memoire »…), repris dans la sortie JSON.
 */
const BASE = (process.env.BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");
const PHASE = process.argv[2] ?? "mesure";
const ZONES = [
  { nom: "Benslimane", lon: -7.10621, lat: 33.5315 },
  { nom: "Lucerne", lon: 8.3093, lat: 47.0502 },
  { nom: "Paris", lon: 2.3522, lat: 48.8566 },
];
const N_POINTS = Number(process.env.N_POINTS ?? 20);
const ZOOM = Number(process.env.ZOOM ?? 13);
const CONCURRENCE = 6; // connexions simultanées d'un navigateur par hôte

let cookie = "";
async function appeler(chemin, init = {}) {
  const t0 = performance.now();
  const r = await fetch(`${BASE}${chemin}`, { ...init, headers: { ...(init.headers ?? {}), cookie, "content-type": "application/json" } });
  const corps = r.headers.get("content-type")?.includes("json") ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { statut: r.status, ms: performance.now() - t0, corps, etat: r.headers.get("x-terrain-etat") };
}

async function connecter() {
  const email = `mesure-terrain-${Date.now().toString(36)}@example.test`;
  const r = await fetch(`${BASE}/auth/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "mesure-terrain-123456" }) });
  cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (r.status !== 201) throw new Error(`inscription : HTTP ${r.status}`);
}

/** Centile au rang le plus proche (comme le P95 du plan). */
const centile = (v, q) => { const t = [...v].sort((a, b) => a - b); return t[Math.max(0, Math.ceil(q * t.length) - 1)]; };
const tuile = (z, lon, lat) => {
  const r = (lat * Math.PI) / 180;
  return { x: Math.floor(((lon + 180) / 360) * 2 ** z), y: Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z) };
};
// Points pseudo-aléatoires reproductibles (graine fixe) dans ±0,05° autour du centre.
let graine = 42;
const aleatoire = () => { graine = (graine * 1103515245 + 12345) % 2 ** 31; return graine / 2 ** 31; };

async function enParallele(taches, n) {
  const sortie = [];
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < taches.length) { const k = i++; sortie[k] = await taches[k](); } }));
  return sortie;
}

await connecter();
const jeux = (await appeler(`/geodata/api/terrain/jeux?produit=MNT`)).corps.jeux;
const mondial = jeux.find((j) => j.acces === "a-la-demande");
if (!mondial) throw new Error("Aucune version mondiale publiée.");
const resultats = { phase: PHASE, base: BASE, version: mondial.versionId, titre: mondial.titre, zoom: ZOOM, zones: [] };
for (const z of ZONES) {
  const premier = await appeler(`/geodata/api/terrain/point?lon=${z.lon}&lat=${z.lat}&produit=MNT`);
  const durees = [];
  const valeurs = [];
  for (let i = 0; i < N_POINTS; i++) {
    const lon = z.lon + (aleatoire() - 0.5) * 0.1, lat = z.lat + (aleatoire() - 0.5) * 0.1;
    const r = await appeler(`/geodata/api/terrain/point?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}&produit=MNT`);
    durees.push(r.ms);
    valeurs.push(r.corps.disponible ? Number(r.corps.altitude.toFixed(1)) : r.corps.etat ?? "indisponible");
  }
  // Vue de 5 × 3 tuiles d'altitude (plage de la version, comme la légende verrouillée) autour du centre.
  const c = tuile(ZOOM, z.lon, z.lat);
  const taches = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) taches.push(() => appeler(`/geodata/api/terrain/tuiles/${mondial.versionId}/altitude/${ZOOM}/${c.x + dx}/${c.y + dy}`));
  const t0 = performance.now();
  const tuiles = await enParallele(taches, CONCURRENCE);
  const vue = performance.now() - t0;
  resultats.zones.push({
    zone: z.nom, centre: [z.lon, z.lat],
    pointCentre: { ms: Math.round(premier.ms), altitude: premier.corps.altitude ?? null, disponible: premier.corps.disponible, etat: premier.corps.etat ?? null },
    points: { n: N_POINTS, p50: Math.round(centile(durees, 0.5)), p95: Math.round(centile(durees, 0.95)), max: Math.round(Math.max(...durees)), echantillon: valeurs.slice(0, 5) },
    vue: { tuiles: tuiles.length, ms: Math.round(vue), statuts: [...new Set(tuiles.map((t) => t.statut))], octets: tuiles.reduce((s, t) => s + (Buffer.isBuffer(t.corps) ? t.corps.length : 0), 0) },
  });
}
const etat = await fetch(`${process.env.DISTANT_URL ?? "http://127.0.0.1:3012"}/sante`).then((r) => r.json()).catch(() => null);
resultats.serviceDistant = etat ? { cache: etat.cache, compteurs: etat.compteurs, budget: { minute: etat.budget.minute, octetsJour: etat.budget.octetsJour } } : null;
console.log(JSON.stringify(resultats, null, 2));
