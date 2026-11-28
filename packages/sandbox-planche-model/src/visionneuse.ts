/**
 * Cas 4 du catalogue des extensions, lot C4, étape 7d (D10-F14-085) : visionneuse autonome en un seul fichier HTML,
 * consultable hors ligne dans n'importe quel navigateur. Le fichier porte la maquette en coordonnées locales (mètres,
 * Z vers le haut), les balises (affichées ou masquées dans la visionneuse, sur option), les vues enregistrées choisies,
 * la version et l'empreinte de la Planche. Rien n'y est modifiable ; aucune ressource externe (politique de sécurité
 * `default-src 'none'`) : ni réseau, ni serveur. Texte reproductible : même modèle, mêmes options, mêmes octets.
 */
import { appliquer, composer, positionsFace, transformerNormale, type Contexte, type Id, type Matrice4, type Modele } from "./geometrie-libre.js";
import { empreintePlanche } from "./delta.js";
import { triangulerFace } from "./maillage.js";
import { normalize, type Vec3 } from "./vecteur.js";
import { SCRIPT_VISIONNEUSE } from "./visionneuse-script.js";

export interface OptionsVisionneuse {
  /** Nom de la Planche (titre du fichier). */
  readonly nom: string;
  /** Balises portées dans le fichier : affichées ou masquées dans la visionneuse. Sans elles, seul le visible part. */
  readonly balises: boolean;
  /** Vues enregistrées (scènes) retenues, dans l'ordre de la Planche. */
  readonly scenes: readonly Id[];
  /** Heure de la version écrite dans le fichier. */
  readonly maintenant: Date;
}

/** Balise telle que la visionneuse la connaît. */
export interface BaliseVisionneuse {
  readonly id: string;
  readonly nom: string;
  readonly couleur: string;
  readonly visible: boolean;
}

/** Maillage écrit : positions en millimètres entiers (coordonnées locales), indices de triangles. */
export interface MaillageVisionneuse {
  readonly nom: string;
  /**
   * Indices dans `balises` de toutes les balises portées sur le chemin (objet de la racine, objets imbriqués, face) :
   * le maillage n'est visible que si toutes le sont. Vide : sans balise.
   */
  readonly balises: readonly number[];
  readonly positions: readonly number[];
  readonly triangles: readonly number[];
}

export interface VueVisionneuse {
  readonly nom: string;
  readonly position: readonly [number, number, number];
  readonly cible: readonly [number, number, number];
  readonly champ: number;
  readonly projection: "perspective" | "parallele";
}

export interface DonneesVisionneuse {
  readonly nom: string;
  readonly version: string;
  readonly empreinte: string;
  readonly balises: readonly BaliseVisionneuse[];
  readonly maillages: readonly MaillageVisionneuse[];
  readonly vues: readonly VueVisionneuse[];
}

export interface ExportVisionneuse {
  readonly html: string;
  /** Taille du fichier en octets (UTF-8). */
  readonly octets: number;
  readonly triangles: number;
  readonly objets: number;
  readonly vues: number;
  readonly empreinte: string;
  readonly version: string;
}

