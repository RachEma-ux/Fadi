/**
 * Panneau des calques : calque actif (où se posent les nouveaux objets), visibilité et verrouillage (réglage immédiat
 * par `studio.calque.modifier`), renommage du calque actif. Les noms de calques sont des données du projet : jamais
 * traduits, sauf le calque implicite nommé par l'interface.
 */
import type { Ref } from "react";
import type { StudioDocument, StudioLayer } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { listeCalques } from "./calques";

export interface PanneauCalquesProps {
  doc: StudioDocument;
  actif: string;
  modifiable: boolean;
  nom: string;
  nomRef: Ref<HTMLInputElement>;
  surActif: (id: string) => void;
  surNom: (nom: string) => void;
  surReglage: (calque: StudioLayer) => void;
  /** Renommer le calque actif (même commande que « Régler le calque » de la barre). */
  surRenommer: () => void;
}

export function PanneauCalques({ doc, actif, modifiable, nom, nomRef, surActif, surNom, surReglage, surRenommer }: PanneauCalquesProps) {
  const calques = listeCalques(doc);
  const compte = (id: string) => [...doc.objects, ...(doc.dimensions ?? [])].filter((o) => (o.layerId ?? "default") === id).length;
  return (
    <section className="studio-calques" aria-labelledby="studio-calques-titre" data-studio-calques>
      <h3 id="studio-calques-titre">Calques</h3>
      <ul>
        {calques.map((c) => (
          <li key={c.id} data-studio-calque-ligne={c.id} aria-current={c.id === actif ? "true" : undefined}>
            <label className="studio-calque-nom">
              <input type="radio" name="studio-calque-actif" checked={c.id === actif} onChange={() => surActif(c.id)} />
              {c.implicite ? <span>{c.name}</span> : <span translate="no">{c.name}</span>}
              <small>({compte(c.id)})</small>
            </label>
            <label className="studio-calque-option"><input type="checkbox" checked={c.visible} disabled={!modifiable} onChange={(e) => surReglage({ ...c, visible: e.target.checked })} />Visible</label>
            <label className="studio-calque-option"><input type="checkbox" checked={c.locked} disabled={!modifiable} onChange={(e) => surReglage({ ...c, locked: e.target.checked })} />Verrouillé</label>
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); surRenommer(); }}>
        <fieldset disabled={!modifiable}>
          <label>Nom du calque actif<input ref={nomRef} maxLength={80} required value={nom} onChange={(e) => surNom(e.target.value)} /></label>
          <button type="submit" data-studio-renommer-calque><Icon name="studio-layer-edit" size={18} /> Renommer le calque</button>
        </fieldset>
      </form>
      <p className="studio-calques-aide">Un calque masqué n’est pas dessiné ; un calque verrouillé reste visible mais ne se sélectionne ni ne se modifie.</p>
    </section>
  );
}
