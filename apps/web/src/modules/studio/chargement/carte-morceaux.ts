/**
 * Carte des morceaux du build et contrôle du découpage (B.3-06, B.3-07, AC-002).
 *
 * Écrite au build par `vite.config.ts` (`dist/chargement.json`) à partir du graphe réel produit par Rollup : pour chaque
 * fichier, ses imports statiques et dynamiques, sa taille et les **familles** lourdes qu'il contient (three.js, noyau
 * exact OCCT, Manifold, planche 2D, vue 3D, Atelier). Elle sert à trois choses :
 *
 * 1. **contrôle du découpage** (`verifierDecoupage`) : le bundle initial ne contient ni three.js, ni OCCT, ni Manifold,
 *    ni la planche, ni la vue 3D ; la coquille de Studio ne force pas la planche ni la 3D ; la planche ne force pas la
 *    3D ; aucun moteur de Studio n'embarque un noyau exact. Une violation fait échouer le build ;
 * 2. **classes du précache** du service worker (`classesPrecache`, EX-042) : coquille minimale, ressources du profil
 *    Studio, modules facultatifs ;
 * 3. **disponibilité hors connexion véridique** (EX-043) : les fichiers de chaque moteur, comparés au contenu réel du
 *    cache (`cache-hors-ligne.ts`).
 *
 * Pur : ni DOM, ni Node, ni React ; seulement les descripteurs de `moteurs.ts`.
 */
import { MOTEURS, type IdMoteur } from "./moteurs";

export type Famille = "three" | "occt" | "manifold" | "atelier" | "studio-planche" | "studio-3d";

/**
 * Modules de `planche2d/` partagés avec la coquille de Studio (B.3-02) : le catalogue léger des outils et le profil du
 * compte, que la coquille lit dès l'ouverture d'un projet (`DemarrageStudio` → `useProfilOutils`) pour que les barres
 * le trouvent prêt. Ils ne contiennent que des descripteurs textuels (registre, raccourcis, préférences) et le
 * gestionnaire « Outils », jamais l'éditeur, le rendu ni la géométrie de la planche. Tout autre module de
 * `planche2d/` appartient à la famille `studio-planche`.
 */
export const PLANCHE_PARTAGES_COQUILLE: readonly string[] = Object.freeze(["CatalogueOutils.tsx", "catalogue.ts", "raccourcis.ts", "profils.ts"]);

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Motifs des familles, sur l'identifiant de module de Rollup (chemin absolu, séparateurs `/`). */
export const MOTIFS_FAMILLES: Readonly<Record<Famille, RegExp>> = Object.freeze({
  three: /\/node_modules\/three\//,
  occt: /\/node_modules\/occt-wasm\//,
  manifold: /\/node_modules\/manifold-3d\//,
  atelier: /\/src\/modules\/atelier\/nouveau\//,
  "studio-planche": new RegExp(`/src/modules/studio/(VariantWorkspace\\.tsx|planche2d/(?!(${PLANCHE_PARTAGES_COQUILLE.map(echapper).join("|")})(\\?|$)))`),
  "studio-3d": /\/src\/modules\/studio\/vue3d\/Vue3DStudio\.tsx/,
});

/** Morceau de sortie tel que Rollup le décrit (sous-ensemble utile de `OutputChunk` / `OutputAsset`). */
export interface SortieBuild {
  readonly type: "chunk" | "asset";
  readonly fileName: string;
  readonly taille: number;
  readonly isEntry?: boolean;
  readonly facadeModuleId?: string | null;
  readonly moduleIds?: readonly string[];
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
  readonly css?: readonly string[];
  readonly nomsOriginaux?: readonly string[];
}

export interface MorceauCarte {
  readonly taille: number;
  readonly entree: boolean;
  readonly imports: readonly string[];
  readonly dynamiques: readonly string[];
  readonly css: readonly string[];
  readonly familles: readonly Famille[];
}

