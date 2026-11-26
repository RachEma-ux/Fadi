/**
 * Administration des extensions ajoutées à la plateforme (images 12 à 15, validées le 26 novembre 2026) : ce que le
 * serveur et le navigateur jugent de la même façon, en plus des règles d'import (`extensions-installees.ts`).
 *
 *  - le **réglage** d'une extension ajoutée : son état (`disponible` ou `experimentale` ; pour la retirer, on la retire)
 *    et « installée d'origine » (suivi par tout compte qui n'a rien choisi) ;
 *  - le **choix d'un compte** : `{ <identifiant>: booléen }`, rangé à part du choix des extensions fournies par Fadi ;
 *  - l'**éditeur** : un brouillon vide, et les contrôles montrés avant d'enregistrer.
 *
 * Pur : ni React, ni DOM, ni base.
 */
import { MOTIF_ID_EXTENSION } from "./extensions-sandbox.js";
import { estDessinSvg, jugerImportPaquet, nomAppelCommande } from "./extensions-installees.js";
import { FORMAT_PAQUET_EXTENSION, PERMISSIONS_EXTENSION, VERSION_PROTOCOLE, type PaquetExtension, type TexteBilingue } from "./protocole-extensions.js";

export const ETATS_PAQUET = ["disponible", "experimentale"] as const;
export type EtatPaquet = (typeof ETATS_PAQUET)[number];
export const ORIGINES_PAQUET = ["importee", "creee"] as const;
export type OriginePaquet = (typeof ORIGINES_PAQUET)[number];

export interface ReglagePaquet {
  readonly etat: EtatPaquet;
  readonly activeParDefaut: boolean;
}

export const estEtatPaquet = (v: unknown): v is EtatPaquet => typeof v === "string" && (ETATS_PAQUET as readonly string[]).includes(v);
export const estOriginePaquet = (v: unknown): v is OriginePaquet => typeof v === "string" && (ORIGINES_PAQUET as readonly string[]).includes(v);

export type ResultatReglagePaquet = { readonly ok: true; readonly reglage: Partial<ReglagePaquet> } | { readonly ok: false; readonly detail: string };

/** Valide un changement de réglage d'une extension ajoutée : `etat` et / ou `activeParDefaut`, rien d'autre. */
export function validerChangementReglagePaquet(corps: unknown): ResultatReglagePaquet {
  if (!corps || typeof corps !== "object" || Array.isArray(corps)) return { ok: false, detail: "objet attendu" };
  const c = corps as Record<string, unknown>;
  const inconnus = Object.keys(c).filter((k) => k !== "etat" && k !== "activeParDefaut");
  if (inconnus.length > 0) return { ok: false, detail: `champ inconnu : ${inconnus.join(", ")}` };
  if (c["etat"] === undefined && c["activeParDefaut"] === undefined) return { ok: false, detail: "etat ou activeParDefaut attendu" };
  if (c["etat"] !== undefined && !estEtatPaquet(c["etat"])) return { ok: false, detail: `etat : ${ETATS_PAQUET.join(", ")}` };
  if (c["activeParDefaut"] !== undefined && typeof c["activeParDefaut"] !== "boolean") return { ok: false, detail: "activeParDefaut : booléen" };
  return { ok: true, reglage: { ...(c["etat"] !== undefined ? { etat: c["etat"] as EtatPaquet } : {}), ...(c["activeParDefaut"] !== undefined ? { activeParDefaut: c["activeParDefaut"] as boolean } : {}) } };
}

/** Choix d'un compte parmi les extensions ajoutées : ses écarts au réglage d'origine. */
export type ChoixPaquets = Readonly<Record<string, boolean>>;
/** Un compte ne garde pas plus de choix que cela (les identifiants d'extensions retirées s'effacent à l'écriture). */
export const CHOIX_PAQUETS_MAX = 200;

/** Relecture tolérante d'un choix rangé : identifiants bien formés et valeurs booléennes seulement. */
export function lireChoixPaquets(v: unknown): ChoixPaquets {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const lu: Record<string, boolean> = {};
  for (const [id, valeur] of Object.entries(v as Record<string, unknown>).slice(0, CHOIX_PAQUETS_MAX)) if (MOTIF_ID_EXTENSION.test(id) && typeof valeur === "boolean") lu[id] = valeur;
  return lu;
}

/** L'extension ajoutée est-elle installée pour ce compte ? Son choix, sinon le réglage d'origine. */
export const paquetInstalle = (id: string, choix: ChoixPaquets, activeParDefaut: boolean): boolean => choix[id] ?? activeParDefaut;

