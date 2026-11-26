/**
 * Avis et saisies demandés par une extension (protocole 1.0, lot 3, permission « messages »). Pur : la Planche affiche,
 * ce module juge la forme de ce qu'une extension demande et de ce que l'utilisateur répond.
 *
 *   message.afficher  { texte, genre? }          avis au-dessus de la barre d'état (« info » ou « alerte »)
 *   saisie.demander   { titre, champs: [...] }   fenêtre de saisie ; rend { <id> : valeur… }, ou `null` si annulée
 *
 * Quatre genres de champ : `texte`, `nombre` (bornes et unité facultatives), `choix` (liste fermée), `case`. L'extension
 * ne fournit que des textes et des valeurs : aucune mise en forme, aucune page. Forme stricte, refus motivé.
 */

export const BORNES_SAISIE = { texte: 240, titre: 60, libelle: 60, champs: 12, choix: 40, valeur: 200, unite: 12, avisParAppel: 5 } as const;

export type GenreAvis = "info" | "alerte";
export interface AvisExtension {
  readonly texte: string;
  readonly genre: GenreAvis;
}

interface ChampCommun {
  readonly id: string;
  readonly libelle: string;
}
export type ChampSaisie =
  | (ChampCommun & { readonly genre: "texte"; readonly valeur: string })
  | (ChampCommun & { readonly genre: "nombre"; readonly valeur: number; readonly min: number | null; readonly max: number | null; readonly unite: string | null })
  | (ChampCommun & { readonly genre: "choix"; readonly valeur: string; readonly choix: readonly { readonly valeur: string; readonly libelle: string }[] })
  | (ChampCommun & { readonly genre: "case"; readonly valeur: boolean });

export interface DemandeSaisie {
  readonly titre: string;
  readonly champs: readonly ChampSaisie[];
}
export type ValeursSaisie = Readonly<Record<string, string | number | boolean>>;

// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/;
const MOTIF_ID_CHAMP = /^[a-z][a-zA-Z0-9_-]{0,39}$/;
const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const estTexte = (v: unknown, max: number, vide = false): v is string => typeof v === "string" && v.length <= max && (vide || v.trim().length > 0) && !CONTROLE.test(v);
const estNombre = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Relit un avis demandé par une extension ; `null` = forme refusée. */
export function lireAvisExtension(d: unknown): AvisExtension | null {
  if (!estObjet(d) || Object.keys(d).some((k) => k !== "texte" && k !== "genre")) return null;
  const genre = d["genre"] ?? "info";
  if (!estTexte(d["texte"], BORNES_SAISIE.texte) || (genre !== "info" && genre !== "alerte")) return null;
  return { texte: d["texte"].trim(), genre };
}

export type LectureSaisie = { readonly ok: true; readonly demande: DemandeSaisie } | { readonly ok: false; readonly detail: string };

function lireChamp(v: unknown): ChampSaisie | string {
  if (!estObjet(v)) return "champ : objet attendu";
  const id = v["id"];
  if (typeof id !== "string" || !MOTIF_ID_CHAMP.test(id)) return "champ : identifiant mal formé";
  const admis = (cles: readonly string[]): string | null => Object.keys(v).find((k) => !["id", "libelle", "genre", "valeur", ...cles].includes(k)) ?? null;
  if (!estTexte(v["libelle"], BORNES_SAISIE.libelle)) return `champ « ${id} » : libellé de 1 à ${BORNES_SAISIE.libelle} caractères attendu`;
  const commun = { id, libelle: v["libelle"].trim() };
  const inconnu = (cles: readonly string[]) => {
    const k = admis(cles);
    return k ? `champ « ${id} » : « ${k} » inconnu` : null;
  };
  switch (v["genre"]) {
    case "texte": {
      const valeur = v["valeur"] ?? "";
      return inconnu([]) ?? (estTexte(valeur, BORNES_SAISIE.valeur, true) ? { ...commun, genre: "texte", valeur } : `champ « ${id} » : valeur de ${BORNES_SAISIE.valeur} caractères au plus`);
    }
    case "nombre": {
      const min = v["min"] ?? null;
      const max = v["max"] ?? null;
      const unite = v["unite"] ?? null;
      const valeur = v["valeur"] ?? 0;
      if (!estNombre(valeur) || (min !== null && !estNombre(min)) || (max !== null && !estNombre(max))) return `champ « ${id} » : nombres attendus`;
      if (min !== null && max !== null && min > max) return `champ « ${id} » : min supérieur à max`;
      if (unite !== null && !estTexte(unite, BORNES_SAISIE.unite)) return `champ « ${id} » : unité de ${BORNES_SAISIE.unite} caractères au plus`;
      return inconnu(["min", "max", "unite"]) ?? { ...commun, genre: "nombre", valeur, min, max, unite: unite === null ? null : unite.trim() };
    }
    case "choix": {
      const brut = v["choix"];
      if (!Array.isArray(brut) || brut.length === 0 || brut.length > BORNES_SAISIE.choix) return `champ « ${id} » : de 1 à ${BORNES_SAISIE.choix} choix attendus`;
      const choix: { valeur: string; libelle: string }[] = [];
      for (const c of brut) {
        if (!estObjet(c) || Object.keys(c).some((k) => k !== "valeur" && k !== "libelle") || !estTexte(c["valeur"], BORNES_SAISIE.valeur) || !estTexte(c["libelle"], BORNES_SAISIE.libelle)) return `champ « ${id} » : choix { valeur, libelle } attendu`;
        if (choix.some((x) => x.valeur === c["valeur"])) return `champ « ${id} » : choix « ${c["valeur"]} » donné deux fois`;
        choix.push({ valeur: c["valeur"], libelle: c["libelle"].trim() });
      }
      const valeur = v["valeur"] ?? choix[0]!.valeur;
      if (typeof valeur !== "string" || !choix.some((x) => x.valeur === valeur)) return `champ « ${id} » : la valeur doit être l'un des choix`;
      return inconnu(["choix"]) ?? { ...commun, genre: "choix", valeur, choix };
    }
    case "case": {
      const valeur = v["valeur"] ?? false;
      return inconnu([]) ?? (typeof valeur === "boolean" ? { ...commun, genre: "case", valeur } : `champ « ${id} » : vrai ou faux attendu`);
    }
    default:
      return `champ « ${id} » : genre texte, nombre, choix ou case attendu`;
  }
}

