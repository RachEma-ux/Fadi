/**
 * Déclaration d'extension de Studio (EX-031, TR-EX-031, F.3-01 ; lot F, décision P-12). Une extension se **déclare** :
 * provenance (éditeur, source, empreinte), version, mécanisme de confiance (intégré au build de Fadi, ou signature
 * Ed25519 d'une clé de confiance de l'administrateur), permissions demandées, dépendances, mises à jour et support.
 * Règles :
 * - « trouvée dans le registre » ne veut pas dire « autorisée » : une déclaration lue est `decouverte` ; signée par une
 *   clé de confiance, `verifiee` ; seule l'autorisation explicite de l'administrateur pour **cet identifiant à cette
 *   version** la rend `autorisee` ;
 * - Studio ne charge **jamais** de code d'extension (`chargement: "aucun"`) : une déclaration qui propose un script, un
 *   point d'entrée exécutable ou une adresse de code est `refusee`, rien n'est chargé ni écrit ;
 * - une extension autorisée n'agit que par l'adaptateur d'agents (mêmes commandes, droits et confirmations que
 *   l'interface humaine, `mcp.ts`) et dans la limite de ses permissions déclarées.
 * La vérification cryptographique est injectée (`verifier`) : le serveur fournit Ed25519 (`node:crypto`). Pur.
 */

export const STUDIO_EXTENSION_SCHEMA = "studio-extension/1" as const;
export const STUDIO_PERMISSIONS_EXTENSION = Object.freeze(["lire-etudes", "lire-variante", "lire-registre", "proposer-commandes", "lire-propositions"] as const);
export type StudioPermissionExtension = (typeof STUDIO_PERMISSIONS_EXTENSION)[number];
/** Champs qui proposeraient d'exécuter du code : refusés d'office. */
export const STUDIO_CHAMPS_CODE_INTERDITS = Object.freeze(["script", "code", "main", "entree", "entry", "module", "url-code", "wasm", "bin", "exec", "install"] as const);

export interface StudioDeclarationExtension {
  schema: typeof STUDIO_EXTENSION_SCHEMA;
  id: string;
  nom: string;
  version: string;
  provenance: { editeur: string; source: string; empreinte: string | null };
  confiance: { mecanisme: "integre" } | { mecanisme: "signature-ed25519"; cleId: string; signature: string };
  permissions: StudioPermissionExtension[];
  dependances: { id: string; version: string }[];
  misesAJour: { politique: "avec-fadi" | "manuelle"; canal: string };
  support: { contact: string };
}

export type StudioEtatExtension = "refusee" | "decouverte" | "verifiee" | "autorisee";

export interface StudioEvaluationExtension {
  id: string | null;
  version: string | null;
  etat: StudioEtatExtension;
  motifs: string[];
  /** Studio ne charge jamais de code d'extension. */
  chargement: "aucun";
  permissions: StudioPermissionExtension[];
}

export interface StudioContexteConfianceExtension {
  /** Vérifie une signature (base64) du message par la clé de confiance `cleId` ; faux si la clé est inconnue. */
  verifier: (cleId: string, message: string, signature: string) => boolean;
  /** Autorisations de l'administrateur : `id@version`. */
  autorisees: ReadonlySet<string>;
}

const ID = /^[a-z0-9][a-z0-9.-]{0,79}$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA = /^[0-9a-f]{64}$/;

