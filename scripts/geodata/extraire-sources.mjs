#!/usr/bin/env node
/**
 * Extraction des couches GeoData du Maroc depuis leurs sources d'origine ouvertes (D-GD-12) — script de préparation,
 * hors application :
 *
 *   node scripts/geodata/extraire-sources.mjs [--overpass <adresse interpreter>] [--seulement <cle,cle>] [--sortie <dossier>]
 *
 * Sources : OpenStreetMap (ODbL, par Overpass) et OurAirports (domaine public, fichiers CSV publiés).
 *
 * Pour chaque couche déclarée ci-dessous : requête Overpass (emprise du Maroc découpée en tuiles, reprises en cas
 * d'échec), objets restreints au territoire couvert par geoBoundaries MAR ADM1 (commit 9469f09, empreinte vérifiée),
 * GeoJSON déterministe (codes OSM triés, coordonnées à 7 décimales) écrit dans `docs/geodata/sources/osm/<cle>.geojson`
 * et fiche qualifiée `docs/geodata/sources/<cle>.json` (licence ODbL, empreinte SHA-256, date de la base OSM).
 * Une couche de plus de 5 000 objets (borne d'une couche V1) n'est pas écrite : elle est signalée, jamais tronquée.
 * Rien n'est inventé : seuls les objets et attributs présents dans OSM sont repris.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const FICHES = join(RACINE, "docs", "geodata", "sources");
/** Dossier d'écriture des fiches et des données (par défaut celui des fiches qualifiées du dépôt). */
const SOURCES = arg("sortie") ?? FICHES;
const OVERPASS = arg("overpass") ?? "https://overpass-api.de/api/interpreter";
const SEULEMENT = arg("seulement")?.split(",");
const MAX_OBJETS = 5000;
// Emprise de geoBoundaries MAR (sud, ouest, nord, est), découpée en tuiles pour ménager le serveur Overpass.
const EMPRISE = [20.7, -17.2, 35.95, -0.95];
const TUILES = 3;

