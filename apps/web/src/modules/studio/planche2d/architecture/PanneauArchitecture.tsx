/**
 * Panneau « Architecture » (A.4) : paramètres saisis des outils Mur et Ouverture (création au pointeur ou au clavier),
 * puis, pour le mur ou l'ouverture sélectionné(e) — dans la planche 2D comme dans la vue 3D, même identifiant —, ses
 * valeurs telles que saisies, leur modification (`studio.architecture.modifier`), son métré (volume brut, déduction des
 * ouvertures déclarées, volume net) et sa suppression (une cascade explicite pour un mur qui porte des ouvertures).
 * Aucune valeur n'est proposée ; un refus du modèle est affiché tel quel par l'espace de travail.
 */
import { useEffect, useState, type FormEvent } from "react";
import { studioQuantitesArchitecture, type StudioCommand, type StudioDocument, type StudioOpeningKind, type StudioWallJustification } from "@parcours/atelier-model";
import { Icon } from "../../../../components/Icon";
import { LOCALE } from "../../../../lib/i18n";
import { lireSommets } from "../geometrie-2d";
import type { StudioToolId } from "../raccourcis";
import {
  commandeModifierArchitecture, commandeMur, commandeOuverture, editionDe, elementArchitectural, LIBELLES_JUSTIFICATION, LIBELLES_TYPE_OUVERTURE, mursDu,
  type ContexteArchitecture, type EditionArchitecture, type ParametresArchitecture, type ResultatArchitecture,
} from "./architecture-ui";
import "../rendus/architecture.css";

export interface PropsPanneauArchitecture {
  doc: StudioDocument;
  outil: StudioToolId;
  /** Objet architectural sélectionné (planche 2D ou vue 3D). */
  selection: string | null;
  modifiable: boolean;
  parametres: ParametresArchitecture;
  surParametres: (p: ParametresArchitecture) => void;
  contexte: () => ContexteArchitecture;
  /** Applique un lot au brouillon ; faux si le modèle le refuse (l'espace de travail affiche le refus). */
  surCommandes: (cs: StudioCommand[]) => boolean;
  surErreur: (message: string) => void;
  surSelection: (id: string | null) => void;
}

const m3 = (v: number) => `${v.toLocaleString(LOCALE, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m³`;

function Nombre({ nom, libelle, valeur, surValeur }: { nom: string; libelle: string; valeur: number; surValeur: (v: number) => void }) {
  return <label>{libelle}<input type="number" step="any" required name={nom} value={Number.isFinite(valeur) ? valeur : ""} onChange={(e) => surValeur(e.target.value === "" ? Number.NaN : e.target.valueAsNumber)} data-studio-champ-architecture={nom} /></label>;
}
function Justification({ valeur, surValeur, vide }: { valeur: StudioWallJustification | ""; surValeur: (v: StudioWallJustification) => void; vide: boolean }) {
  return <label>Justification<select required value={valeur} onChange={(e) => surValeur(e.target.value as StudioWallJustification)} data-studio-champ-architecture="justification">
    {vide && <option value="">Choisir…</option>}
    {(Object.keys(LIBELLES_JUSTIFICATION) as StudioWallJustification[]).map((j) => <option key={j} value={j}>{LIBELLES_JUSTIFICATION[j]}</option>)}
  </select></label>;
}
function TypeOuverture({ valeur, surValeur }: { valeur: StudioOpeningKind | ""; surValeur: (v: StudioOpeningKind | "") => void }) {
  return <label>Type déclaré<select value={valeur} onChange={(e) => surValeur(e.target.value as StudioOpeningKind | "")} data-studio-champ-architecture="type">
    <option value="">Non déclaré</option>
    {(Object.keys(LIBELLES_TYPE_OUVERTURE) as StudioOpeningKind[]).map((k) => <option key={k} value={k}>{LIBELLES_TYPE_OUVERTURE[k]}</option>)}
  </select></label>;
}