/** JSON canonique (clés triées) : message signé = déclaration sans `confiance.signature`. */
export function studioJsonCanonique(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(studioJsonCanonique).join(",")}]`;
  if (v !== null && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${studioJsonCanonique((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}
export function studioMessageSigneExtension(d: StudioDeclarationExtension): string {
  const copie = structuredClone(d) as unknown as { confiance: Record<string, unknown> };
  delete copie.confiance["signature"];
  return studioJsonCanonique(copie);
}

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const txt = (v: unknown) => typeof v === "string" && v.trim().length > 0 && v.length <= 500;

/** Lecture stricte d'une déclaration ; rend les erreurs, jamais une déclaration complétée. */
export function studioLireDeclarationExtension(v: unknown): { ok: true; declaration: StudioDeclarationExtension } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];
  if (!estObjet(v)) return { ok: false, erreurs: ["déclaration : objet attendu"] };
  const interdits = Object.keys(v).filter((k) => (STUDIO_CHAMPS_CODE_INTERDITS as readonly string[]).includes(k.toLowerCase()));
  if (interdits.length) erreurs.push(`code exécutable proposé (${interdits.join(", ")}) : Studio ne charge aucun code d’extension`);
  const connus = ["schema", "id", "nom", "version", "provenance", "confiance", "permissions", "dependances", "misesAJour", "support"];
  const inconnus = Object.keys(v).filter((k) => !connus.includes(k) && !interdits.includes(k));
  if (inconnus.length) erreurs.push(`champs inconnus : ${inconnus.join(", ")}`);
  if (v["schema"] !== STUDIO_EXTENSION_SCHEMA) erreurs.push("schema : studio-extension/1 attendu");
  if (typeof v["id"] !== "string" || !ID.test(v["id"])) erreurs.push("id : identifiant attendu");
  if (!txt(v["nom"])) erreurs.push("nom : texte attendu");
  if (typeof v["version"] !== "string" || !SEMVER.test(v["version"])) erreurs.push("version : version sémantique attendue");
  const p = v["provenance"];
  if (!estObjet(p) || !txt(p["editeur"]) || !txt(p["source"]) || !(p["empreinte"] === null || (typeof p["empreinte"] === "string" && SHA.test(p["empreinte"])))) erreurs.push("provenance : éditeur, source et empreinte (ou null) attendus");
  const c = v["confiance"];
  if (!estObjet(c) || !(c["mecanisme"] === "integre" ? Object.keys(c).length === 1 : c["mecanisme"] === "signature-ed25519" && txt(c["cleId"]) && txt(c["signature"]))) erreurs.push("confiance : mécanisme « integre » ou « signature-ed25519 » (cleId, signature) attendu");
  const perms = v["permissions"];
  if (!Array.isArray(perms) || perms.some((x) => !(STUDIO_PERMISSIONS_EXTENSION as readonly unknown[]).includes(x)) || new Set(perms).size !== perms.length) erreurs.push("permissions : liste de permissions connues, sans répétition, attendue");
  const deps = v["dependances"];
  if (!Array.isArray(deps) || deps.some((d) => !estObjet(d) || typeof d["id"] !== "string" || !ID.test(d["id"]) || typeof d["version"] !== "string" || !txt(d["version"]))) erreurs.push("dependances : liste { id, version } attendue");
  const m = v["misesAJour"];
  if (!estObjet(m) || !["avec-fadi", "manuelle"].includes(m["politique"] as string) || !txt(m["canal"])) erreurs.push("misesAJour : politique (avec-fadi, manuelle) et canal attendus");
  const s = v["support"];
  if (!estObjet(s) || !txt(s["contact"])) erreurs.push("support : contact attendu");
  return erreurs.length ? { ok: false, erreurs } : { ok: true, declaration: structuredClone(v) as unknown as StudioDeclarationExtension };
}

/** Évaluation d'une déclaration découverte : ne charge rien, n'écrit rien. */
export function studioEvaluerExtension(v: unknown, ctx: StudioContexteConfianceExtension): StudioEvaluationExtension {
  const lu = studioLireDeclarationExtension(v);
  const brut = estObjet(v) ? v : {};
  if (!lu.ok) return { id: typeof brut["id"] === "string" ? brut["id"] : null, version: typeof brut["version"] === "string" ? brut["version"] : null, etat: "refusee", motifs: lu.erreurs, chargement: "aucun", permissions: [] };
  const d = lu.declaration;
  const base = { id: d.id, version: d.version, chargement: "aucun" as const, permissions: [...d.permissions] };
  if (d.confiance.mecanisme === "signature-ed25519") {
    let ok = false;
    try { ok = ctx.verifier(d.confiance.cleId, studioMessageSigneExtension(d), d.confiance.signature); } catch { ok = false; }
    if (!ok) return { ...base, etat: "decouverte", motifs: ["signature absente d’une clé de confiance ou invalide : découverte, non autorisée"] };
  } else if (d.provenance.source !== "fadi:integre") {
    return { ...base, etat: "decouverte", motifs: ["mécanisme « integre » réservé aux composants livrés avec Fadi"] };
  }
  if (!ctx.autorisees.has(`${d.id}@${d.version}`)) return { ...base, etat: "verifiee", motifs: ["provenance vérifiée ; non autorisée par l’administrateur pour cette version"] };
  return { ...base, etat: "autorisee", motifs: [] };
}

/** L'adaptateur d'agents (MCP) de Studio, déclaré comme une extension intégrée. */
export const STUDIO_EXTENSION_MCP: StudioDeclarationExtension = Object.freeze({
  schema: STUDIO_EXTENSION_SCHEMA,
  id: "fadi.studio.mcp",
  nom: "Adaptateur d’agents Studio (MCP)",
  version: "1.0.0",
  provenance: { editeur: "Fadi", source: "fadi:integre", empreinte: null },
  confiance: { mecanisme: "integre" },
  permissions: ["lire-etudes", "lire-variante", "lire-registre", "proposer-commandes", "lire-propositions"],
  dependances: [],
  misesAJour: { politique: "avec-fadi", canal: "livré et mis à jour avec Fadi (aucun téléchargement)" },
  support: { contact: "maître d’ouvrage de Fadi" },
}) as StudioDeclarationExtension;