/** Relit une demande de saisie d'une extension. */
export function lireDemandeSaisie(d: unknown): LectureSaisie {
  if (!estObjet(d) || Object.keys(d).some((k) => k !== "titre" && k !== "champs")) return { ok: false, detail: "saisie : { titre, champs } attendu" };
  if (!estTexte(d["titre"], BORNES_SAISIE.titre)) return { ok: false, detail: `saisie : titre de 1 à ${BORNES_SAISIE.titre} caractères attendu` };
  const brut = d["champs"];
  if (!Array.isArray(brut) || brut.length === 0 || brut.length > BORNES_SAISIE.champs) return { ok: false, detail: `saisie : de 1 à ${BORNES_SAISIE.champs} champs attendus` };
  const champs: ChampSaisie[] = [];
  for (const c of brut) {
    const lu = lireChamp(c);
    if (typeof lu === "string") return { ok: false, detail: lu };
    if (champs.some((x) => x.id === lu.id)) return { ok: false, detail: `champ « ${lu.id} » déclaré deux fois` };
    champs.push(lu);
  }
  return { ok: true, demande: { titre: d["titre"].trim(), champs } };
}

/** Valeurs de départ d'une demande, telles que la fenêtre les montre à l'ouverture. */
export const valeursInitiales = (demande: DemandeSaisie): ValeursSaisie => Object.fromEntries(demande.champs.map((c) => [c.id, c.valeur] as const));

/** Lit un nombre saisi (virgule ou point décimal) ; `null` = illisible. */
export function lireNombreSaisi(texte: string): number | null {
  const t = texte.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ValidationSaisie = { readonly ok: true; readonly valeurs: ValeursSaisie } | { readonly ok: false; readonly champ: string; readonly motif: "nombre" | "min" | "max" | "choix" | "longueur" };

/**
 * Valide ce que l'utilisateur a saisi (un texte pour un champ `nombre`) avant de le rendre à l'extension : celle-ci
 * reçoit des valeurs du genre déclaré, dans les bornes déclarées.
 */
export function validerSaisie(demande: DemandeSaisie, saisi: Readonly<Record<string, unknown>>): ValidationSaisie {
  const valeurs: Record<string, string | number | boolean> = {};
  for (const c of demande.champs) {
    const v = saisi[c.id];
    if (c.genre === "texte") {
      if (typeof v !== "string" || v.length > BORNES_SAISIE.valeur || CONTROLE.test(v)) return { ok: false, champ: c.id, motif: "longueur" };
      valeurs[c.id] = v;
    } else if (c.genre === "nombre") {
      const n = typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" ? lireNombreSaisi(v) : null;
      if (n === null) return { ok: false, champ: c.id, motif: "nombre" };
      if (c.min !== null && n < c.min) return { ok: false, champ: c.id, motif: "min" };
      if (c.max !== null && n > c.max) return { ok: false, champ: c.id, motif: "max" };
      valeurs[c.id] = n;
    } else if (c.genre === "choix") {
      if (typeof v !== "string" || !c.choix.some((x) => x.valeur === v)) return { ok: false, champ: c.id, motif: "choix" };
      valeurs[c.id] = v;
    } else valeurs[c.id] = v === true;
  }
  return { ok: true, valeurs };
}