export function PanneauArchitecture({ doc, outil, selection, modifiable, parametres, surParametres, contexte, surCommandes, surErreur, surSelection }: PropsPanneauArchitecture) {
  const choisi = elementArchitectural(doc, selection);
  const murs = mursDu(doc);
  const [axe, setAxe] = useState("");
  const [hote, setHote] = useState("");
  const [position, setPosition] = useState(Number.NaN);
  const [saisie, setSaisie] = useState<{ id: string; e: EditionArchitecture } | null>(null);
  // Les valeurs éditées reprennent celles de l'objet choisi (et après chaque modification acceptée ou annulée).
  useEffect(() => { setSaisie(null); }, [choisi]);
  const edition = choisi ? (saisie?.id === choisi.id ? saisie.e : editionDe(choisi)) : null;
  const setEdition = (e: EditionArchitecture) => { if (choisi) setSaisie({ id: choisi.id, e }); };
  const quantites = (() => { try { return studioQuantitesArchitecture(doc.architecture ?? []); } catch { return []; } })();
  const q = quantites.find((x) => x.id === selection);
  const envoyer = (r: ResultatArchitecture, apres?: () => void) => {
    if ("erreur" in r) { surErreur(r.erreur); return; }
    if (surCommandes(r.commandes)) apres?.();
  };
  const p = parametres;

  function creerMur(e: FormEvent) {
    e.preventDefault();
    const points = lireSommets(axe);
    if (!points || points.length < 2) { surErreur("Axe : saisissez deux points au moins, « x y ; x y », en mètres."); return; }
    const c = contexte();
    let id = "";
    envoyer(commandeMur({ ...c, nouvelId: () => (id = c.nouvelId()) }, points, p.mur), () => surSelection(id));
  }
  function creerOuverture(e: FormEvent) {
    e.preventDefault();
    if (!hote) { surErreur("Choisissez le mur hôte : une ouverture n’existe que dans un mur."); return; }
    const c = contexte();
    let id = "";
    envoyer(commandeOuverture({ ...c, nouvelId: () => (id = c.nouvelId()) }, hote, position, p.ouverture), () => surSelection(id));
  }
  function modifier(e: FormEvent) {
    e.preventDefault();
    if (choisi && edition) envoyer(commandeModifierArchitecture(choisi, edition, lireSommets));
  }
  const supprimer = (cascade: boolean) => {
    if (!choisi) return;
    const cs: StudioCommand[] = cascade ? [{ toolId: "studio.architecture.supprimer", params: { ids: [choisi.id], cascade: true } }] : [{ toolId: "studio.dessin.supprimer", params: { ids: [choisi.id] } }];
    if (surCommandes(cs)) surSelection(null);
  };

  return <section className="studio-architecture-panneau" aria-label="Architecture" data-studio-architecture-panneau="">
    {outil === "studio.architecture.mur" && <form onSubmit={creerMur} data-studio-architecture-mur-formulaire="" aria-labelledby="studio-architecture-mur">
      <h3 id="studio-architecture-mur"><Icon name="studio-wall" size={18} /> Mur</h3>
      <p className="studio-hint">Cliquez le début puis la fin de l’axe sur la planche, ou saisissez l’axe. Aucune dimension n’est proposée.</p>
      <fieldset disabled={!modifiable}>
        <Nombre nom="mur-epaisseur" libelle="Épaisseur (m)" valeur={p.mur.epaisseur} surValeur={(epaisseur) => surParametres({ ...p, mur: { ...p.mur, epaisseur } })} />
        <Nombre nom="mur-hauteur" libelle="Hauteur (m)" valeur={p.mur.hauteur} surValeur={(hauteur) => surParametres({ ...p, mur: { ...p.mur, hauteur } })} />
        <Nombre nom="mur-base" libelle="Cote de base z (m)" valeur={p.mur.base} surValeur={(base) => surParametres({ ...p, mur: { ...p.mur, base } })} />
        <Justification valeur={p.mur.justification} vide surValeur={(justification) => surParametres({ ...p, mur: { ...p.mur, justification } })} />
        <label>Axe (x y ; …)<input type="text" value={axe} onChange={(e) => setAxe(e.target.value)} data-studio-champ-architecture="axe" /></label>
        <button type="submit" data-studio-creer-mur><Icon name="studio-wall" size={18} /> Créer le mur</button>
      </fieldset>
    </form>}

    {outil === "studio.architecture.ouverture" && <form onSubmit={creerOuverture} data-studio-architecture-ouverture-formulaire="" aria-labelledby="studio-architecture-ouverture">
      <h3 id="studio-architecture-ouverture"><Icon name="studio-opening" size={18} /> Ouverture</h3>
      <p className="studio-hint">Cliquez sur un mur (l’ouverture est centrée sur le point), ou choisissez le mur et la position de son bord de début le long de l’axe.</p>
      <fieldset disabled={!modifiable}>
        <Nombre nom="ouverture-largeur" libelle="Largeur (m)" valeur={p.ouverture.largeur} surValeur={(largeur) => surParametres({ ...p, ouverture: { ...p.ouverture, largeur } })} />
        <Nombre nom="ouverture-hauteur" libelle="Hauteur (m)" valeur={p.ouverture.hauteur} surValeur={(hauteur) => surParametres({ ...p, ouverture: { ...p.ouverture, hauteur } })} />
        <Nombre nom="ouverture-allege" libelle="Allège (m)" valeur={p.ouverture.allege} surValeur={(allege) => surParametres({ ...p, ouverture: { ...p.ouverture, allege } })} />
        <TypeOuverture valeur={p.ouverture.type} surValeur={(type) => surParametres({ ...p, ouverture: { ...p.ouverture, type } })} />
        <label>Mur hôte<select value={hote} onChange={(e) => setHote(e.target.value)} data-studio-champ-architecture="hote">
          <option value="">Choisir un mur…</option>
          {murs.map((w, i) => <option key={w.id} value={w.id}>{`Mur ${i + 1}`}</option>)}
        </select></label>
        <Nombre nom="ouverture-position" libelle="Position le long de l’axe (m)" valeur={position} surValeur={setPosition} />
        <button type="submit" data-studio-creer-ouverture><Icon name="studio-opening" size={18} /> Créer l’ouverture</button>
      </fieldset>
    </form>}

    {(doc.architecture?.length ?? 0) > 0 && <div data-studio-architecture-liste="">
      <h3>Murs et ouvertures</h3>
      <ul>{(doc.architecture ?? []).map((x) => <li key={x.id}>
        <button type="button" aria-pressed={x.id === selection} onClick={() => surSelection(x.id === selection ? null : x.id)} data-studio-architecture-choisir={x.id} data-studio-type={x.type}>
          <Icon name={x.type === "wall" ? "studio-wall" : "studio-opening"} size={16} /> {x.type === "wall" ? `Mur ${murs.findIndex((w) => w.id === x.id) + 1}` : x.kind ? LIBELLES_TYPE_OUVERTURE[x.kind] : "Ouverture"} <span translate="no">{x.id.slice(0, 8)}</span>
        </button>
      </li>)}</ul>
    </div>}

    {choisi && edition && <form onSubmit={modifier} data-studio-architecture-choisi={choisi.id} data-studio-type={choisi.type} aria-label="Objet architectural sélectionné">
      <h3><Icon name="studio-architecture-edit" size={18} /> {choisi.type === "wall" ? "Mur sélectionné" : "Ouverture sélectionnée"}</h3>
      {q?.type === "wall" && <dl data-studio-architecture-metre="" data-studio-volume-brut={q.volumeBrut} data-studio-volume-deduit={q.deduction} data-studio-volume-net={q.volumeNet}>
        <dt>Volume brut</dt><dd translate="no">{m3(q.volumeBrut)}</dd>
        <dt>{`Déduction des ouvertures déclarées (${q.ouvertures})`}</dt><dd translate="no">{m3(q.deduction)}</dd>
        <dt>Volume net</dt><dd translate="no">{m3(q.volumeNet)}</dd>
      </dl>}
      <fieldset disabled={!modifiable}>
        {edition.type === "wall" ? <>
          <label>Axe (x y ; …)<input type="text" required value={edition.axe} onChange={(e) => setEdition({ ...edition, axe: e.target.value })} data-studio-champ-architecture="edition-axe" /></label>
          <Nombre nom="edition-epaisseur" libelle="Épaisseur (m)" valeur={edition.epaisseur} surValeur={(epaisseur) => setEdition({ ...edition, epaisseur })} />
          <Nombre nom="edition-hauteur" libelle="Hauteur (m)" valeur={edition.hauteur} surValeur={(hauteur) => setEdition({ ...edition, hauteur })} />
          <Nombre nom="edition-base" libelle="Cote de base z (m)" valeur={edition.base} surValeur={(base) => setEdition({ ...edition, base })} />
          <Justification valeur={edition.justification} vide={false} surValeur={(justification) => setEdition({ ...edition, justification })} />
        </> : <>
          <Nombre nom="edition-position" libelle="Position le long de l’axe (m)" valeur={edition.position} surValeur={(position) => setEdition({ ...edition, position })} />
          <Nombre nom="edition-largeur" libelle="Largeur (m)" valeur={edition.largeur} surValeur={(largeur) => setEdition({ ...edition, largeur })} />
          <Nombre nom="edition-hauteur" libelle="Hauteur (m)" valeur={edition.hauteur} surValeur={(hauteur) => setEdition({ ...edition, hauteur })} />
          <Nombre nom="edition-allege" libelle="Allège (m)" valeur={edition.allege} surValeur={(allege) => setEdition({ ...edition, allege })} />
          <TypeOuverture valeur={edition.genre} surValeur={(genre) => setEdition({ ...edition, genre })} />
        </>}
        <div className="studio-architecture-actions">
          <button type="submit" data-studio-modifier-architecture><Icon name="studio-architecture-edit" size={18} /> Appliquer</button>
          <button type="button" onClick={() => supprimer(false)} data-studio-supprimer-architecture><Icon name="studio-delete" size={18} /> Supprimer</button>
          {choisi.type === "wall" && <button type="button" onClick={() => supprimer(true)} data-studio-supprimer-cascade><Icon name="studio-architecture-delete" size={18} /> Supprimer le mur et ses ouvertures</button>}
        </div>
      </fieldset>
    </form>}
  </section>;
}