/** Choix après un geste du compte, borné aux extensions encore présentes sur la plateforme. */
export function basculerPaquet(choix: ChoixPaquets, id: string, installee: boolean, presentes: readonly string[]): ChoixPaquets {
  const garde = Object.fromEntries(Object.entries(choix).filter(([k]) => presentes.includes(k)));
  return presentes.includes(id) ? { ...garde, [id]: installee } : garde;
}

/** Une extension ajoutée telle qu'un compte la voit dans la page « Extensions » : sa fiche, sans code. */
export interface FichePaquetCompte {
  readonly id: string;
  readonly nom: TexteBilingue;
  readonly description: TexteBilingue;
  readonly version: string;
  readonly etat: EtatPaquet;
  readonly commandes: number;
  readonly outils: number;
  readonly panneaux: number;
  readonly installee: boolean;
}

const estBilingue = (v: unknown): v is TexteBilingue => !!v && typeof v === "object" && typeof (v as TexteBilingue).fr === "string" && typeof (v as TexteBilingue).en === "string";
const estCompte = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/** Relecture, dans le navigateur, des fiches reçues : une fiche mal formée est écartée. */
export function lireFichesPaquetsCompte(v: unknown): readonly FichePaquetCompte[] {
  if (!Array.isArray(v)) return [];
  const lues: FichePaquetCompte[] = [];
  for (const brut of v) {
    if (!brut || typeof brut !== "object") continue;
    const f = brut as Record<string, unknown>;
    if (typeof f["id"] !== "string" || !MOTIF_ID_EXTENSION.test(f["id"]) || !estBilingue(f["nom"]) || !estBilingue(f["description"]) || typeof f["version"] !== "string") continue;
    if (!estEtatPaquet(f["etat"]) || !estCompte(f["commandes"]) || !estCompte(f["outils"]) || !estCompte(f["panneaux"]) || typeof f["installee"] !== "boolean") continue;
    lues.push({ id: f["id"], nom: { fr: f["nom"].fr, en: f["nom"].en }, description: { fr: f["description"].fr, en: f["description"].en }, version: f["version"], etat: f["etat"], commandes: f["commandes"], outils: f["outils"], panneaux: f["panneaux"], installee: f["installee"] });
  }
  return lues;
}

// ————————————————————————————————————————————————————————————— Éditeur

/** Brouillon d'une extension neuve : la forme d'un paquet, tout à remplir. */
export function paquetVide(): PaquetExtension {
  return {
    format: FORMAT_PAQUET_EXTENSION,
    fiche: { id: "", nom: { fr: "", en: "" }, description: { fr: "", en: "" }, version: "0.1.0", auteur: "", protocole: VERSION_PROTOCOLE, permissions: [], commandes: [], outils: [], panneaux: [], abonnements: [] },
    code: "",
    pages: {},
  };
}

/** Nom du fichier d'export d'une extension. */
export const nomFichierPaquet = (id: string): string => `${id || "extension"}.fadi-addon.json`;

export type GenreControle = "fiche" | "commandes" | "raccourcis" | "code" | "reponse" | "paquet";
/** Un contrôle montré avant d'enregistrer : réussi ou non, avec le détail d'un refus. */
export interface ControlePaquet {
  readonly genre: GenreControle;
  readonly ok: boolean;
  /** Refus : ce qui manque. Réussite du contrôle « commandes » : leur nombre. */
  readonly detail: string;
  /** Contrôle « reponse » : la commande visée. */
  readonly commande?: string;
}

const rempli = (t: TexteBilingue | undefined): boolean => !!t && t.fr.trim().length > 0 && t.en.trim().length > 0;

/** Le code répond-il à la demande `commande.<id>` ? (Lecture du texte : le code n'est jamais exécuté ici.) */
export function codeRepondA(code: string, commande: string): boolean {
  const nom = nomAppelCommande(commande).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`planche\\s*\\.\\s*sur\\s*\\(\\s*(["'\`])${nom}\\1`).test(code);
}

/**
 * Contrôles de l'éditeur, dans l'ordre de l'image 15. `erreurCode` vient du navigateur (lecture du code sans
 * l'exécuter) : `null` si le code se lit. Le dernier mot reste au serveur, qui rejuge le paquet à l'enregistrement.
 */
