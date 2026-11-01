import { guidStable, lireZip, zipStocke, type FichierArchive } from "../../echanges/bcf.js";

/**
 * Échange BCF 2.1 minimal des observations Studio (IF-010, E.6-04 ; lot PUB). Pur : ni React, ni DOM, ni stockage.
 *
 * Contrat (décision du lot PUB, consignée) :
 * - **Export** (`studioExporterBcf`) : un `.bcfzip` BCF 2.1 — `bcf.version` (VersionId 2.1), `project.bcfp` (projet
 *   nommé), puis un dossier par sujet avec son `markup.bcf` : `Topic` (Guid, TopicType = catégorie, TopicStatus = statut,
 *   Title, Priority = gravité, CreationDate, CreationAuthor, AssignedTo, Description), une `Label` par objet cité et les
 *   commentaires (journal des passages). Le Guid d'un sujet est dérivé de l'identité interne (`issueId`) de façon
 *   stable : même observation, même Guid d'un export à l'autre ; il n'est pas l'identité interne. Aucun point de vue
 *   (caméra) n'est écrit ; les pièces justificatives ne sont pas jointes (déclaré dans `limites`).
 * - **Import** (`studioLireBcf` puis `studioPlanImportBcf`) : chaque sujet lu porte son Guid **dans son contexte**
 *   (identifiant du projet BCF déclaré, sinon empreinte du fichier). Un Guid déjà importé dans le **même** contexte est
 *   reconnu (aucune nouvelle observation, aucune réécriture) ; le même Guid reçu dans un **autre** contexte crée une
 *   observation distincte, avec sa propre identité interne : un identifiant BCF n'est jamais assimilé à l'identité
 *   interne, ni ne l'écrase. Un sujet absent d'un nouvel envoi ne clôt rien (`absents`, rapportés sans effet) ; un objet
 *   cité absent du modèle reste une référence (`objetsInconnus`), jamais une clôture.
 */

export const STUDIO_BCF_VERSION = "2.1" as const;
export const STUDIO_BCF_LIMITES = Object.freeze({ sujets: 500, titre: 200, description: 4000, commentaires: 200 });
export const STUDIO_BCF_LIMITES_EXPORT: readonly string[] = Object.freeze([
  "Aucun point de vue (caméra, composants visibles) n'est écrit : les observations Studio n'en portent pas.",
  "Les pièces justificatives ne sont pas jointes au fichier BCF ; elles restent dans Studio.",
  "Le Guid d'un sujet dérive de l'identité interne de l'observation ; il n'est pas l'identité interne.",
]);

export interface StudioSujetBcf {
  guid: string;
  titre: string;
  description: string;
  /** TopicStatus. */
  statut: string;
  /** TopicType (catégorie). */
  type: string | null;
  /** Priority (gravité). */
  priorite: string | null;
  creeLe: string;
  auteur: string;
  assigneA: string | null;
  /** Objets cités (Labels). */
  objets: string[];
  commentaires: { guid: string; date: string; auteur: string; texte: string }[];
}