/** Couches : clé, titre, requête Overpass (corps des sélecteurs, `{{bbox}}` remplacé), géométrie, attributs exposés. */
const COUCHES = [
  { cle: "osm-mar-barrages", titre: "Barrages du Maroc (OpenStreetMap)", theme: "hydrologie", sel: ['nwr["waterway"="dam"]'], geom: "surface", attrs: ["name", "name:fr", "name:ar", "operator", "start_date"] },
  { cle: "osm-mar-ports", titre: "Ports du Maroc (OpenStreetMap)", theme: "infrastructures", sel: ['nwr["landuse"="port"]', 'nwr["harbour"="yes"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "operator", "harbour", "landuse"] },
  { cle: "osm-mar-marinas", titre: "Ports de plaisance du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["leisure"="marina"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "operator"] },
  { cle: "osm-mar-gares", titre: "Gares ferroviaires du Maroc (OpenStreetMap)", theme: "infrastructures", sel: ['nwr["railway"="station"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "operator", "station"] },
  { cle: "osm-mar-centrales-electriques", titre: "Centrales électriques du Maroc (OpenStreetMap)", theme: "energie", sel: ['nwr["power"="plant"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "operator", "plant:source", "plant:method", "plant:output:electricity", "start_date"] },
  { cle: "osm-mar-postes-electriques", titre: "Postes électriques du Maroc (OpenStreetMap)", theme: "energie", sel: ['nwr["power"="substation"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "operator", "voltage", "substation"] },
  { cle: "osm-mar-eoliennes", titre: "Éoliennes du Maroc (OpenStreetMap)", theme: "energie", sel: ['nwr["power"="generator"]["generator:source"="wind"]'], geom: "point", attrs: ["name", "operator", "generator:output:electricity", "manufacturer", "model"] },
  { cle: "osm-mar-musees", titre: "Musées du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["tourism"="museum"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "operator", "website", "opening_hours"] },
  { cle: "osm-mar-attractions-touristiques", titre: "Attractions touristiques du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["tourism"="attraction"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "historic", "website"] },
  { cle: "osm-mar-campings", titre: "Campings et aires de caravanes du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["tourism"="camp_site"]', 'nwr["tourism"="caravan_site"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "tourism", "website"] },
  { cle: "osm-mar-hotels", titre: "Hôtels du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["tourism"="hotel"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "stars", "operator", "website"] },
  { cle: "osm-mar-information-touristique", titre: "Information touristique du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["tourism"="information"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "information"] },
  { cle: "osm-mar-plages", titre: "Plages du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["natural"="beach"]'], geom: "surface", attrs: ["name", "name:fr", "name:ar", "surface"] },
  { cle: "osm-mar-sites-patrimoniaux", titre: "Sites patrimoniaux et historiques du Maroc (OpenStreetMap)", theme: "patrimoine", sel: ['nwr["historic"~"^(archaeological_site|castle|fort|monument|ruins|city_gate|citywalls|memorial)$"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "historic", "heritage"] },
  { cle: "osm-mar-agences-de-voyages", titre: "Agences de voyages du Maroc (OpenStreetMap)", theme: "tourisme", sel: ['nwr["shop"="travel_agency"]', 'nwr["office"="travel_agent"]'], geom: "point", attrs: ["name", "name:fr", "name:ar"] },
  { cle: "osm-mar-etablissements-sante", titre: "Hôpitaux et cliniques du Maroc (OpenStreetMap)", theme: "equipements", sel: ['nwr["amenity"="hospital"]', 'nwr["amenity"="clinic"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "amenity", "healthcare", "operator", "operator:type"] },
  { cle: "osm-mar-administrations", titre: "Administrations publiques du Maroc (OpenStreetMap)", theme: "equipements", sel: ['nwr["amenity"="townhall"]', 'nwr["amenity"="courthouse"]', 'nwr["office"="government"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "amenity", "office", "government"] },
  { cle: "osm-mar-villes", titre: "Villes du Maroc (OpenStreetMap)", theme: "population", sel: ['node["place"="city"]', 'node["place"="town"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "place", "population", "population:date"] },
  { cle: "osm-mar-silos-agricoles", titre: "Silos agricoles du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["man_made"="silo"]'], geom: "point", attrs: ["name", "operator", "content"] },
  { cle: "osm-mar-puits", titre: "Puits d'eau du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["man_made"="water_well"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "pump", "drinking_water"] },
  { cle: "osm-mar-reservoirs-eau", titre: "Réservoirs et châteaux d'eau du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["man_made"="water_tower"]', 'nwr["man_made"="reservoir_covered"]'], geom: "point", attrs: ["name", "man_made", "operator"] },
  { cle: "osm-mar-stations-pompage", titre: "Stations de pompage d'eau du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["man_made"="pumping_station"]'], geom: "point", attrs: ["name", "operator", "substance"] },
  { cle: "osm-mar-pepinieres", titre: "Pépinières agricoles du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["landuse"="plant_nursery"]'], geom: "surface", attrs: ["name", "operator"] },
  { cle: "osm-mar-fournitures-agricoles", titre: "Commerces de fournitures agricoles du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["shop"="agrarian"]'], geom: "point", attrs: ["name", "name:fr", "name:ar", "agrarian"] },
  { cle: "osm-mar-apiculture", titre: "Sites apicoles du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['nwr["man_made"="beehive"]', 'nwr["craft"="beekeeper"]'], geom: "point", attrs: ["name", "operator"] },
  { cle: "osm-mar-vignobles", titre: "Vignobles du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['wr["landuse"="vineyard"]'], geom: "surface", attrs: ["name", "crop"] },
  { cle: "osm-mar-serres-horticoles", titre: "Zones horticoles sous serre du Maroc (OpenStreetMap)", theme: "agriculture", sel: ['wr["landuse"="greenhouse_horticulture"]'], geom: "surface", attrs: ["name", "operator"] },
  { cle: "osm-mar-canaux", titre: "Canaux d'eau du Maroc (OpenStreetMap)", theme: "hydrologie", sel: ['way["waterway"="canal"]'], geom: "ligne", attrs: ["name", "name:fr", "name:ar", "usage"] },
];

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(requete) {
  for (let essai = 1; essai <= 8; essai++) {
    try {
      const r = await fetch(OVERPASS, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Fadi-GeoData/1 (extraction ODbL documentée)" }, body: `data=${encodeURIComponent(requete)}`, signal: AbortSignal.timeout(300_000) });
      const t = await r.text();
      if (r.ok && t.trimStart().startsWith("{")) {
        const j = JSON.parse(t);
        if (j.remark && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error(j.remark);
        return j;
      }
      throw new Error(`HTTP ${r.status} ${t.slice(0, 80).replace(/\s+/g, " ")}`);
    } catch (e) {
      process.stderr.write(`  essai ${essai} : ${e.message}\n`);
      await pause(5000 * essai);
    }
  }
  throw new Error("Overpass injoignable après 8 essais");
}

// --- Territoire : union des 12 régions geoBoundaries MAR ADM1 (empreinte vérifiée) ---
const ficheAdm1 = JSON.parse(readFileSync(join(FICHES, "geoboundaries-mar-adm1.json"), "utf8"));
const brutAdm1 = Buffer.from(await (await fetch(ficheAdm1.version.url)).arrayBuffer());
if (createHash("sha256").update(brutAdm1).digest("hex") !== ficheAdm1.version.empreinte) throw new Error("Empreinte geoBoundaries ADM1 non conforme");
const polygones = JSON.parse(brutAdm1.toString("utf8")).features.flatMap((f) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates));
const boites = polygones.map((p) => { const xs = p[0].map((c) => c[0]); const ys = p[0].map((c) => c[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; });
function dansAnneau(x, y, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]; const [xj, yj] = anneau[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}
const auMaroc = ([x, y]) => polygones.some((p, k) => { const b = boites[k]; return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && dansAnneau(x, y, p[0]) && !p.slice(1).some((t) => dansAnneau(x, y, t)); });

const r7 = (n) => Math.round(n * 1e7) / 1e7;
function geometrie(el, geom) {
  const centre = el.type === "node" ? [el.lon, el.lat] : el.center ? [el.center.lon, el.center.lat] : null;
  const ligne = el.geometry?.filter(Boolean).map((p) => [r7(p.lon), r7(p.lat)]);
  if (geom === "ligne" && el.type === "way" && ligne?.length >= 2) return { g: { type: "LineString", coordinates: ligne }, repere: ligne[0] };
  if (geom === "surface" && el.type === "way" && ligne?.length >= 4 && ligne[0][0] === ligne.at(-1)[0] && ligne[0][1] === ligne.at(-1)[1]) return { g: { type: "Polygon", coordinates: [ligne] }, repere: centre ?? ligne[0] };
  if (!centre) return null;
  return { g: { type: "Point", coordinates: [r7(centre[0]), r7(centre[1])] }, repere: centre };
}

const resultat = [];
for (const c of COUCHES) {
  if (SEULEMENT && !SEULEMENT.includes(c.cle)) continue;
  process.stderr.write(`${c.cle}…\n`);
  const sortie = c.geom === "point" ? "out center tags;" : "out center tags geom;";
  const vus = new Map();
  let base = null;
  const [s, o, n, e] = EMPRISE;
  for (let i = 0; i < TUILES; i++) for (let j = 0; j < TUILES; j++) {
    const bbox = [s + ((n - s) * i) / TUILES, o + ((e - o) * j) / TUILES, s + ((n - s) * (i + 1)) / TUILES, o + ((e - o) * (j + 1)) / TUILES].map((v) => v.toFixed(4)).join(",");
    const j2 = await overpass(`[out:json][timeout:240];(${c.sel.map((x) => `${x}(${bbox});`).join("")});${sortie}`);
    base = j2.osm3s?.timestamp_osm_base ?? base;
    for (const el of j2.elements ?? []) vus.set(`${el.type[0]}${el.id}`, el);
  }
  const features = [];
  for (const [code, el] of [...vus].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const g = geometrie(el, c.geom);
    if (!g || !auMaroc(g.repere)) continue;
    const t = el.tags ?? {};
    const props = { code, osm: `${el.type}/${el.id}`, nom: t["name:fr"] ?? t.name ?? t["name:ar"] ?? null };
    for (const a of c.attrs) if (t[a] !== undefined) props[a] = String(t[a]).slice(0, 500);
    features.push({ type: "Feature", properties: props, geometry: g.g });
  }
  ecrire(c, features, {
    description: `Extraction OpenStreetMap (${c.sel.join(" ; ")}) restreinte au territoire couvert par geoBoundaries MAR ADM1. Données collaboratives : exhaustivité et exactitude non garanties ; ce n'est pas un inventaire officiel.`,
    producteur: "Contributeurs OpenStreetMap", libelle: `OpenStreetMap — base du ${base}`, periode: `Base OpenStreetMap du ${base}`, base,
    licence: "Open Data Commons Open Database License 1.0 (ODbL)", attribution: "© contributeurs OpenStreetMap (ODbL)",
    precision: (types) => `Positions saisies par les contributeurs OSM ; ${types.includes("Point") && c.geom !== "point" ? "relations et objets non fermés représentés par leur point central ; " : ""}${c.geom === "point" ? "voies et surfaces représentées par leur point central (Overpass « center »)" : "géométries des voies reprises telles quelles"} ; coordonnées arrondies à 10⁻⁷ degré`,
    conditions: "ODbL 1.0 : attribution « © contributeurs OpenStreetMap » obligatoire ; une base dérivée redistribuée reste sous ODbL (partage à l'identique) ; une œuvre produite (carte, image) peut être diffusée avec l'attribution.",
    codes: "code = type et identifiant OSM (n = nœud, w = voie, r = relation)",
  });
}

function ecrire(c, features, m) {
  const ligne = { cle: c.cle, titre: c.titre, objets: features.length, base: m.base };
  if (features.length === 0 || features.length > MAX_OBJETS) {
    ligne.ecartee = features.length === 0 ? "aucun objet" : `${features.length} objets > ${MAX_OBJETS} (borne d'une couche V1)`;
    resultat.push(ligne);
    process.stderr.write(`  écartée : ${ligne.ecartee}\n`);
    return;
  }
  const texte = JSON.stringify({ type: "FeatureCollection", features });
  const empreinte = createHash("sha256").update(texte).digest("hex");
  mkdirSync(join(SOURCES, "donnees"), { recursive: true });
  writeFileSync(join(SOURCES, "donnees", `${c.cle}.geojson`), texte);
  const types = [...new Set(features.map((f) => f.geometry.type))];
  const exposees = ["code", ...(features.some((f) => f.properties.osm) ? ["osm"] : []), "nom", ...c.attrs.filter((a) => features.some((f) => f.properties[a] !== undefined))];
  const fiche = {
    cle: c.cle,
    titre: c.titre,
    description: m.description,
    producteur: m.producteur,
    theme: c.theme,
    couverture: "Maroc (territoire de geoBoundaries gbOpen MAR ADM1)",
    version: {
      libelle: m.libelle,
      url: null,
      fichier: `donnees/${c.cle}.geojson`,
      empreinte,
      periode: m.periode,
      licence: m.licence,
      attribution: m.attribution,
      droits: { consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "autorise", partage: "autorise", telechargement: "autorise", export: "autorise" },
      precision: m.precision(types),
      synthetique: false,
      conditions: m.conditions,
    },
    couche: { titre: c.titre, description: `${features.length} objets ; ${m.codes}.`, niveau: null, champCode: "code", champNom: "nom", proprietesExposees: exposees, styleDefaut: { mode: "simple", couleur: "#2b8cbe" } },
    indicateurs: [],
    superficie: types.every((t) => t === "Polygon"),
  };
  writeFileSync(join(SOURCES, `${c.cle}.json`), `${JSON.stringify(fiche, null, 2)}\n`);
  resultat.push({ ...ligne, types, octets: Buffer.byteLength(texte), empreinte });
  process.stderr.write(`  ${features.length} objets (${types.join(", ")}), ${Math.round(texte.length / 1024)} Kio\n`);
}

// --- OurAirports (domaine public) : aérodromes, aéroports, héliports en service ---
const OA = { cle: "ourairports-mar-aerodromes", titre: "Aéroports, aérodromes et héliports du Maroc (OurAirports)", theme: "infrastructures", geom: "point", attrs: ["type", "ident", "icao_code", "iata_code", "municipality", "elevation_ft", "scheduled_service"] };
if (!SEULEMENT || SEULEMENT.includes(OA.cle)) {
  const URL_OA = "https://davidmegginson.github.io/ourairports-data/airports.csv";
  const csv = await (await fetch(URL_OA)).text();
  const lignes = csv.split(/\r?\n/).filter(Boolean);
  const champs = (l) => { const out = []; let cur = ""; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; };
  const tete = champs(lignes[0]);
  const features = [];
  for (const l of lignes.slice(1)) {
    const r = Object.fromEntries(champs(l).map((v, i) => [tete[i], v]));
    if (r.type === "closed") continue;
    const p = [r7(Number(r.longitude_deg)), r7(Number(r.latitude_deg))];
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !auMaroc(p)) continue;
    const props = { code: `oa${r.id}`, nom: r.name || null };
    for (const a of OA.attrs) if (r[a]) props[a] = r[a].slice(0, 500);
    features.push({ type: "Feature", properties: props, geometry: { type: "Point", coordinates: p } });
  }
  features.sort((a, b) => (a.properties.code < b.properties.code ? -1 : 1));
  const jour = new Date().toISOString().slice(0, 10);
  ecrire(OA, features, {
    description: `Aérodromes, aéroports, héliports et hydrobases en service (type ≠ closed) d'OurAirports (${URL_OA}), restreints au territoire couvert par geoBoundaries MAR ADM1. Base collaborative : ce n'est pas la liste officielle de l'aviation civile.`,
    producteur: "OurAirports (David Megginson et contributeurs)", libelle: `OurAirports — fichier airports.csv du ${jour}`, periode: `Fichier téléchargé le ${jour}`, base: jour,
    licence: "Domaine public (OurAirports : « released to the Public Domain »)", attribution: "Données OurAirports (domaine public)",
    precision: () => "Position de référence de chaque aérodrome telle que publiée par OurAirports ; altitude en pieds (elevation_ft) telle que publiée",
    conditions: "Domaine public : réutilisation libre ; la source est citée par courtoisie et traçabilité.",
    codes: "code = « oa » + identifiant OurAirports",
  });
}
console.log(JSON.stringify(resultat, null, 2));