export interface MoteurCarte {
  /** Fichiers servis (`/assets/…`) nécessaires au moteur : son morceau, ses imports statiques et leurs styles. */
  readonly fichiers: readonly string[];
  /** Fichiers propres au moteur (hors bundle initial et hors moteurs dont il dépend déjà). */
  readonly propres: readonly string[];
  /** Taille non compressée de `propres` (octets) — information, pas un budget. */
  readonly taille: number;
}

export interface ClassesPrecache {
  /** (a) coquille minimale : document, bundle initial et ses styles. */
  readonly coquille: readonly string[];
  /** (b) ressources essentielles du profil Studio : coquille Studio, planche, carte. */
  readonly profil: readonly string[];
  /** (c) modules facultatifs : 3D, Workers, Atelier, autres écrans. */
  readonly facultatif: readonly string[];
}

export interface CarteChargement {
  readonly version: 1;
  readonly build: string;
  readonly entree: string;
  /** Fermeture statique du point d'entrée : ce que toute ouverture exécute. */
  readonly initial: readonly string[];
  readonly moteurs: Readonly<Record<IdMoteur, MoteurCarte>>;
  readonly morceaux: Readonly<Record<string, MorceauCarte>>;
  readonly verification: { readonly ok: boolean; readonly violations: readonly string[] };
}

const servi = (f: string) => (f.startsWith("/") ? f : `/${f}`);

export function famillesDe(moduleIds: readonly string[]): Famille[] {
  const ids = moduleIds.map((m) => m.replace(/\\/g, "/"));
  return (Object.keys(MOTIFS_FAMILLES) as Famille[]).filter((f) => ids.some((m) => MOTIFS_FAMILLES[f].test(m)));
}

/** Fichiers atteints depuis `depart` par imports statiques (morceaux JS), avec leurs styles importés. */
export function fermetureStatique(morceaux: Readonly<Record<string, MorceauCarte>>, depart: readonly string[]): string[] {
  const vus = new Set<string>();
  const pile = [...depart];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    const m = morceaux[f];
    if (!m) continue;
    for (const c of m.css) vus.add(c);
    pile.push(...m.imports);
  }
  return [...vus].sort();
}

const finit = (id: string | null | undefined, source: string) => !!id && id.replace(/\\/g, "/").endsWith(`/${source}`);

/** Fichier du build qui porte un moteur, ou null s'il est introuvable. */
function fichierDuMoteur(sorties: readonly SortieBuild[], source: string, nature: "module" | "worker"): string | null {
  if (nature === "module") {
    // Morceau dont le module est la façade, sinon celui qui contient le module (façade fusionnée par Rollup).
    const c = sorties.find((s) => s.type === "chunk" && finit(s.facadeModuleId, source))
      ?? sorties.find((s) => s.type === "chunk" && (s.moduleIds ?? []).some((id) => finit(id, source)));
    return c ? servi(c.fileName) : null;
  }
  // Worker : script émis comme fichier ; reconnu par son nom d'origine, sinon par le préfixe de son nom de fichier.
  const base = source.split("/").pop()!.replace(/\.[jt]sx?$/, "");
  const w = sorties.find((s) => s.type === "asset" && (s.nomsOriginaux?.some((n) => n.replace(/\\/g, "/").endsWith(source)) ?? false))
    ?? sorties.find((s) => s.type === "asset" && new RegExp(`(^|/)${base.replace(/\./g, "\\.")}-[\\w-]+\\.js$`).test(s.fileName));
  return w ? servi(w.fileName) : null;
}

/** Règles du découpage : familles interdites dans la fermeture statique de chaque point de chargement. */
export const REGLES_DECOUPAGE: readonly { readonly cible: "initial" | IdMoteur; readonly interdites: readonly Famille[]; readonly motif: string }[] = Object.freeze([
  { cible: "initial", interdites: ["three", "occt", "manifold", "studio-planche", "studio-3d", "atelier"], motif: "démarrage léger (EX-038) : aucun moteur lourd ni la planche dans le bundle initial" },
  { cible: "coquille-studio", interdites: ["three", "occt", "manifold", "studio-planche", "studio-3d", "atelier"], motif: "la coquille de Studio charge le catalogue et le profil, pas la planche ni la 3D (B.3-02)" },
  { cible: "planche-2d", interdites: ["three", "occt", "manifold", "studio-3d", "atelier"], motif: "ouvrir une planche 2D ne force ni three.js ni un noyau exact (EX-039)" },
  { cible: "rendu-3d", interdites: ["occt", "manifold", "atelier"], motif: "la vue 3D de Studio n'embarque aucun noyau exact (EX-040, D.3-04)" },
  { cible: "calcul", interdites: [], motif: "le script du groupe de Workers est repéré dans le build (disponibilité hors connexion)" },
]);