export interface StudioObservationPourBcf {
  issueId: string;
  titre: string;
  description: string;
  statut: string;
  categorie: string | null;
  gravite: string | null;
  creeLe: string;
  auteur: string;
  responsable: string | null;
  objets: readonly string[];
  journal: readonly { seq: number; action: string; at: string; acteur: string; note: string | null }[];
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const desechapper = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
const bloc = (xml: string, balise: string): string | null => new RegExp(`<${balise}(?:\\s[^>]*)?>([\\s\\S]*?)</${balise}>`).exec(xml)?.[1] ?? null;
const texte = (xml: string, balise: string): string | null => { const b = bloc(xml, balise); return b === null ? null : desechapper(b.trim()); };
const attribut = (xml: string, balise: string, nom: string): string | null => { const m = new RegExp(`<${balise}\\s[^>]*${nom}="([^"]*)"`).exec(xml); return m ? desechapper(m[1]!) : null; };
const elem = (balise: string, v: string | null | undefined) => (v === null || v === undefined || v === "" ? "" : `<${balise}>${echapper(v)}</${balise}>`);

/** Guid BCF stable d'une observation (dérivé de son identité interne, distinct d'elle). */
export const studioGuidBcf = (issueId: string): string => guidStable(`fadi-studio-observation|${issueId}`);

/** Sujets BCF d'observations Studio. */
export function studioSujetsBcf(observations: readonly StudioObservationPourBcf[]): StudioSujetBcf[] {
  return observations.map((o) => ({
    guid: studioGuidBcf(o.issueId), titre: o.titre.slice(0, STUDIO_BCF_LIMITES.titre), description: o.description, statut: o.statut, type: o.categorie, priorite: o.gravite,
    creeLe: o.creeLe, auteur: o.auteur, assigneA: o.responsable, objets: [...o.objets],
    commentaires: o.journal.filter((e) => e.note || e.action !== "ouvrir").map((e) => ({
      guid: guidStable(`fadi-studio-observation|${o.issueId}|${e.seq}`), date: e.at, auteur: e.acteur, texte: `${e.action}${e.note ? ` : ${e.note}` : ""}`,
    })),
  }));
}

/** Fichiers `.bcfzip` (BCF 2.1, sans compression) des sujets donnés. */
export function studioExporterBcf(sujets: readonly StudioSujetBcf[], projet: { id: string; nom: string }): Uint8Array {
  const fichiers: FichierArchive[] = [];
  const ajouter = (nom: string, xml: string) => fichiers.push({ nom, octets: enc.encode(`<?xml version="1.0" encoding="UTF-8"?>\n${xml}`) });
  ajouter("bcf.version", `<Version VersionId="${STUDIO_BCF_VERSION}"><DetailedVersion>${STUDIO_BCF_VERSION}</DetailedVersion></Version>`);
  ajouter("project.bcfp", `<ProjectExtension><Project ProjectId="${guidStable(`fadi-studio-projet|${projet.id}`)}"><Name>${echapper(projet.nom)}</Name></Project><ExtensionSchema></ExtensionSchema></ProjectExtension>`);
  for (const s of sujets) {
    const labels = s.objets.map((o) => `<Labels>${echapper(o)}</Labels>`).join("");
    const commentaires = s.commentaires.map((c) => `<Comment Guid="${c.guid}"><Date>${echapper(c.date)}</Date><Author>${echapper(c.auteur)}</Author><Comment>${echapper(c.texte)}</Comment></Comment>`).join("");
    ajouter(`${s.guid}/markup.bcf`, `<Markup><Topic Guid="${s.guid}"${s.type ? ` TopicType="${echapper(s.type)}"` : ""} TopicStatus="${echapper(s.statut)}"><Title>${echapper(s.titre)}</Title>${elem("Priority", s.priorite)}${labels}<CreationDate>${echapper(s.creeLe)}</CreationDate><CreationAuthor>${echapper(s.auteur)}</CreationAuthor>${elem("AssignedTo", s.assigneA)}${elem("Description", s.description)}</Topic>${commentaires}</Markup>`);
  }
  return zipStocke(fichiers);
}

export interface StudioLectureBcf {
  version: string | null;
  /** Identifiant du projet BCF déclaré (`project.bcfp`), sinon null. */
  projetId: string | null;
  sujets: StudioSujetBcf[];
  avertissements: string[];
}

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Lecture d'un `.bcfzip` (entrées stockées ; une entrée compressée exige `inflate`). */
export async function studioLireBcf(octets: Uint8Array, inflate?: (brut: Uint8Array) => Promise<Uint8Array>): Promise<StudioLectureBcf> {
  const fichiers = await lireZip(octets, inflate);
  const lus = new Map(fichiers.map((f) => [f.nom.replace(/\\/g, "/"), dec.decode(f.octets)]));
  const avertissements: string[] = [];
  const v = lus.get("bcf.version");
  const version = v ? attribut(v, "Version", "VersionId") : null;
  if (!v) avertissements.push("bcf.version absent : version supposée 2.1.");
  else if (version && version !== "2.1") avertissements.push(`Version BCF ${version} : seul le contrat 2.1 minimal est lu (champs propres ignorés).`);
  const p = lus.get("project.bcfp");
  const projetId = p ? attribut(p, "Project", "ProjectId") : null;
  const sujets: StudioSujetBcf[] = [];
  const cles = [...lus.keys()].filter((k) => /(^|\/)markup\.bcf$/.test(k)).sort();
  if (cles.length > STUDIO_BCF_LIMITES.sujets) throw new RangeError(`au plus ${STUDIO_BCF_LIMITES.sujets} sujets par fichier BCF`);
  for (const cle of cles) {
    const m = lus.get(cle)!;
    const topic = /<Topic\s[^>]*>[\s\S]*?<\/Topic>/.exec(m)?.[0] ?? "";
    const guid = attribut(topic, "Topic", "Guid");
    if (!guid || !GUID.test(guid)) { avertissements.push(`${cle} : sujet sans Guid valide, non repris.`); continue; }
    if (/<Viewpoints[\s>]/.test(m)) avertissements.push(`${guid} : points de vue non repris (contrat minimal).`);
    const commentaires = [...m.matchAll(/<Comment\s[^>]*Guid="([^"]*)"[^>]*>([\s\S]*?)<\/Comment>\s*(?=<Comment\s|<Viewpoints|<\/Markup>)/g)].slice(0, STUDIO_BCF_LIMITES.commentaires).map((x) => ({
      guid: x[1]!, date: texte(x[2]!, "Date") ?? "", auteur: texte(x[2]!, "Author") ?? "", texte: (texte(x[2]!, "Comment") ?? "").slice(0, 2000),
    }));
    sujets.push({
      guid: guid.toLowerCase(), titre: (texte(topic, "Title") ?? "").slice(0, STUDIO_BCF_LIMITES.titre) || `Sujet BCF ${guid.slice(0, 8)}`,
      description: (texte(topic, "Description") ?? "").slice(0, STUDIO_BCF_LIMITES.description), statut: attribut(topic, "Topic", "TopicStatus") ?? "",
      type: attribut(topic, "Topic", "TopicType"), priorite: texte(topic, "Priority"), creeLe: texte(topic, "CreationDate") ?? "", auteur: texte(topic, "CreationAuthor") ?? "",
      assigneA: texte(topic, "AssignedTo"), objets: [...topic.matchAll(/<Labels>([\s\S]*?)<\/Labels>/g)].map((x) => desechapper(x[1]!.trim())).filter(Boolean), commentaires,
    });
  }
  if (!cles.length) avertissements.push("Aucun sujet (markup.bcf) dans le fichier.");
  return { version, projetId, sujets, avertissements };
}