/** Heure de version lisible en heure suisse : « 28.11.2026, 11 h 58 ». */
export function versionVisionneuse(d: Date): string {
  const parties = new Intl.DateTimeFormat("fr-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const v = (t: string) => parties.find((p) => p.type === t)?.value ?? "";
  return `${v("day")}.${v("month")}.${v("year")}, ${Number(v("hour"))} h ${v("minute")}`;
}

/** Empreinte abrégée affichée : quatre premiers groupes de quatre signes, puis les quatre derniers (« 7f3a 91c0 … 2c21 »). */
export const empreinteAbregee = (e: string): string => (e.length > 12 ? `${e.slice(0, 4)} ${e.slice(4, 8)} … ${e.slice(-4)}` : e);

/** Morceau de maquette : objet de la racine (ou géométrie libre) et balises du chemin, triangles en mètres. */
interface Morceau {
  readonly nom: string;
  readonly balises: readonly Id[];
  readonly positions: number[];
  readonly triangles: number[];
}

/**
 * Parcourt la maquette visible (objets et faces masqués exclus) en gardant les balises de chaque face : celles des objets
 * qui la contiennent, puis la sienne. Un morceau par objet de la racine et par jeu de balises, dans un ordre stable.
 */
function morceaux(m: Modele): Morceau[] {
  const parCle = new Map<string, Morceau>();
  const ordre: Morceau[] = [];
  const ajouter = (nom: string, cleObjet: string, balises: readonly Id[], c: Contexte, M: Matrice4 | null, profondeur: number): void => {
    if (profondeur > 32) return;
    for (const o of Object.values(c.occurrences).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (o.masquee) continue;
      const d = m.definitions[o.definition];
      if (!d) continue;
      const b = o.balise ? [...balises, o.balise] : balises;
      ajouter(profondeur === 0 ? (o.nom ?? d.nom) : nom, profondeur === 0 ? o.id : cleObjet, b, d.contenu, M ? composer(M, o.transformation) : o.transformation, profondeur + 1);
    }
    for (const f of Object.values(c.faces).sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (f.masquee) continue;
      const b = f.balise ? [...balises, f.balise] : balises;
      const cle = `${cleObjet}|${[...new Set(b)].sort().join(",")}`;
      let x = parCle.get(cle);
      if (!x) {
        x = { nom, balises: [...new Set(b)].sort(), positions: [], triangles: [] };
        parCle.set(cle, x);
        ordre.push(x);
      }
      const p = positionsFace(c, f);
      const T = (q: Vec3): Vec3 => (M ? appliquer(M, q) : q);
      const exterieur = p.exterieur.map(T);
      const trous = p.trous.map((t) => t.map(T));
      const tri = triangulerFace(exterieur, trous, normalize(M ? transformerNormale(M, f.normale) : f.normale));
      const base = x.positions.length / 3;
      for (const q of [...exterieur, ...trous.flat()]) x.positions.push(q.x, q.y, q.z);
      for (const k of tri) x.triangles.push(base + k);
    }
  };
  ajouter("Géométrie libre", "racine", [], m.racine, null, 0);
  return ordre.filter((x) => x.triangles.length > 0);
}

const mm = (x: number): number => {
  const v = Math.round(x * 1000);
  return v === 0 ? 0 : v; // jamais « -0 » dans le texte
};

/**
 * Vrai dès qu'une face visible existe (racine ou objet non masqué, à toute profondeur) : test rapide, sans triangulation,
 * pour la disponibilité de l'export lue à chaque rendu.
 */
export function maquetteVisionneuseNonVide(m: Modele): boolean {
  const voir = (c: Contexte, profondeur: number): boolean => {
    if (profondeur > 32) return false;
    for (const f of Object.values(c.faces)) if (!f.masquee) return true;
    for (const o of Object.values(c.occurrences)) {
      const d = o.masquee ? undefined : m.definitions[o.definition];
      if (d && voir(d.contenu, profondeur + 1)) return true;
    }
    return false;
  };
  return voir(m.racine, 0);
}

const comptes = new WeakMap<Modele, number>();
/**
 * Nombre de triangles que la visionneuse portera (maquette visible, et objets des balises masquées sur option).
 * Mémorisé par identité du modèle : la disponibilité des commandes le lit à chaque rendu.
 */
export function trianglesVisionneuse(m: Modele): number {
  let n = comptes.get(m);
  if (n === undefined) {
    n = morceaux(m).reduce((t, x) => t + x.triangles.length / 3, 0);
    comptes.set(m, n);
  }
  return n;
}

/** Contenu du fichier, sans le HTML : ce que la visionneuse affiche. */
export function donneesVisionneuse(m: Modele, o: OptionsVisionneuse): DonneesVisionneuse {
  const an = m.annotations;
  const toutes = an?.balises ?? {};
  const balises: BaliseVisionneuse[] = [];
  const indice = new Map<string, number>();
  if (o.balises)
    for (const b of Object.values(toutes).sort((a, c) => (a.nom < c.nom ? -1 : a.nom > c.nom ? 1 : a.id < c.id ? -1 : 1))) {
      indice.set(b.id, balises.length);
      balises.push({ id: b.id, nom: b.nom, couleur: b.couleur, visible: b.visible });
    }
  const maillages: MaillageVisionneuse[] = [];
  for (const x of morceaux(m)) {
    const connues = x.balises.filter((id) => toutes[id]);
    // Sans les balises dans le fichier, ce qu'une balise du chemin masque ne part pas.
    if (!o.balises && connues.some((id) => !toutes[id]!.visible)) continue;
    maillages.push({ nom: x.nom, balises: o.balises ? connues.map((id) => indice.get(id)!) : [], positions: x.positions.map(mm), triangles: x.triangles });
  }
  const scenes = an?.scenes ?? {};
  const vues: VueVisionneuse[] = [];
  for (const id of o.scenes) {
    const s = scenes[id];
    if (!s) continue;
    vues.push({ nom: s.nom, position: [s.position.x, s.position.y, s.position.z], cible: [s.cible.x, s.cible.y, s.cible.z], champ: s.champDeVision, projection: s.projection });
  }
  return { nom: o.nom, version: versionVisionneuse(o.maintenant), empreinte: empreintePlanche(m), balises, maillages, vues };
}

/** Texte sûr dans le HTML. */
const echapper = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** JSON sûr dans une balise <script> : aucun « < » ni séparateur de ligne Unicode littéral. */
export const jsonDansScript = (v: unknown): string => JSON.stringify(v).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const STYLE = `*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden}body{font:14px/1.4 Roboto,"Segoe UI",system-ui,sans-serif;background:#dfe3e0;color:#1d2a25}
.tete{position:absolute;left:0;right:0;top:0;height:52px;background:#161616;color:#f4f4f4;display:flex;align-items:center;padding:0 18px;gap:12px;z-index:2}.tete b{font-size:16px}.tete .m{margin-left:auto;font-size:12.5px;color:#c6c6c6;text-align:right}
.ro{background:#f6c92f;color:#1d1d1d;font-weight:700;font-size:12px;border-radius:4px;padding:2px 8px}
canvas{position:absolute;left:0;top:52px;width:100%;height:calc(100% - 86px);touch-action:none;display:block}
.carte{position:absolute;background:#fff;border-radius:10px;box-shadow:0 1px 4px #0002;z-index:2}
.vues{left:16px;top:68px;width:220px;padding:10px 12px}.vues h4{margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#6a746f}.vues button{display:block;width:100%;text-align:left;border:0;background:none;font:inherit;padding:6px 8px;border-radius:6px;cursor:pointer;color:inherit}.vues button.on{background:#dbe8fb;font-weight:700}
.outils{left:50%;transform:translateX(-50%);top:64px;display:flex;gap:6px;padding:6px}.outils button{border:0;background:none;padding:6px 12px;border-radius:7px;font:600 13px Roboto,"Segoe UI",system-ui,sans-serif;cursor:pointer;color:inherit}.outils button.on{background:#1b4d42;color:#fff}
.liste{left:50%;transform:translateX(-50%);top:112px;padding:8px 12px;font-size:13px}.liste label{display:flex;gap:8px;align-items:center;padding:3px 0}.liste i{display:inline-block;width:10px;height:10px;border-radius:2px}
.mesure{position:absolute;background:#161616;color:#fff;border-radius:6px;padding:6px 10px;font-size:13px;z-index:2;pointer-events:none;white-space:nowrap}
.coupe{right:24px;top:116px;width:230px;padding:10px 12px;font-size:13px}.coupe div{margin:6px 0;color:#6a746f}.coupe input{width:100%}
.pied{position:absolute;left:0;right:0;bottom:0;height:34px;background:#fff;border-top:1px solid #c9cfca;display:flex;align-items:center;padding:0 16px;gap:16px;font-size:12.5px;color:#4d5a55;z-index:2;overflow:hidden;white-space:nowrap}.pied span:last-child{margin-left:auto}
.erreur{position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);background:#fff;padding:12px 16px;border-radius:10px;box-shadow:0 1px 4px #0002;z-index:3}
[hidden]{display:none!important}
@media (max-width:760px){.vues{top:auto;bottom:46px;width:auto;right:16px}.coupe{top:160px;right:16px;left:16px;width:auto}.tete .m{font-size:11px}}`;

/** Le fichier HTML autonome. */
export function ecrireVisionneuse(m: Modele, o: OptionsVisionneuse): ExportVisionneuse {
  const d = donneesVisionneuse(m, o);
  const triangles = d.maillages.reduce((n, x) => n + x.triangles.length / 3, 0);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">
<meta name="generator" content="Fadi — visionneuse hors ligne de la Planche">
<title>${echapper(d.nom)} — visionneuse</title>
<style>${STYLE}</style>
</head>
<body data-visionneuse-fadi="${echapper(d.empreinte)}">
<header class="tete"><b data-titre>${echapper(d.nom)}</b><span class="ro">Lecture seule</span><span class="m" data-version>Version du ${echapper(d.version)} · empreinte ${echapper(empreinteAbregee(d.empreinte))}</span></header>
<canvas data-scene aria-label="Maquette en 3D"></canvas>
<nav class="carte vues" data-vues${d.vues.length ? "" : " hidden"}><h4>Vues</h4></nav>
<div class="carte outils" role="toolbar" aria-label="Outils de la visionneuse"><button type="button" class="on" data-outil="orbite">Orbite</button><button type="button" data-outil="coupe">Plan de coupe</button><button type="button" data-outil="mesure">Mesure</button><button type="button" data-outil="balises"${d.balises.length ? "" : " hidden"}>Balises : affichées</button></div>
<div class="carte liste" data-liste-balises hidden></div>
<div class="mesure" data-mesure hidden></div>
<div class="carte coupe" data-coupe hidden><b>Plan de coupe</b><div data-coupe-altitude></div><input type="range" data-coupe-curseur aria-label="Altitude du plan de coupe"></div>
<footer class="pied"><span>Coordonnées locales, mètres</span><span>Fichier autonome : aucun réseau, aucun serveur</span><span>Produit par Fadi</span></footer>
<div class="erreur" data-erreur hidden></div>
<script type="application/json" id="donnees-visionneuse">${jsonDansScript(d)}</script>
<script>${SCRIPT_VISIONNEUSE}</script>
</body>
</html>
`;
  return { html, octets: new TextEncoder().encode(html).length, triangles, objets: d.maillages.length, vues: d.vues.length, empreinte: d.empreinte, version: d.version };
}
