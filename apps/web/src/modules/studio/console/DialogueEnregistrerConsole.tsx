/**
 * Boîte « Enregistrer dans un projet » de la Console : choix d'un projet (où l'on peut créer une étude) et du nom de
 * l'étude, puis création de cette étude avec ce qui a été dessiné (`transfert.ts`). La Console n'écrit JAMAIS dans une
 * étude existante et n'est pas liée au projet : l'étude créée est une copie, ouverte ensuite dans son espace de travail.
 * Le serveur reste seul juge des droits ; un refus ou un échec réseau se lit ici et la reprise ne crée aucun doublon.
 */
import { useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { StudioCommand } from "@parcours/atelier-model";
import { api, ApiError } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { Dialogue } from "../planche2d/CatalogueOutils";
import { transfererVersProjet, type Cible, type EtatTransfert } from "./transfert";

const nomPropose = () => `Étude ${new Date().toLocaleDateString(LOCALE)}`;

export function DialogueEnregistrerConsole({ commandes, surFermer, surEnregistre }: { commandes: readonly StudioCommand[]; surFermer: () => void; surEnregistre: (c: Cible) => void }) {
  const projets = useQuery({ queryKey: ["projects"], queryFn: api.listProjects, staleTime: 30_000 });
  const client = useQueryClient();
  // Un lecteur ne peut pas créer d'étude : le serveur le refuserait, la liste ne le propose pas.
  const liste = (projets.data ?? []).filter((p) => p.role !== "lecteur" && p.role !== "support");
  const [choix, setChoix] = useState<string | null>(null);
  const [nom, setNom] = useState(nomPropose);
  const [enCours, setEnCours] = useState(false);
  const [echec, setEchec] = useState("");
  const [reprise, setReprise] = useState(false);
  const verrou = useRef(false);
  const etat = useRef<EtatTransfert | null>(null);
  const demande = useRef<{ cle: string; id: string } | null>(null);
  const projet = liste.find((p) => p.id === choix) ?? liste[0];
  // Une fois l'étude créée, projet et nom ne changent plus : la reprise continue cette étude.
  const commence = etat.current !== null;
  async function enregistrer(e: FormEvent) {
    e.preventDefault();
    const propre = nom.trim();
    if (!projet || !propre || verrou.current) return;
    verrou.current = true; setEnCours(true); setEchec(""); setReprise(false);
    const cle = `${projet.id}\u0000${propre}`;
    if (demande.current?.cle !== cle) demande.current = { cle, id: crypto.randomUUID() };
    try {
      const cible = await transfererVersProjet({ client: api, projectId: projet.id, nom: propre, commandes, requestId: demande.current.id, etat });
      void client.invalidateQueries({ queryKey: ["studio-studies", projet.id] });
      surEnregistre(cible);
    } catch (err) {
      const refuse = err instanceof ApiError && err.status < 500;
      setEchec(refuse ? "Enregistrement refusé par le serveur." : "Enregistrement non confirmé. Réessayez : la même demande sera rejouée sans doublon.");
      setReprise(etat.current !== null);
      void client.invalidateQueries({ queryKey: ["studio-studies", projet.id] });
    } finally {
      verrou.current = false; setEnCours(false);
    }
  }
  return (
    <Dialogue titre="Enregistrer dans un projet" id="studio-enregistrer-console-titre" classe="studio-enregistrer-console" surFermer={() => { if (!enCours) surFermer(); }}>
      <form onSubmit={(e) => void enregistrer(e)} data-studio-enregistrer-console aria-busy={enCours}>
        <p>Crée une nouvelle étude dans le projet choisi avec ce que vous avez dessiné. Aucune étude existante n’est modifiée ; la Console n’est pas liée à ce projet.</p>
        {projets.isPending && <p role="status">Chargement des projets…</p>}
        {projets.isError && <p role="alert">Impossible de charger vos projets. <button type="button" onClick={() => void projets.refetch()}>Réessayer</button></p>}
        {projets.data && liste.length === 0 && <p role="status" data-studio-console-aucun-projet>Aucun projet où vous pouvez créer une étude. <Link to="/projets">Créez un projet dans Projets.</Link></p>}
        {liste.length > 0 && <>
          <label htmlFor="studio-console-projet">Projet</label>
          <select id="studio-console-projet" value={projet?.id ?? ""} disabled={enCours || commence} onChange={(e) => setChoix(e.target.value)} data-studio-console-projet translate="no">
            {liste.map((p) => <option key={p.id} value={p.id}>{`${p.code} — ${p.name}`}</option>)}
          </select>
          <label htmlFor="studio-console-nom">Nom de l’étude</label>
          <input id="studio-console-nom" required maxLength={160} value={nom} disabled={enCours || commence} onChange={(e) => setNom(e.target.value)} />
        </>}
        {echec && <p role="alert">{echec}</p>}
        {echec && reprise && <p data-studio-console-reprise>L’étude est créée : la reprise continue l’envoi sans doublon.</p>}
        <div className="studio-nouvelle-etude-actions">
          <button className="studio-bouton-principal" disabled={enCours || !projet || !nom.trim()} data-studio-console-enregistrer>{enCours ? "Enregistrement…" : commence ? "Reprendre l’enregistrement" : "Créer l’étude et enregistrer"}</button>
          <button type="button" disabled={enCours} onClick={surFermer}>Annuler</button>
        </div>
      </form>
    </Dialogue>
  );
}