/** Contexte d'un envoi BCF : projet BCF déclaré, sinon empreinte du fichier reçu. */
export const studioContexteBcf = (projetId: string | null, fichierSha256: string): string => (projetId ? `projet:${projetId.toLowerCase()}` : `fichier:${fichierSha256}`);

export interface StudioReferenceBcfExistante { issueId: string; guid: string; contexte: string }

export interface StudioPlanImportBcf {
  contexte: string;
  /** Sujets à créer comme nouvelles observations (identité interne nouvelle). */
  nouveaux: StudioSujetBcf[];
  /** Sujets déjà importés dans ce même contexte : reconnus, rien n'est réécrit. */
  reconnus: { guid: string; issueId: string }[];
  /** Même Guid déjà connu dans un AUTRE contexte : nouvelle observation distincte (jamais fusionnée). */
  homonymes: { guid: string; issueIdsAutresContextes: string[] }[];
  /** Sujets importés auparavant dans ce contexte et absents de cet envoi : aucune clôture. */
  absents: { guid: string; issueId: string }[];
  /** Objets cités inconnus du modèle : conservés comme références. */
  objetsInconnus: { guid: string; objets: string[] }[];
}

/** Plan d'import : reconnaissance par (Guid, contexte) seulement ; jamais d'écrasement ni de clôture implicite. */
export function studioPlanImportBcf(lecture: Pick<StudioLectureBcf, "sujets">, contexte: string, existantes: readonly StudioReferenceBcfExistante[], objetsConnus: ReadonlySet<string>): StudioPlanImportBcf {
  const memeContexte = new Map(existantes.filter((e) => e.contexte === contexte).map((e) => [e.guid, e.issueId]));
  const nouveaux: StudioSujetBcf[] = [];
  const reconnus: StudioPlanImportBcf["reconnus"] = [];
  const homonymes: StudioPlanImportBcf["homonymes"] = [];
  const objetsInconnus: StudioPlanImportBcf["objetsInconnus"] = [];
  const vus = new Set<string>();
  for (const s of lecture.sujets) {
    if (vus.has(s.guid)) continue;
    vus.add(s.guid);
    const deja = memeContexte.get(s.guid);
    if (deja) { reconnus.push({ guid: s.guid, issueId: deja }); continue; }
    const autres = existantes.filter((e) => e.guid === s.guid && e.contexte !== contexte).map((e) => e.issueId);
    if (autres.length) homonymes.push({ guid: s.guid, issueIdsAutresContextes: autres });
    const inconnus = s.objets.filter((o) => !objetsConnus.has(o));
    if (inconnus.length) objetsInconnus.push({ guid: s.guid, objets: inconnus });
    nouveaux.push(s);
  }
  const absents = [...memeContexte.entries()].filter(([g]) => !vus.has(g)).map(([guid, issueId]) => ({ guid, issueId }));
  return { contexte, nouveaux, reconnus, homonymes, absents, objetsInconnus };
}
