/**
 * EX-097 — mesure reproductible. « Fixer matériel, navigateur/version, mémoire, GPU/driver, taille d'écran, statut des
 * caches, réseau, build, commit, répétitions, opérations, outliers et méthode statistique ; conserver traces et scripts.
 * Les mesures JavaScript renderer.render() ne sont pas assimilées automatiquement au coût GPU, et SwiftShader ne
 * remplace pas un GPU physique. »
 *
 * Pur : qualifie l'environnement relevé par une recette (champ manquant → protocole incomplet, aucun verdict) et juge
 * chaque conclusion qu'un rapport voudrait tirer. Une conclusion sur le GPU est **refusée** sous rendu logiciel
 * (SwiftShader, llvmpipe…), sans moteur WebGL relevé, ou quand elle s'appuie sur la durée JavaScript de
 * `renderer.render()` (temps CPU de soumission) au lieu d'un minuteur GPU.
 */

export const STUDIO_PROTOCOLE_MESURE_SCHEMA = "studio-protocole-mesure/1" as const;

/** Champs exigés par EX-097, dans l'ordre du texte. */
export const STUDIO_CHAMPS_PROTOCOLE = Object.freeze([
  "materiel", "navigateur", "memoire", "gpu", "ecran", "caches", "reseau", "build", "commit", "repetitions", "operations", "aberrants", "methode", "traces",
] as const);
export type StudioChampProtocole = (typeof STUDIO_CHAMPS_PROTOCOLE)[number];

export interface StudioEnvironnementMesure {
  materiel: { plateforme: string; processeur: string; coeurs: number } | null;
  navigateur: { nom: string; version: string; userAgent?: string } | null;
  /** Mémoire de la machine (octets) et celle annoncée par le navigateur (`navigator.deviceMemory`, Go) si lue. */
  memoire: { machineOctets: number | null; navigateurGo: number | null } | null;
  /** Fournisseur et moteur WebGL non masqués (`WEBGL_debug_renderer_info`) : c'est le « GPU/driver » relevé. */
  gpu: { fournisseur: string | null; moteur: string | null } | null;
  ecran: { largeur: number; hauteur: number; densite: number } | null;
  caches: readonly ("froid" | "chaud")[] | null;
  /** Réseau de la mesure : mode (p. ex. boucle locale) et limitation appliquée (« aucune » est une valeur). */
  reseau: { mode: string; limitation: string } | null;
  build: string | null;
  commit: string | null;
  repetitions: number | null;
  operations: readonly string[] | null;
  /** Règle des valeurs aberrantes appliquée. */
  aberrants: string | null;
  methode: string | null;
  /** Traces et script conservés (chemins relatifs au rapport). */
  traces: readonly string[] | null;
}

/** Moteur WebGL de rendu logiciel (ou absent) : aucun GPU physique n'est mesuré. */
export function studioRenduLogiciel(moteur: string | null | undefined): boolean {
  return !moteur || /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(moteur);
}

export interface StudioQualificationEnvironnement {
  complet: boolean;
  manquants: StudioChampProtocole[];
  renduLogiciel: boolean;
  /** Classe d'appareil comparable entre deux mesures. */
  classe: "chromium-logiciel" | "appareil-gpu";
  etiquette: string;
  /** Profil GPU : « non évalué » sous rendu logiciel, jamais déduit. */
  gpu: "non évalué" | "mesurable";
}

const vide = (v: unknown): boolean =>
  v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0)
  || (typeof v === "number" && !Number.isFinite(v));

/** Qualifie l'environnement d'une mesure (EX-097) : champs manquants, rendu logiciel, étiquette à porter par le rapport. */
export function studioQualifierEnvironnement(env: Partial<StudioEnvironnementMesure> | null | undefined): StudioQualificationEnvironnement {
  const e = env ?? {};
  const manquants = STUDIO_CHAMPS_PROTOCOLE.filter((c) => {
    const v = (e as Record<string, unknown>)[c];
    if (vide(v)) return true;
    if (c === "gpu") return vide((v as { moteur?: unknown }).moteur) && vide((v as { fournisseur?: unknown }).fournisseur);
    if (c === "repetitions") return !(typeof v === "number" && v >= 1);
    return false;
  });
  const moteur = e.gpu?.moteur ?? null;
  const renduLogiciel = studioRenduLogiciel(moteur);
  const nav = e.navigateur ? `${e.navigateur.nom} ${e.navigateur.version}` : "navigateur non relevé";
  return {
    complet: manquants.length === 0,
    manquants,
    renduLogiciel,
    classe: renduLogiciel ? "chromium-logiciel" : "appareil-gpu",
    etiquette: renduLogiciel
      ? `${nav} — rendu logiciel (${moteur ?? "WebGL indisponible"}), pas un appareil réel : GPU non évalué`
      : `${nav} — moteur WebGL « ${moteur} »`,
    gpu: renduLogiciel ? "non évalué" : "mesurable",
  };
}

/** Source d'une valeur mesurée (ce que la conclusion invoque). */
export type StudioSourceMesure = "renderer.render" | "minuteur-gpu" | "cdp" | "event-timing" | "largest-contentful-paint" | "layout-shift" | "performance.now" | "modele";

export interface StudioConclusionMesure {
  /** Ce sur quoi porte la conclusion. */
  sujet: "gpu" | "cpu" | "chargement" | "interface" | "memoire" | "geometrie";
  source: StudioSourceMesure;
  enonce: string;
}

export type StudioMotifRefusConclusion = "protocole-incomplet" | "gpu-sous-rendu-logiciel" | "render-cpu-presente-comme-gpu" | "gpu-sans-minuteur-gpu";

export interface StudioJugementConclusion { admise: boolean; refus: { motif: StudioMotifRefusConclusion; detail: string }[] }

/**
 * Juge une conclusion d'après l'environnement : protocole complet exigé ; sur le GPU, il faut un appareil à GPU
 * physique **et** un minuteur GPU — la durée de `renderer.render()` n'est jamais un coût GPU, SwiftShader jamais un GPU.
 */
export function studioJugerConclusion(env: Partial<StudioEnvironnementMesure> | null | undefined, c: StudioConclusionMesure): StudioJugementConclusion {
  const q = studioQualifierEnvironnement(env);
  const refus: StudioJugementConclusion["refus"] = [];
  if (!q.complet) refus.push({ motif: "protocole-incomplet", detail: `champs EX-097 manquants : ${q.manquants.join(", ")}` });
  if (c.sujet === "gpu") {
    if (q.renduLogiciel) refus.push({ motif: "gpu-sous-rendu-logiciel", detail: `${q.etiquette} : « ${c.enonce} » refusé` });
    if (c.source === "renderer.render") refus.push({ motif: "render-cpu-presente-comme-gpu", detail: "durée JavaScript de renderer.render() : temps CPU de soumission, pas un coût GPU" });
    else if (c.source !== "minuteur-gpu") refus.push({ motif: "gpu-sans-minuteur-gpu", detail: `source « ${c.source} » : aucun minuteur GPU` });
  }
  return { admise: refus.length === 0, refus };
}
