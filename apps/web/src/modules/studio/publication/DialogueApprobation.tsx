/**
 * Boîte « Approuver » (AC-010, lot G2) : la commande du catalogue (Ctrl+Maj+F11, palette, gestionnaire « Outils »)
 * liste les publications en revue de l'étude et envoie l'approbation de celle choisie, avec le manifeste affiché
 * (l'ensemble examiné). Elle est proposée à tout membre : la découverte n'est pas un droit. Le serveur seul juge du
 * droit métier (`canApprove`) et un refus est affiché tel quel — ni les préférences, ni un profil importé, ni un rôle
 * d'administration technique n'y changent rien.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type StudioPublication } from "../../../lib/api";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { corpsTransition, court, empreinteCourte, messageRefusApprobation, publicationsAApprouver } from "./publication-ui";

export function DialogueApprobation({ projectId, studyId, surFermer }: { projectId: string; studyId: string; surFermer: () => void }) {
  const cle = ["studio-publications", projectId, studyId];
  const client = useQueryClient();
  const liste = useQuery({ queryKey: cle, queryFn: () => api.studioPublications(projectId, studyId), retry: false });
  const [choisie, setChoisie] = useState("");
  const [message, setMessage] = useState<{ type: "refus" | "ok"; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const soumises = publicationsAApprouver(liste.data?.publications ?? []);
  const cible: StudioPublication | undefined = soumises.find((p) => p.id === choisie) ?? (soumises.length === 1 ? soumises[0] : undefined);
  async function approuver() {
    if (!cible || enCours) return;
    setEnCours(true); setMessage(null);
    try {
      await api.transitionStudioPublication(projectId, studyId, cible.id, "approuver", corpsTransition(cible, "approuver", ""));
      setMessage({ type: "ok", texte: "Publication approuvée : la décision est consignée par le serveur." });
      await client.invalidateQueries({ queryKey: cle });
    } catch (err) {
      setMessage({ type: "refus", texte: err instanceof ApiError ? messageRefusApprobation(err.status, err.body) : "Approbation non confirmée : rechargez la liste avant de réessayer." });
    } finally { setEnCours(false); }
  }
  return (
    <Dialogue titre="Approuver" id="studio-approbation-titre" classe="studio-approbation" surFermer={surFermer}>
      <div data-studio-approbation>
        <p className="studio-dialogue-aide">Approuver une publication soumise de cette étude. Le serveur vérifie votre droit d’approbation : la commande est visible de tous les membres, mais elle n’est exécutée que pour qui détient ce droit.</p>
        {liste.isPending && <p role="status">Chargement des publications…</p>}
        {liste.isError && <p role="alert">Publications indisponibles.</p>}
        {liste.data && soumises.length === 0 && <p data-studio-approbation-vide>Aucune publication soumise dans cette étude.</p>}
        {soumises.length > 1 && (
          <>
            <label htmlFor="studio-approbation-choix">Publication</label>
            <select id="studio-approbation-choix" value={choisie} onChange={(e) => setChoisie(e.target.value)} data-studio-approbation-choix>
              <option value="">Choisir…</option>
              {soumises.map((p) => <option key={p.id} value={p.id} translate="no">{`${p.title} · ${court(p.revisionId)}`}</option>)}
            </select>
          </>
        )}
        {cible && <p data-studio-approbation-examine>{`Vous approuvez le manifeste ${empreinteCourte(cible.manifestHash ?? "")} : révision ${court(cible.revisionId)} (empreinte ${empreinteCourte(cible.documentHash)}).`}</p>}
        {message && <p role={message.type === "refus" ? "alert" : "status"} data-studio-approbation-message={message.type}>{message.texte}</p>}
        <button type="button" disabled={!cible || enCours} onClick={() => void approuver()} data-studio-approbation-confirmer>Approuver</button>
      </div>
    </Dialogue>
  );
}
