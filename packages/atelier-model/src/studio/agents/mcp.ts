import { STUDIO_CONTRACT } from "../noyau/limites.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "../registry.js";
import type { StudioPermissionExtension } from "./extensions.js";

/**
 * Adaptateur d'agents de Studio par le protocole MCP (Model Context Protocol, JSON-RPC 2.0 ; TEST-033, F.3-01 à F.3-03 ;
 * lot F, décision P-12) — partie pure : outils exposés, schémas d'entrée, et traitement d'un message JSON-RPC
 * (`initialize`, `ping`, `tools/list`, `tools/call`, notifications), les gestionnaires étant injectés par le serveur.
 * Règles :
 * - **mêmes commandes et schémas** que l'interface humaine : une seule écriture, `studio_proposer_commandes`, porte une
 *   enveloppe du contrat `studio-commands/1` (identifiants d'outils du registre, mêmes paramètres) ; aucune autre ;
 * - **même confirmation** : comme un tracé reste un brouillon tant que l'utilisateur n'a pas enregistré, une proposition
 *   d'agent n'écrit rien ; elle attend la confirmation de la personne dans Studio (session humaine, jamais le jeton de
 *   l'agent), puis passe par le point d'entrée commun (droits, révision de base, idempotence) ;
 * - **aucun appel distant par mouvement du pointeur** : aucun outil ne suit le pointeur, ne prévisualise au survol ni
 *   ne diffuse en continu ; chaque appel est un acte explicite (lecture ou proposition).
 * Pur : ni réseau, ni base, ni horloge.
 */

export const STUDIO_MCP_VERSIONS_PROTOCOLE = Object.freeze(["2025-06-18", "2025-03-26", "2024-11-05"] as const);
export const STUDIO_MCP_SERVEUR = Object.freeze({ name: "fadi-studio", title: "Fadi Studio", version: "1.0.0" });

export interface StudioOutilMcp {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: false };
  /** Permission d'extension requise (déclaration `STUDIO_EXTENSION_MCP`). */
  permission: StudioPermissionExtension;
  /** Vrai : l'appel n'écrit rien, il crée une proposition à confirmer par la personne dans Studio. */
  confirmation: boolean;
}

const ident = { type: "string", minLength: 1, maxLength: 128, pattern: "^[A-Za-z0-9._:-]+$" } as const;

