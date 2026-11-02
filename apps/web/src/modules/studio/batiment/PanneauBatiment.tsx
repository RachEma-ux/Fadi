/**
 * Panneau « Bâtiment » (lot W3-B, X.1-04) : niveaux comme objets (nom, cote ; déplacement répercuté sur leurs objets ;
 * vue par niveau), composants 3D (définition partagée, occurrences, « Rendre unique ») et éléments structurels typés
 * (poteau, poutre, dalle — géométrie seulement). Ouvert par les outils Niveau (Ctrl+F2), Composant (Ctrl+F3),
 * Occurrence de composant (Ctrl+F6) et Élément structurel (Ctrl+F7) : tout se saisit au clavier, aucune valeur n'est
 * proposée. Un refus du modèle est affiché tel quel par l'espace de travail.
 */
import { useState, type FormEvent } from "react";
import { studioMembresNiveau, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { lireSommets } from "../planche2d/geometrie-2d";
import type { StudioToolId } from "../planche2d/raccourcis";
import { degresOrientation } from "../planche2d/architecture/architecture-ui";
import {
  commandeComposant, commandeNiveau, commandeOccurrence, commandeRendreUnique, commandeStructure, commandeSupprimerNiveau, composantsDu, ecrireBoites, LIBELLES_TYPE_STRUCTURE, niveauxDu,
  occurrencesDu, SAISIE_STRUCTURE_VIDE, VUE_SANS_NIVEAU, type ChoixVueNiveau, type ContexteBatiment, type ResultatBatiment, type SaisieOccurrence, type SaisieStructure, type TypeStructure,
} from "./batiment-ui";

export interface PropsPanneauBatiment {
  doc: StudioDocument;
  outil: StudioToolId;
  modifiable: boolean;
  contexte: () => ContexteBatiment;
  /** Applique un lot au brouillon ; faux si le modèle le refuse. */
  surCommandes: (cs: StudioCommand[]) => boolean;
  surErreur: (message: string) => void;
  /** Vue par niveau de la planche et de la vue 3D (null : tous les niveaux). */
  vueNiveau: ChoixVueNiveau;
  surVueNiveau: (v: ChoixVueNiveau) => void;
  masquerLibres: boolean;
  surMasquerLibres: (v: boolean) => void;
}

const m = (v: number) => `${v.toLocaleString(LOCALE, { maximumFractionDigits: 3 })} m`;

function Nombre({ nom, libelle, valeur, surValeur }: { nom: string; libelle: string; valeur: number; surValeur: (v: number) => void }) {
  return <label>{libelle}<input type="number" step="any" required name={nom} value={Number.isFinite(valeur) ? valeur : ""} onChange={(e) => surValeur(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)} data-studio-champ-batiment={nom} /></label>;
}
function ChoixNiveau({ doc, valeur, surValeur, nom }: { doc: StudioDocument; valeur: string; surValeur: (v: string) => void; nom: string }) {
  return <label>Niveau<select value={valeur} onChange={(e) => surValeur(e.target.value)} data-studio-champ-batiment={nom}>
    <option value="">Aucun niveau (cote absolue)</option>
    {niveauxDu(doc).map((n) => <option key={n.id} value={n.id}>{`${n.nom} — ${m(n.cote)}`}</option>)}
  </select></label>;
}

export function PanneauBatiment({ doc, outil, modifiable, contexte, surCommandes, surErreur, vueNiveau, surVueNiveau, masquerLibres, surMasquerLibres }: PropsPanneauBatiment) {
  const niveaux = niveauxDu(doc), composants = composantsDu(doc), occurrences = occurrencesDu(doc);
  const [nomNiveau, setNomNiveau] = useState("");
  const [coteNiveau, setCoteNiveau] = useState(Number.NaN);
  const [editionNiveau, setEditionNiveau] = useState<{ id: string; nom: string; cote: number } | null>(null);
  const [composant, setComposant] = useState<{ id?: string; nom: string; boites: string }>({ nom: "", boites: "" });
  const [occ, setOcc] = useState<SaisieOccurrence>({ composantId: "", niveauId: "", x: Number.NaN, y: Number.NaN, z: Number.NaN, orientation: Number.NaN });
  const [structure, setStructure] = useState<SaisieStructure>(SAISIE_STRUCTURE_VIDE);
  const envoyer = (r: ResultatBatiment, apres?: () => void) => {
    if ("erreur" in r) { surErreur(r.erreur); return; }
    if (surCommandes(r.commandes)) apres?.();
  };

  function creerNiveau(e: FormEvent) {
    e.preventDefault();
    envoyer(commandeNiveau(contexte(), { nom: nomNiveau, cote: coteNiveau }), () => { setNomNiveau(""); setCoteNiveau(Number.NaN); });
  }
  function modifierNiveau(e: FormEvent) {
    e.preventDefault();
    if (editionNiveau) envoyer(commandeNiveau(contexte(), editionNiveau), () => setEditionNiveau(null));
  }
  function definirComposant(e: FormEvent) {
    e.preventDefault();
    envoyer(commandeComposant(contexte(), composant, composants.find((c) => c.id === composant.id)), () => setComposant({ nom: "", boites: "" }));
  }
  function placer(e: FormEvent) {
    e.preventDefault();
    envoyer(commandeOccurrence(contexte(), doc, occ, occurrences.find((o) => o.id === occ.id)), () => setOcc({ ...occ, id: undefined }));
  }
  function creerStructure(e: FormEvent) {
    e.preventDefault();
    envoyer(commandeStructure(contexte(), doc, structure, lireSommets));
  }
  const editerOccurrence = (id: string) => {
    const o = occurrences.find((x) => x.id === id)!;
    const n = o.niveauId ? doc.niveaux?.find((x) => x.id === o.niveauId) : undefined;
    setOcc({ id, composantId: o.composantId, niveauId: o.niveauId ?? "", x: o.placement.origin.x, y: o.placement.origin.y, z: o.placement.origin.z - (n?.cote ?? 0), orientation: degresOrientation(o.placement.rotation) });
  };

  return <section className="studio-architecture-panneau" aria-label="Bâtiment" data-studio-batiment-panneau="">
    <fieldset data-studio-vue-niveau-reglage="">
      <legend><Icon name="studio-level" size={16} /> Vue par niveau</legend>
      <label>Afficher<select value={vueNiveau ?? ""} onChange={(e) => surVueNiveau(e.target.value === "" ? null : e.target.value)} data-studio-vue-niveau="">
        <option value="">Tous les niveaux</option>
        {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
        <option value={VUE_SANS_NIVEAU}>Objets sans niveau</option>
      </select></label>
      <label><input type="checkbox" checked={masquerLibres} onChange={(e) => surMasquerLibres(e.target.checked)} data-studio-vue-niveau-libres="" /> Masquer la géométrie libre (sans niveau)</label>
    </fieldset>

    {outil === "studio.niveau.definir" && <div data-studio-batiment-niveaux="">
      <form onSubmit={creerNiveau} aria-labelledby="studio-batiment-niveau" data-studio-niveau-formulaire="">
        <h3 id="studio-batiment-niveau"><Icon name="studio-level" size={18} /> Niveau</h3>
        <p className="studio-hint">Un niveau a un nom et une cote saisis. Changer la cote d’un niveau déplace tous ses objets du même écart.</p>
        <fieldset disabled={!modifiable}>
          <label>Nom<input type="text" required value={nomNiveau} onChange={(e) => setNomNiveau(e.target.value)} data-studio-champ-batiment="niveau-nom" /></label>
          <Nombre nom="niveau-cote" libelle="Cote du niveau z (m)" valeur={coteNiveau} surValeur={setCoteNiveau} />
          <button type="submit" data-studio-creer-niveau><Icon name="studio-level" size={18} /> Créer le niveau</button>
        </fieldset>
      </form>
      {niveaux.length > 0 && <ul data-studio-niveaux-liste="">{niveaux.map((n) => {
        const membres = studioMembresNiveau(doc, n.id).size;
        return <li key={n.id} data-studio-niveau={n.id} data-studio-niveau-cote={n.cote} data-studio-niveau-membres={membres}>
          {editionNiveau?.id === n.id ? <form onSubmit={modifierNiveau} aria-label="Modifier le niveau">
            <fieldset disabled={!modifiable}>
              <label>Nom<input type="text" required value={editionNiveau.nom} onChange={(e) => setEditionNiveau({ ...editionNiveau, nom: e.target.value })} data-studio-champ-batiment="edition-niveau-nom" /></label>
              <Nombre nom="edition-niveau-cote" libelle="Cote du niveau z (m)" valeur={editionNiveau.cote} surValeur={(cote) => setEditionNiveau({ ...editionNiveau, cote })} />
              <button type="submit" data-studio-modifier-niveau><Icon name="studio-level" size={18} /> Appliquer</button>
            </fieldset>
          </form> : <>
            <span>{n.nom}</span> <span translate="no">{m(n.cote)}</span> <span>{`${membres} objet(s)`}</span>
            <button type="button" disabled={!modifiable} onClick={() => setEditionNiveau({ id: n.id, nom: n.nom, cote: n.cote })} data-studio-editer-niveau={n.id}><Icon name="studio-architecture-edit" size={16} /> Modifier</button>
            <button type="button" disabled={!modifiable} onClick={() => envoyer({ commandes: commandeSupprimerNiveau(n.id) })} data-studio-supprimer-niveau={n.id}><Icon name="studio-delete" size={16} /> Supprimer</button>
          </>}
        </li>;
      })}</ul>}
    </div>}

    {outil === "studio.composant.definir" && <div data-studio-batiment-composants="">
      <form onSubmit={definirComposant} aria-labelledby="studio-batiment-composant" data-studio-composant-formulaire="">
        <h3 id="studio-batiment-composant"><Icon name="studio-component" size={18} /> {composant.id ? "Modifier le composant" : "Composant"}</h3>
        <p className="studio-hint">Une définition partagée : ses boîtes, « x y z largeur profondeur hauteur » (m, repère du composant), une par ligne. La modifier change toutes ses occurrences.</p>
        <fieldset disabled={!modifiable}>
          <label>Nom<input type="text" required value={composant.nom} onChange={(e) => setComposant({ ...composant, nom: e.target.value })} data-studio-champ-batiment="composant-nom" /></label>
          <label>Boîtes<textarea required rows={3} value={composant.boites} onChange={(e) => setComposant({ ...composant, boites: e.target.value })} data-studio-champ-batiment="composant-boites" /></label>
          <button type="submit" data-studio-definir-composant><Icon name="studio-component" size={18} /> {composant.id ? "Appliquer à toutes les occurrences" : "Définir le composant"}</button>
        </fieldset>
      </form>
      {composants.length > 0 && <ul data-studio-composants-liste="">{composants.map((c) => <li key={c.id} data-studio-composant={c.id} data-studio-composant-occurrences={occurrences.filter((o) => o.composantId === c.id).length}>
        <span>{c.nom}</span> <span>{`${occurrences.filter((o) => o.composantId === c.id).length} occurrence(s)`}</span>
        <button type="button" disabled={!modifiable} onClick={() => setComposant({ id: c.id, nom: c.nom, boites: ecrireBoites(c) })} data-studio-editer-composant={c.id}><Icon name="studio-architecture-edit" size={16} /> Modifier</button>
        <button type="button" disabled={!modifiable} onClick={() => envoyer({ commandes: [{ toolId: "studio.dessin.supprimer", params: { ids: [c.id] } }] })} data-studio-supprimer-composant={c.id}><Icon name="studio-delete" size={16} /> Supprimer</button>
      </li>)}</ul>}
    </div>}

    {outil === "studio.composant.placer" && <div data-studio-batiment-occurrences="">
      <form onSubmit={placer} aria-labelledby="studio-batiment-occurrence" data-studio-occurrence-formulaire="">
        <h3 id="studio-batiment-occurrence"><Icon name="studio-component-instance" size={18} /> {occ.id ? "Replacer l’occurrence" : "Occurrence de composant"}</h3>
        <p className="studio-hint">Une occurrence désigne sa définition : elle n’en copie pas la géométrie. La cote est relative au niveau choisi.</p>
        <fieldset disabled={!modifiable}>
          <label>Composant<select required value={occ.composantId} onChange={(e) => setOcc({ ...occ, composantId: e.target.value })} data-studio-champ-batiment="occurrence-composant">
            <option value="">Choisir…</option>
            {composants.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
          </select></label>
          <ChoixNiveau doc={doc} nom="occurrence-niveau" valeur={occ.niveauId} surValeur={(niveauId) => setOcc({ ...occ, niveauId })} />
          <Nombre nom="occurrence-x" libelle="Origine x (m)" valeur={occ.x} surValeur={(x) => setOcc({ ...occ, x })} />
          <Nombre nom="occurrence-y" libelle="Origine y (m)" valeur={occ.y} surValeur={(y) => setOcc({ ...occ, y })} />
          <Nombre nom="occurrence-z" libelle="Cote de base (m)" valeur={occ.z} surValeur={(z) => setOcc({ ...occ, z })} />
          <Nombre nom="occurrence-orientation" libelle="Orientation (degrés)" valeur={occ.orientation} surValeur={(orientation) => setOcc({ ...occ, orientation })} />
          <button type="submit" data-studio-placer-occurrence><Icon name="studio-component-instance" size={18} /> {occ.id ? "Replacer" : "Placer l’occurrence"}</button>
        </fieldset>
      </form>
      {occurrences.length > 0 && <ul data-studio-occurrences-liste="">{occurrences.map((o) => <li key={o.id} data-studio-occurrence={o.id} data-studio-occurrence-composant={o.composantId}>
        <span>{composants.find((c) => c.id === o.composantId)?.nom ?? o.composantId}</span> <span translate="no">{o.id.slice(0, 8)}</span>
        <button type="button" disabled={!modifiable} onClick={() => editerOccurrence(o.id)} data-studio-editer-occurrence={o.id}><Icon name="studio-architecture-edit" size={16} /> Replacer</button>
        <button type="button" disabled={!modifiable} onClick={() => envoyer(commandeRendreUnique(contexte(), doc, o.id))} data-studio-rendre-unique={o.id}><Icon name="studio-component" size={16} /> Rendre unique</button>
        <button type="button" disabled={!modifiable} onClick={() => envoyer({ commandes: [{ toolId: "studio.dessin.supprimer", params: { ids: [o.id] } }] })} data-studio-supprimer-occurrence={o.id}><Icon name="studio-delete" size={16} /> Supprimer</button>
      </li>)}</ul>}
    </div>}

    {outil === "studio.structure.element" && <form onSubmit={creerStructure} aria-labelledby="studio-batiment-structure" data-studio-structure-formulaire="">
      <h3 id="studio-batiment-structure"><Icon name="studio-structure" size={18} /> Élément structurel</h3>
      <p className="studio-hint">Poteau, poutre ou dalle : géométrie seulement, aucune vérification structurelle. Sections et épaisseurs sont celles que vous saisissez ; la cote est relative au niveau choisi.</p>
      <fieldset disabled={!modifiable}>
        <label>Type<select required value={structure.type} onChange={(e) => setStructure({ ...structure, type: e.target.value as TypeStructure | "" })} data-studio-champ-batiment="structure-type">
          <option value="">Choisir…</option>
          {(Object.keys(LIBELLES_TYPE_STRUCTURE) as TypeStructure[]).map((t) => <option key={t} value={t}>{LIBELLES_TYPE_STRUCTURE[t]}</option>)}
        </select></label>
        <ChoixNiveau doc={doc} nom="structure-niveau" valeur={structure.niveauId} surValeur={(niveauId) => setStructure({ ...structure, niveauId })} />
        <label>{structure.type === "beam" ? "Axe (x y ; x y)" : structure.type === "slab" ? "Contour (x y ; …)" : "Centre de la section (x y)"}<input type="text" required value={structure.geometrie} onChange={(e) => setStructure({ ...structure, geometrie: e.target.value })} data-studio-champ-batiment="structure-geometrie" /></label>
        {structure.type !== "slab" && <Nombre nom="structure-largeur" libelle="Largeur de section (m)" valeur={structure.largeur} surValeur={(largeur) => setStructure({ ...structure, largeur })} />}
        {structure.type === "column" && <Nombre nom="structure-profondeur" libelle="Profondeur de section (m)" valeur={structure.profondeur} surValeur={(profondeur) => setStructure({ ...structure, profondeur })} />}
        <Nombre nom="structure-hauteur" libelle={structure.type === "slab" ? "Épaisseur (m)" : structure.type === "beam" ? "Hauteur de section (m)" : "Hauteur (m)"} valeur={structure.hauteur} surValeur={(hauteur) => setStructure({ ...structure, hauteur })} />
        <Nombre nom="structure-base" libelle="Cote de base (m)" valeur={structure.base} surValeur={(base) => setStructure({ ...structure, base })} />
        {structure.type === "column" && <Nombre nom="structure-orientation" libelle="Orientation (degrés)" valeur={structure.orientation} surValeur={(orientation) => setStructure({ ...structure, orientation })} />}
        <button type="submit" data-studio-creer-structure><Icon name="studio-structure" size={18} /> Créer l’élément</button>
      </fieldset>
    </form>}
  </section>;
}