/** Contrôle du découpage d'une carte ; la liste vide signifie conforme. */
export function verifierDecoupage(carte: Pick<CarteChargement, "initial" | "moteurs" | "morceaux">): string[] {
  const violations: string[] = [];
  for (const r of REGLES_DECOUPAGE) {
    const fichiers = r.cible === "initial" ? carte.initial : carte.moteurs[r.cible]?.fichiers;
    if (!fichiers || fichiers.length === 0) { violations.push(`${r.cible} : morceau introuvable dans le build`); continue; }
    for (const f of fichiers) {
      const familles = carte.morceaux[f]?.familles ?? [];
      for (const fam of familles) if (r.interdites.includes(fam)) violations.push(`${r.cible} : ${f} contient « ${fam} » — ${r.motif}`);
    }
  }
  return violations;
}

/** Construit la carte d'un build à partir de ses sorties. */
export function construireCarte(sorties: readonly SortieBuild[], build: string): CarteChargement {
  const morceaux: Record<string, MorceauCarte> = {};
  for (const s of sorties) {
    morceaux[servi(s.fileName)] = {
      taille: s.taille, entree: s.isEntry === true,
      imports: (s.imports ?? []).map(servi), dynamiques: (s.dynamicImports ?? []).map(servi), css: (s.css ?? []).map(servi),
      familles: famillesDe(s.moduleIds ?? []),
    };
  }
  const entree = sorties.find((s) => s.type === "chunk" && s.isEntry);
  const initial = entree ? fermetureStatique(morceaux, [servi(entree.fileName)]) : [];
  const fichiers = {} as Record<IdMoteur, string[]>;
  for (const m of MOTEURS) {
    const f = fichierDuMoteur(sorties, m.source, m.nature);
    fichiers[m.id] = f ? fermetureStatique(morceaux, [f]) : [];
  }
  const moteurs = {} as Record<IdMoteur, MoteurCarte>;
  const dejaLa = (m: (typeof MOTEURS)[number]): Set<string> => new Set([...initial, ...m.dependances.flatMap((d) => fichiers[d])]);
  for (const m of MOTEURS) {
    const exclus = dejaLa(m);
    const propres = fichiers[m.id].filter((f) => !exclus.has(f));
    moteurs[m.id] = { fichiers: fichiers[m.id], propres, taille: propres.reduce((n, f) => n + (morceaux[f]?.taille ?? 0), 0) };
  }
  const partielle = { initial, moteurs, morceaux };
  const violations = verifierDecoupage(partielle);
  return { version: 1, build, entree: entree ? servi(entree.fileName) : "", ...partielle, verification: { ok: violations.length === 0, violations } };
}

/**
 * Répartit la liste du précache en classes (EX-042). `liste` : chemins servis retenus pour le précache ; un chemin
 * absent de la carte (Parcelle, document) va dans la coquille s'il s'agit du document, sinon en facultatif.
 */
export function classesPrecache(carte: CarteChargement, liste: readonly string[], document = "/index.html", fichierCarte = "/chargement.json"): ClassesPrecache {
  const coquille = new Set<string>([document, ...carte.initial]);
  const profil = new Set<string>([fichierCarte, ...carte.moteurs["coquille-studio"].fichiers, ...carte.moteurs["planche-2d"].fichiers]);
  const dans = (ensemble: Set<string>) => liste.filter((p) => ensemble.has(p));
  const c = dans(coquille);
  const p = dans(profil).filter((x) => !coquille.has(x));
  const pris = new Set([...c, ...p]);
  return { coquille: c, profil: p, facultatif: liste.filter((x) => !pris.has(x)) };
}