export const STUDIO_OUTILS_MCP: readonly StudioOutilMcp[] = Object.freeze([
  {
    name: "studio_lister_etudes", title: "Lister les études", permission: "lire-etudes", confirmation: false,
    description: "Études Studio du projet du jeton, avec leurs variantes ; mêmes droits de lecture que l’interface.",
    inputSchema: { type: "object", additionalProperties: false, properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "studio_lire_variante", title: "Lire une variante", permission: "lire-variante", confirmation: false,
    description: "Révision (tête par défaut) et document d’une variante ; la tête sert de baseRevisionId à une proposition.",
    inputSchema: { type: "object", additionalProperties: false, properties: { studyId: ident, variantId: ident, revisionId: ident }, required: ["studyId", "variantId"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "studio_outils", title: "Outils du registre", permission: "lire-registre", confirmation: false,
    description: "Commandes du registre Studio (mêmes identifiants et schémas de paramètres que l’interface humaine).",
    inputSchema: { type: "object", additionalProperties: false, properties: {}, required: [] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "studio_proposer_commandes", title: "Proposer des commandes", permission: "proposer-commandes", confirmation: true,
    description: "Propose un lot de commandes (contrat studio-commands/1). Rien n’est écrit : la personne titulaire du jeton confirme ou refuse dans Studio ; la confirmation passe par le même point d’entrée que l’interface (droits, révision de base, idempotence par requestId).",
    inputSchema: {
      type: "object", additionalProperties: false, required: ["studyId", "variantId", "requestId", "baseRevisionId", "commands"],
      properties: {
        studyId: ident, variantId: ident, requestId: ident, baseRevisionId: ident,
        commands: {
          type: "array", minItems: 1, maxItems: 500,
          items: { type: "object", additionalProperties: false, required: ["toolId", "params"], properties: { toolId: { enum: [...STUDIO_COMMAND_TOOL_IDS] }, params: { type: "object" } } },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "studio_etat_proposition", title: "État d’une proposition", permission: "lire-propositions", confirmation: false,
    description: "État d’une proposition (en attente, confirmée avec sa révision, refusée, expirée, échouée).",
    inputSchema: { type: "object", additionalProperties: false, properties: { propositionId: ident }, required: ["propositionId"] },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
] as StudioOutilMcp[]);

/** Outils du registre tels qu'un agent les lit : seulement les commandes persistées, avec leur schéma tel quel. */
export function studioOutilsRegistrePourAgents(): { toolId: string; libelleFR: string; contractVersion: string; inputSchema: Readonly<Record<string, unknown>> }[] {
  return STUDIO_TOOLS.filter((t) => t.nature === "mutation").map((t) => ({ toolId: t.toolId, libelleFR: t.libelleFR, contractVersion: STUDIO_CONTRACT, inputSchema: t.inputSchema }));
}

/** Liste `tools/list` (champs MCP seulement). */
export function studioListeOutilsMcp(): { name: string; title: string; description: string; inputSchema: Record<string, unknown>; annotations: StudioOutilMcp["annotations"] }[] {
  return STUDIO_OUTILS_MCP.map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations }));
}

/** Contrôle des arguments contre le schéma de l'outil (objet strict, clés requises, chaînes d'identifiant). */
export function studioArgumentsMcpValides(outil: StudioOutilMcp, args: unknown): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "arguments : objet attendu";
  const s = outil.inputSchema as { properties: Record<string, { type?: string; pattern?: string }>; required: string[] };
  const a = args as Record<string, unknown>;
  const inconnues = Object.keys(a).filter((k) => !(k in s.properties));
  if (inconnues.length) return `arguments inconnus : ${inconnues.join(", ")}`;
  const manquants = s.required.filter((k) => !(k in a));
  if (manquants.length) return `arguments manquants : ${manquants.join(", ")}`;
  for (const [k, p] of Object.entries(s.properties)) {
    if (!(k in a) || p.type !== "string") continue;
    const v = a[k];
    if (typeof v !== "string" || v.length < 1 || v.length > 128 || !new RegExp(p.pattern ?? ".").test(v)) return `${k} : identifiant attendu`;
  }
  if ("commands" in s.properties && !Array.isArray(a["commands"])) return "commands : liste attendue";
  return null;
}

export interface StudioResultatOutilMcp { contenu: unknown; erreur: boolean }
export interface StudioGestionnairesMcp {
  /** Permissions accordées à l'adaptateur (déclaration autorisée) ; un outil hors permission est refusé. */
  permissions: ReadonlySet<StudioPermissionExtension>;
  appelerOutil: (nom: string, args: Record<string, unknown>) => Promise<StudioResultatOutilMcp>;
}

type Id = string | number | null;
const reponse = (id: Id, result: unknown) => ({ jsonrpc: "2.0" as const, id, result });
const erreur = (id: Id, code: number, message: string, data?: unknown) => ({ jsonrpc: "2.0" as const, id, error: { code, message, ...(data === undefined ? {} : { data }) } });
export type StudioReponseMcp = ReturnType<typeof reponse> | ReturnType<typeof erreur>;

/** Un message JSON-RPC 2.0 ; `null` pour une notification (aucune réponse). */
export async function studioTraiterMessageMcp(message: unknown, g: StudioGestionnairesMcp): Promise<StudioReponseMcp | null> {
  if (!message || typeof message !== "object" || Array.isArray(message)) return erreur(null, -32600, "Requête JSON-RPC invalide");
  const m = message as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: unknown };
  const id: Id = typeof m.id === "string" || typeof m.id === "number" ? m.id : null;
  const notification = !("id" in m);
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string" || (!notification && id === null)) return notification ? null : erreur(id, -32600, "Requête JSON-RPC invalide");
  if (notification) return null;
  const params = (m.params && typeof m.params === "object" && !Array.isArray(m.params) ? m.params : {}) as Record<string, unknown>;
  switch (m.method) {
    case "initialize": {
      const demandee = params["protocolVersion"];
      const version = (STUDIO_MCP_VERSIONS_PROTOCOLE as readonly unknown[]).includes(demandee) ? demandee : STUDIO_MCP_VERSIONS_PROTOCOLE[0];
      return reponse(id, {
        protocolVersion: version, capabilities: { tools: { listChanged: false } }, serverInfo: STUDIO_MCP_SERVEUR,
        instructions: "Studio : lisez avec studio_lire_variante, proposez avec studio_proposer_commandes. Aucune proposition n’est écrite avant la confirmation de la personne dans Studio.",
      });
    }
    case "ping": return reponse(id, {});
    case "tools/list": return reponse(id, { tools: studioListeOutilsMcp() });
    case "tools/call": {
      const nom = params["name"];
      const outil = STUDIO_OUTILS_MCP.find((o) => o.name === nom);
      if (!outil) return erreur(id, -32602, `Outil inconnu : ${String(nom)}`);
      if (!g.permissions.has(outil.permission)) return erreur(id, -32602, `Permission non accordée à l’adaptateur : ${outil.permission}`);
      const args = params["arguments"] ?? {};
      const invalide = studioArgumentsMcpValides(outil, args);
      if (invalide) return erreur(id, -32602, invalide);
      const r = await g.appelerOutil(outil.name, args as Record<string, unknown>);
      return reponse(id, { content: [{ type: "text", text: JSON.stringify(r.contenu) }], structuredContent: r.contenu, isError: r.erreur });
    }
    default: return erreur(id, -32601, `Méthode inconnue : ${m.method}`);
  }
}
