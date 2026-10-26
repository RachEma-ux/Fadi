/**
 * Boîte « Agents (MCP) » (Ctrl+Maj+F9, lot F, décision P-12 ; TEST-033, F.3-02, INV-010) : jetons d'agent de la
 * personne sur ce projet (créés ici, montrés une seule fois, révocables), propositions de ses agents à **confirmer** ou
 * refuser — rien n'est écrit sans ce geste ; la confirmation passe par le même point d'entrée que l'enregistrement —, et
 * journal agent / humain. Connexion : serveur MCP HTTP `/mcp/studio` (jeton en `Authorization: Bearer`) ou relais stdio.
 */
import { useCallback, useEffect, useState } from "react";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { apiAgents, ErreurLotF, type EvenementAgent, type JetonLu, type PropositionLue } from "./api-lot-f";
import { adresseMcp, LIBELLES_ACTION_AGENT, LIBELLES_STATUT_PROPOSITION } from "./illustration-ui";
import "./illustration.css";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(LOCALE) : "");

export function PanneauAgents({ projectId, surFermer }: { projectId: string; surFermer: () => void }) {
  const [jetons, setJetons] = useState<JetonLu[]>([]);
  const [propositions, setPropositions] = useState<PropositionLue[]>([]);
  const [journal, setJournal] = useState<EvenementAgent[]>([]);
  const [nouveau, setNouveau] = useState<{ nom: string; jeton: string } | null>(null);
  const [nom, setNom] = useState("");
  const [erreur, setErreur] = useState("");
  const [info, setInfo] = useState("");
  const charger = useCallback(async () => {
    try {
      const [j, p, e] = await Promise.all([apiAgents.jetons(projectId), apiAgents.propositions(projectId), apiAgents.journal(projectId)]);
      setJetons(j.jetons); setPropositions(p.propositions); setJournal(e.evenements); setErreur("");
    } catch (e) { setErreur(e instanceof ErreurLotF ? e.message : "Le serveur n’a pas répondu."); }
  }, [projectId]);
  useEffect(() => { void charger(); }, [charger]);
  const agir = async (f: () => Promise<unknown>, ok: string) => {
    try { await f(); setInfo(ok); setErreur(""); await charger(); }
    catch (e) { setErreur(e instanceof ErreurLotF ? e.message : "Action non confirmée : rechargez avant de réessayer."); }
  };

  return (
    <Dialogue titre="Agents (MCP)" id="studio-agents-titre" classe="studio-agents" surFermer={surFermer}>
      <div className="studio-illustration-corps" data-studio-agents>
        <p className="studio-note">Un agent agit avec <strong>vos</strong> droits sur ce projet. Il lit et propose ; rien n’est écrit avant votre confirmation ici. Aucun appel n’est fait au mouvement du pointeur.</p>
        <section aria-labelledby="studio-agents-propositions">
          <h3 id="studio-agents-propositions">Propositions à confirmer</h3>
          {propositions.length === 0 ? <p className="studio-hint">Aucune proposition.</p> : <ul>
            {propositions.map((p) => (
              <li key={p.id} data-studio-proposition={p.id} data-studio-proposition-statut={p.statut}>
                <strong>{LIBELLES_STATUT_PROPOSITION[p.statut]}</strong> — {p.apercu.commandes ?? p.commandes.length} commande(s) : <code translate="no">{(p.apercu.outils ?? []).join(", ")}</code>, {p.apercu.nombreElementsModifies ?? 0} élément(s) touché(s) · {date(p.creeLe)}
                {p.statut === "en-attente" && <span className="studio-vue3d-actions">
                  <button type="button" onClick={() => void agir(() => apiAgents.decider(projectId, p.id, "confirmer"), "Proposition confirmée : révision enregistrée (source « agent »).")} data-studio-proposition-confirmer><Icon name="studio-save" size={16} /> Confirmer</button>
                  <button type="button" onClick={() => void agir(() => apiAgents.decider(projectId, p.id, "refuser"), "Proposition refusée : rien n’a été écrit.")} data-studio-proposition-refuser><Icon name="studio-cancel" size={16} /> Refuser</button>
                </span>}
              </li>
            ))}
          </ul>}
        </section>
        <section aria-labelledby="studio-agents-jetons">
          <h3 id="studio-agents-jetons">Jetons d’agent</h3>
          <form onSubmit={(e) => { e.preventDefault(); if (nom.trim()) void agir(async () => { const r = await apiAgents.creerJeton(projectId, nom.trim(), 30); setNouveau({ nom: r.nom, jeton: r.jeton }); setNom(""); }, "Jeton créé : copiez-le maintenant, il ne sera plus montré."); }}>
            <label>Nom du jeton <input value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} data-studio-jeton-nom /></label>
            <button type="submit" disabled={!nom.trim()} data-studio-jeton-creer><Icon name="studio-agents" size={16} /> Créer un jeton (30 jours)</button>
          </form>
          {nouveau && <p data-studio-jeton-nouveau>Jeton « {nouveau.nom} » : <code translate="no" data-studio-jeton-valeur>{nouveau.jeton}</code></p>}
          <p className="studio-hint">Serveur MCP (HTTP) : <code translate="no">{adresseMcp(typeof location === "undefined" ? "" : location.origin)}</code> · relais stdio : <code translate="no">FADI_MCP_URL=… FADI_MCP_JETON=… node apps/api/scripts/studio-mcp-stdio.mjs</code></p>
          <ul>
            {jetons.map((j) => (
              <li key={j.id} data-studio-jeton={j.id}>{j.nom} — créé le {date(j.creeLe)}, expire le {date(j.expireLe)}{j.revoqueLe ? ` · révoqué le ${date(j.revoqueLe)}` : ""}
                {!j.revoqueLe && <button type="button" onClick={() => void agir(() => apiAgents.revoquer(projectId, j.id), "Jeton révoqué.")} data-studio-jeton-revoquer>Révoquer</button>}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="studio-agents-journal">
          <h3 id="studio-agents-journal">Journal agent / humain</h3>
          <ul>{journal.map((e) => <li key={e.id} data-studio-journal-acteur={e.acteur}>{date(e.le)} — {e.acteur === "agent" ? "Agent" : "Vous"} : {LIBELLES_ACTION_AGENT[e.action] ?? e.action}{e.outil ? ` (${e.outil})` : ""}</li>)}</ul>
        </section>
        {info && <p role="status" data-studio-agents-info>{info}</p>}
        {erreur && <p role="alert" className="studio-erreur" data-studio-agents-erreur>{erreur}</p>}
      </div>
    </Dialogue>
  );
}
