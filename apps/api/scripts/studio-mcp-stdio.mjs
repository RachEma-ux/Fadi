#!/usr/bin/env node
/**
 * Transport stdio du serveur MCP de Studio (lot F, décision P-12) : relais sans état entre un client MCP local
 * (messages JSON-RPC délimités par des retours à la ligne sur l'entrée et la sortie standard, spécification MCP
 * « stdio ») et la route HTTP `POST /mcp/studio` de Fadi. Aucune base, aucune session, aucun droit propre : chaque
 * message est transmis avec le jeton d'agent de la personne, et le serveur décide (mêmes droits, même confirmation).
 *
 *   FADI_MCP_URL=https://fadi.exemple/mcp/studio FADI_MCP_JETON=fadi_mcp_… node apps/api/scripts/studio-mcp-stdio.mjs
 *
 * Le jeton se crée dans Studio (panneau « Agents (MCP) ») ; il n'est jamais écrit sur la sortie ni dans un fichier.
 * Les diagnostics vont sur la sortie d'erreur (la sortie standard ne porte que des messages MCP).
 */
import { createInterface } from "node:readline";

export function creerRelais({ url, jeton, fetchImpl = globalThis.fetch, ecrire = (l) => process.stdout.write(`${l}\n`), journal = (l) => process.stderr.write(`${l}\n`) }) {
  if (!url || !/^https?:\/\//.test(url)) throw new Error("FADI_MCP_URL attendue (adresse de /mcp/studio)");
  if (!jeton || !jeton.startsWith("fadi_mcp_")) throw new Error("FADI_MCP_JETON attendu (jeton d’agent créé dans Studio)");
  return async function relayer(ligne) {
    const texte = ligne.trim();
    if (!texte) return;
    let message;
    try { message = JSON.parse(texte); } catch { ecrire(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON invalide" } })); return; }
    const id = message && typeof message === "object" && "id" in message ? message.id : undefined;
    try {
      const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${jeton}` }, body: JSON.stringify(message) });
      if (res.status === 202) return;
      const corps = await res.text();
      if (!res.ok) {
        journal(`fadi-studio-mcp : réponse HTTP ${res.status}`);
        if (id !== undefined) ecrire(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32001, message: `Refus du serveur Fadi (HTTP ${res.status})`, data: safeJson(corps) } }));
        return;
      }
      ecrire(JSON.stringify(JSON.parse(corps)));
    } catch (err) {
      journal(`fadi-studio-mcp : ${err instanceof Error ? err.message : String(err)}`);
      if (id !== undefined) ecrire(JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32002, message: "Serveur Fadi injoignable" } }));
    }
  };
}
function safeJson(t) { try { return JSON.parse(t); } catch { return null; } }

if (import.meta.url === `file://${process.argv[1]}`) {
  const relayer = creerRelais({ url: process.env.FADI_MCP_URL, jeton: process.env.FADI_MCP_JETON });
  let file = Promise.resolve();
  const rl = createInterface({ input: process.stdin });
  // Ordre conservé : un message est relayé après la réponse du précédent.
  rl.on("line", (l) => { file = file.then(() => relayer(l)); });
  rl.on("close", () => { void file.then(() => process.exit(0)); });
}
