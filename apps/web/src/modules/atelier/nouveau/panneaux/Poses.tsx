/**
 * Contraintes verticales (D-155) : poser un objet sur un autre, aligner leurs bases ou leurs sommets ; liste des
 * contraintes d'un objet avec retrait. Le porté suit l'altitude du porteur ; le porteur n'est jamais déplacé.
 */
import { useState } from "react";
import { etendueVerticale, posesDe, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";

const LIBELLES: Record<string, string> = { "pose-sur": "posé sur", "meme-base": "même base que", "meme-sommet": "même sommet que" };

export function ContrainteVerticale({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: (c: Commande[], label: string) => void }) {
  const [genre, setGenre] = useState("pose-sur");
  const [inverse, setInverse] = useState(false);
  if (sel.length !== 2 || readOnly) return null;
  const [x, y] = inverse ? [sel[1]!, sel[0]!] : [sel[0]!, sel[1]!];
  const porte = x;
  const porteur = y;
  const mobile = etendueVerticale(etat, porte)?.mobile;
  const evalue = !!etendueVerticale(etat, porteur);
  return (
    <details className="inspecteur-pose" data-contrainte-verticale>
      <summary>Contrainte verticale</summary>
      <div className="nav-formulaire-altimetrie">
        <p className="inspecteur-aide">
          <strong>{porte.id}</strong> {LIBELLES[genre]} <strong>{porteur.id}</strong> : le premier suit l'altitude du second.
        </p>
        <label>Genre
          <select value={genre} onChange={(e) => setGenre(e.target.value)} data-pose-genre>
            <option value="pose-sur">posé sur (base au sommet du porteur)</option>
            <option value="meme-base">même base</option>
            <option value="meme-sommet">même sommet</option>
          </select>
        </label>
        <button type="button" className="lien" onClick={() => setInverse(!inverse)} data-pose-inverser>Inverser porté et porteur</button>
        {!mobile && <p className="inspecteur-aide">{porte.id} ne se recale pas en altitude (dalle non inclinée, solide fermé à hauteur ou toiture plate seulement).</p>}
        {!evalue && <p className="inspecteur-aide">Altitude de {porteur.id} non évaluée (hauteur absente).</p>}
        <button type="button" disabled={!mobile || !evalue} data-pose-appliquer onClick={() => onCommandes([{ type: "pose.ajouter", params: { genre, porteId: porte.id, porteurId: porteur.id } }], `${porte.id} ${LIBELLES[genre]} ${porteur.id}`)}>
          Contraindre
        </button>
      </div>
    </details>
  );
}

export function PosesObjet({ o, etat, readOnly, onCommandes }: { o: OccurrenceQuelconque; etat: ModeleAtelier; readOnly: boolean; onCommandes: (c: Commande[], label: string) => void }) {
  const liees = posesDe(etat).filter((r) => r.sourceId === o.id || r.targetId === o.id);
  if (!liees.length) return null;
  return (
    <ul className="inspecteur-poses" data-poses>
      {liees.map((r) => (
        <li key={r.id} data-pose={r.id}>
          {r.sourceId} {LIBELLES[String(r.params["genre"])] ?? "lié à"} {r.targetId}
          {r.params["aReparer"] ? " (à réparer)" : ""}
          {!readOnly && <button type="button" className="lien" onClick={() => onCommandes([{ type: "pose.supprimer", params: { id: r.id } }], `Contrainte verticale ${r.id} retirée`)}>Retirer</button>}
        </li>
      ))}
    </ul>
  );
}