export function controlesPaquet(brouillon: PaquetExtension, autres: readonly PaquetExtension[], erreurCode: string | null): readonly ControlePaquet[] {
  const f = brouillon.fiche;
  const controles: ControlePaquet[] = [];
  const manque = !MOTIF_ID_EXTENSION.test(f.id) ? "identifiant" : !rempli(f.nom) ? "nom" : !rempli(f.description) ? "description" : f.auteur.trim().length === 0 ? "auteur" : f.version.trim().length === 0 ? "version" : "";
  controles.push({ genre: "fiche", ok: manque === "", detail: manque });
  const entrees = [...f.commandes, ...f.outils];
  const sansIcone = entrees.find((e) => !estDessinSvg(brouillon.pages[e.icone] ?? "") || e.raccourci.trim().length === 0 || !rempli(e.libelle));
  // Une extension faite seulement d'outils ou de panneaux est valable : l'import l'accepte, l'éditeur aussi.
  const contributions = entrees.length + f.panneaux.length;
  controles.push({ genre: "commandes", ok: contributions > 0 && !sansIcone, detail: sansIcone ? sansIcone.id : String(entrees.length) });
  const jugement = jugerImportPaquet(brouillon, autres);
  const raccourci = !jugement.ok && jugement.erreur === "raccourci_refuse";
  controles.push({ genre: "raccourcis", ok: !raccourci, detail: raccourci ? jugement.detail : "" });
  controles.push({ genre: "code", ok: erreurCode === null && brouillon.code.trim().length > 0, detail: erreurCode ?? "" });
  for (const c of f.commandes) if (!codeRepondA(brouillon.code, c.id)) controles.push({ genre: "reponse", ok: false, detail: nomAppelCommande(c.id), commande: c.id });
  // Tout autre refus des règles d'import, que les contrôles ci-dessus ne nomment pas déjà.
  if (!jugement.ok && !raccourci && controles.every((c) => c.ok)) controles.push({ genre: "paquet", ok: false, detail: jugement.detail });
  return controles;
}

export const controlesReussis = (controles: readonly ControlePaquet[]): boolean => controles.every((c) => c.ok);

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texteDe = (v: unknown): string => (typeof v === "string" ? v : "");
const bilingueDe = (v: unknown): TexteBilingue => ({ fr: texteDe((v as TexteBilingue | null)?.fr), en: texteDe((v as TexteBilingue | null)?.en) });

/**
 * Brouillon tiré d'un fichier que l'import a refusé, pour le corriger dans l'éditeur : ce qui a la bonne forme est
 * repris, le reste est laissé vide ; outils, panneaux, abonnements et pages sont gardés tels quels quand ils sont
 * lisibles. `null` si la valeur n'a pas la forme d'un paquet (ni fiche, ni code). Rien n'est jugé ici.
 */
export function lireBrouillonPaquet(v: unknown): PaquetExtension | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const p = v as Record<string, unknown>;
  const f = p["fiche"];
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const fiche = f as Record<string, unknown>;
  const vide = paquetVide();
  const tableau = <T,>(x: unknown): readonly T[] => (Array.isArray(x) ? (x as T[]) : []);
  const entree = (e: unknown): PaquetExtension["fiche"]["commandes"][number] => {
    const o = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
    return { id: texteDe(o["id"]), libelle: bilingueDe(o["libelle"]), icone: texteDe(o["icone"]), raccourci: texteDe(o["raccourci"]) };
  };
  const pages: Record<string, string> = {};
  if (p["pages"] && typeof p["pages"] === "object" && !Array.isArray(p["pages"])) for (const [nom, contenu] of Object.entries(p["pages"] as Record<string, unknown>)) if (typeof contenu === "string") pages[nom] = contenu;
  return {
    format: FORMAT_PAQUET_EXTENSION,
    fiche: {
      id: texteDe(fiche["id"]),
      nom: bilingueDe(fiche["nom"]),
      description: bilingueDe(fiche["description"]),
      version: texteDe(fiche["version"]) || vide.fiche.version,
      auteur: texteDe(fiche["auteur"]),
      protocole: texteDe(fiche["protocole"]) || VERSION_PROTOCOLE,
      permissions: tableau<string>(fiche["permissions"]).filter((x): x is PaquetExtension["fiche"]["permissions"][number] => (PERMISSIONS_EXTENSION as readonly string[]).includes(x)),
      commandes: tableau<unknown>(fiche["commandes"]).map(entree),
      // Une entrée abîmée (nulle, d'un autre type) n'atteint jamais l'éditeur : un outil est remis en forme, un panneau
      // ou un abonnement illisible est écarté.
      outils: tableau<unknown>(fiche["outils"]).filter(estObjet).map((e) => ({ ...entree(e), ...(typeof e["curseur"] === "string" ? { curseur: e["curseur"] } : {}) }) as PaquetExtension["fiche"]["outils"][number]),
      panneaux: tableau<unknown>(fiche["panneaux"]).filter(estObjet) as unknown as PaquetExtension["fiche"]["panneaux"],
      abonnements: tableau<unknown>(fiche["abonnements"]).filter((x) => typeof x === "string") as unknown as PaquetExtension["fiche"]["abonnements"],
    },
    code: texteDe(p["code"]),
    pages,
  };
}
