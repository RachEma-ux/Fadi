/**
 * Cas 2 du catalogue, lot 8 (27 novembre 2026) : panneaux des outils de modélisation, selon les maquettes acceptées
 * le 27 novembre (lot8-1 à lot8-4) :
 * - « Info entité · Extrusion » : hauteur d'une extrusion modifiable, couches en une saisie, prolonger une arête, murs
 *   en couches depuis un tracé (n° 39, 71, 98, 35) ;
 * - « Composants dynamiques » : fenêtre, porte, baie et garde-corps lus de fichiers d'agence archivés, ajustés à la baie,
 *   ouverture découpée qui suit, remplacement (n° 32, 61, 79, 25, 88) ;
 * - « Soustraire et garder » : partie retirée gardée, calage par deux points, sélection par altitudes ou boîte 3D, miroir
 *   lisible, écrêtage par une enveloppe (n° 99, 68, 72, 50, 100, 104, 16) ;
 * - « Vue orthographique » : projection exacte, axonométrie éclatée, échelle graphique, aire projetée, longueur vraie des
 *   courbes (n° 12, 19, 29, 15, 114).
 * Aucune donnée : épaisseurs, hauteurs, altitudes, écarts, noms et vides sont saisis ; les composants viennent de fichiers.
 */
import { useState } from "react";
import { VALEURS_COMPOSANT, secondTemps, type FichierComposant, type GenreComposant } from "@parcours/sandbox-planche-model";
import { t, type CleMessage } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_MODELISATION, type Disponibilite, type IdCommandeModelisation } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const commande = (id: IdCommandeModelisation) => COMMANDES_MODELISATION.find((c) => c.id === id)!;

/** Raccourci affiché dans le titre d'un panneau du lot 8 (maquettes : « Info entité · Extrusion  Ctrl+Maj+Espace, 1 »). */
export const RACCOURCI_PANNEAU_L8: Readonly<Record<string, string>> = {
  extrusion: commande("extrusion-hauteur").raccourci,
  "composants-agence": commande("composants-agence").raccourci,
  soustraire: commande("soustraire-garder").raccourci,
  "vues-mesures": commande("vue-ortho").raccourci,
};

/** Bouton d'une commande du lot 8 : icône, libellé, seconde touche, motif d'indisponibilité. */
export function BoutonL8({ id, d, onClick, principal = false }: { id: IdCommandeModelisation; d: Disponibilite; onClick: () => void; principal?: boolean }) {
  const c = commande(id);
  return (
    <button
      type="button"
      className={principal ? "planche-bouton-principal" : undefined}
      disabled={!d.disponible}
      title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`}
      aria-keyshortcuts={c.raccourci.replace(/Maj/g, "Shift").replace(/Espace/g, "Space").replace(/, /g, " ")}
      onClick={onClick}
      data-planche-l8={id}
    >
      <Pictogramme picto={c.picto} /> {t(c.court)} <small className="planche-versions-raccourci-bouton">{afficherRaccourci(secondTemps(c.raccourci) ?? c.raccourci)}</small>
    </button>
  );
}

/** Saisies des panneaux du lot 8, tenues par la Planche (le clavier exécute avec les mêmes valeurs que les boutons). */
export interface SaisiesL8 {
  hauteur: string;
  epaisseurs: string;
  sens: "interieur" | "exterieur";
  reference: "axe" | "interieur" | "exterieur";
  hauteurMur: string;
  composant: string;
  valeurs: Readonly<Record<string, string>>;
  decouper: boolean;
  garder: boolean;
  nom: string;
  balise: string;
  altitudes: string;
  axe: "x" | "y";
  par: "niveau" | "balise";
  ecart: string;
}

export function useSaisiesL8(): [SaisiesL8, (p: Partial<SaisiesL8>) => void] {
  const [s, poser] = useState<SaisiesL8>({ hauteur: "", epaisseurs: "", sens: "interieur", reference: "axe", hauteurMur: "", composant: "", valeurs: {}, decouper: true, garder: true, nom: "", balise: "", altitudes: "", axe: "x", par: "niveau", ecart: "" });
  return [s, (p) => poser((x) => ({ ...x, ...p }))];
}

/** Champ de saisie qui ne laisse pas la Planche lire ses touches (Entrée valide). */
function Champ({ libelle, valeur, onChange, onValider, desactive = false, indication, attribut }: { libelle: string; valeur: string; onChange: (v: string) => void; onValider?: () => void; desactive?: boolean; indication?: string; attribut: string }) {
  return (
    <label className="planche-accrochage-champ">
      {libelle}
      <input value={valeur} disabled={desactive} placeholder={indication} onChange={(e) => onChange(e.target.value)} onBlur={() => onValider?.()} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") onValider?.(); }} {...{ [attribut]: "" }} />
    </label>
  );
}

function Liste<V extends string>({ libelle, valeur, options, onChange, attribut }: { libelle: string; valeur: V; options: readonly (readonly [V, string])[]; onChange: (v: V) => void; attribut: string }) {
  return (
    <label className="planche-accrochage-champ">
      {libelle}
      <select value={valeur} onChange={(e) => onChange(e.target.value as V)} onKeyDown={arreter} {...{ [attribut]: "" }}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </label>
  );
}

type Dispo = (id: IdCommandeModelisation) => Disponibilite;
type Exec = (id: IdCommandeModelisation) => void;

export function PanneauExtrusion({ s, poser, lecture, extrusion, onHauteur, executer, disponibilite, note }: { s: SaisiesL8; poser: (p: Partial<SaisiesL8>) => void; lecture: boolean; extrusion: { readonly hauteur: string } | { readonly motif: string } | null; onHauteur: () => void; executer: Exec; disponibilite: Dispo; note: string | null }) {
  return (
    <div className="planche-accrochage planche-versions" data-planche-l8-panneau="extrusion">
      <h4>{t("planche.l8.extrusion.titre")}</h4>
      <Champ libelle={t("planche.l8.extrusion.hauteur")} valeur={s.hauteur} onChange={(v) => poser({ hauteur: v })} onValider={onHauteur} desactive={lecture || !extrusion || "motif" in extrusion} indication={extrusion && "hauteur" in extrusion ? extrusion.hauteur : t("planche.l8.non-lisible")} attribut="data-planche-l8-hauteur" />
      <p className="inspecteur-aide" data-planche-l8-extrusion-note>{extrusion === null ? t("planche.l8.extrusion.aucune") : "motif" in extrusion ? extrusion.motif : t("planche.l8.extrusion.note")}</p>
      <h4>{t("planche.l8.couches.titre")}</h4>
      <Champ libelle={t("planche.l8.couches.epaisseurs")} valeur={s.epaisseurs} onChange={(v) => poser({ epaisseurs: v })} indication={t("planche.l8.couches.indication")} attribut="data-planche-l8-epaisseurs" />
      <Liste libelle={t("planche.l8.couches.sens")} valeur={s.sens} options={[["interieur", t("planche.l8.couches.interieur")], ["exterieur", t("planche.l8.couches.exterieur")]]} onChange={(v) => poser({ sens: v })} attribut="data-planche-l8-sens" />
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="creer-couches" d={disponibilite("creer-couches")} onClick={() => executer("creer-couches")} principal />
        <BoutonL8 id="prolonger-arete" d={disponibilite("prolonger-arete")} onClick={() => executer("prolonger-arete")} />
      </div>
      <h4>{t("planche.l8.mur.titre")}</h4>
      <p className="planche-l8-texte">{t("planche.l8.mur.texte")}</p>
      <Liste libelle={t("planche.l8.mur.reference")} valeur={s.reference} options={[["axe", t("planche.l8.mur.axe")], ["interieur", t("planche.l8.mur.gauche")], ["exterieur", t("planche.l8.mur.droit")]]} onChange={(v) => poser({ reference: v })} attribut="data-planche-l8-reference" />
      <Champ libelle={t("planche.l8.mur.hauteur")} valeur={s.hauteurMur} onChange={(v) => poser({ hauteurMur: v })} indication={t("planche.l8.saisir")} attribut="data-planche-l8-hauteur-mur" />
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="murs-en-couches" d={disponibilite("murs-en-couches")} onClick={() => executer("murs-en-couches")} />
      </div>
      <p className="inspecteur-aide">{t("planche.l8.couches.note")}</p>
      {note && <p className="planche-l8-note" role="status" data-planche-l8-note>{note}</p>}
    </div>
  );
}

export interface FichierAgence {
  readonly id: string;
  readonly nom: string;
  readonly fichier: FichierComposant;
  readonly texte: string;
}

const LIBELLE_VALEUR: Readonly<Record<string, CleMessage>> = {
  largeur: "planche.l8.composant.largeur",
  hauteur: "planche.l8.composant.hauteur",
  allege: "planche.l8.composant.allege",
  vantaux: "planche.l8.composant.vantaux",
  longueur: "planche.l8.composant.longueur",
  vide: "planche.l8.composant.vide",
};

export function PanneauComposantsAgence({ s, poser, lecture, fichiers, choisi, onValeurs, executer, disponibilite, note }: { s: SaisiesL8; poser: (p: Partial<SaisiesL8>) => void; lecture: boolean; fichiers: readonly FichierAgence[]; choisi: { readonly nom: string; readonly genre: GenreComposant; readonly valeurs: Readonly<Record<string, number>> } | null; onValeurs: () => void; executer: Exec; disponibilite: Dispo; note: string | null }) {
  const f = fichiers.find((x) => x.id === s.composant) ?? null;
  const genre = choisi?.genre ?? f?.fichier.genre ?? null;
  return (
    <div className="planche-accrochage planche-versions" data-planche-l8-panneau="composants-agence">
      <label className="planche-accrochage-champ">
        {t("planche.l8.composant.choix")}
        <select value={s.composant} onChange={(e) => poser({ composant: e.target.value })} onKeyDown={arreter} data-planche-l8-composant>
          {fichiers.length === 0 && <option value="">{t("planche.l8.composant.aucun")}</option>}
          {fichiers.map((x) => (
            <option key={x.id} value={x.id}>{t("planche.l8.composant.option", { nom: x.fichier.nom, genre: t(`planche.l8.genre.${x.fichier.genre}` as CleMessage) })}</option>
          ))}
        </select>
      </label>
      {choisi && <p className="planche-l8-texte" data-planche-l8-choisi>{t("planche.l8.composant.choisi", { nom: choisi.nom })}</p>}
      {genre &&
        VALEURS_COMPOSANT[genre].map((k) => (
          <Champ key={k} libelle={t(LIBELLE_VALEUR[k]!)} valeur={s.valeurs[k] ?? ""} onChange={(v) => poser({ valeurs: { ...s.valeurs, [k]: v } })} onValider={choisi ? onValeurs : undefined} desactive={lecture} indication={k === "vide" ? t("planche.l8.composant.vide-saisi") : k === "largeur" || k === "hauteur" || k === "allege" || k === "longueur" ? t("planche.l8.composant.de-la-baie") : t("planche.l8.saisir")} attribut={`data-planche-l8-valeur-${k}`} />
        ))}
      {genre !== "garde-corps" && (
        <label className="planche-accrochage-champ planche-l8-case">
          <input type="checkbox" checked={s.decouper} disabled={lecture} onChange={(e) => poser({ decouper: e.target.checked })} data-planche-l8-decouper /> {t("planche.l8.composant.decouper")}
        </label>
      )}
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="ajuster-baie" d={disponibilite("ajuster-baie")} onClick={() => executer("ajuster-baie")} principal />
        <BoutonL8 id="remplacer-occurrences" d={disponibilite("remplacer-occurrences")} onClick={() => executer("remplacer-occurrences")} />
        <BoutonL8 id="importer-composant" d={disponibilite("importer-composant")} onClick={() => executer("importer-composant")} />
      </div>
      <p className="inspecteur-aide">{t("planche.l8.composant.note")}</p>
      {note && <p className="planche-l8-note" role="status" data-planche-l8-note>{note}</p>}
    </div>
  );
}

export function PanneauSoustraire({ s, poser, balises, executer, disponibilite, note }: { s: SaisiesL8; poser: (p: Partial<SaisiesL8>) => void; balises: readonly { readonly id: string; readonly nom: string }[]; executer: Exec; disponibilite: Dispo; note: string | null }) {
  return (
    <div className="planche-accrochage planche-versions" data-planche-l8-panneau="soustraire">
      <Liste libelle={t("planche.l8.soustraire.garder")} valeur={s.garder ? "oui" : "non"} options={[["oui", t("planche.l8.soustraire.oui")], ["non", t("planche.l8.soustraire.non")]]} onChange={(v) => poser({ garder: v === "oui" })} attribut="data-planche-l8-garder" />
      {s.garder && <Champ libelle={t("planche.l8.soustraire.nom")} valeur={s.nom} onChange={(v) => poser({ nom: v })} attribut="data-planche-l8-nom" />}
      {s.garder && <Liste libelle={t("planche.l8.soustraire.balise")} valeur={s.balise} options={[["", t("planche.l8.soustraire.sans-balise")], ...balises.map((b) => [b.id, b.nom] as const)]} onChange={(v) => poser({ balise: v })} attribut="data-planche-l8-balise" />}
      <p className="inspecteur-aide">{t("planche.l8.soustraire.precision")}</p>
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="soustraire-garder" d={disponibilite("soustraire-garder")} onClick={() => executer("soustraire-garder")} principal />
        <BoutonL8 id="caler-deux-points" d={disponibilite("caler-deux-points")} onClick={() => executer("caler-deux-points")} />
      </div>
      <h4>{t("planche.l8.selection.titre")}</h4>
      <Champ libelle={t("planche.l8.selection.altitudes")} valeur={s.altitudes} onChange={(v) => poser({ altitudes: v })} indication={t("planche.l8.selection.indication")} attribut="data-planche-l8-altitudes" />
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="selection-altitudes" d={disponibilite("selection-altitudes")} onClick={() => executer("selection-altitudes")} />
        <BoutonL8 id="selection-boite" d={disponibilite("selection-boite")} onClick={() => executer("selection-boite")} />
      </div>
      <h4>{t("planche.l8.miroir.titre")}</h4>
      <Liste libelle={t("planche.l8.miroir.axe")} valeur={s.axe} options={[["x", t("planche.l8.miroir.rouge")], ["y", t("planche.l8.miroir.vert")]]} onChange={(v) => poser({ axe: v })} attribut="data-planche-l8-axe" />
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="miroir-lisible" d={disponibilite("miroir-lisible")} onClick={() => executer("miroir-lisible")} />
        <BoutonL8 id="ecreter-enveloppe" d={disponibilite("ecreter-enveloppe")} onClick={() => executer("ecreter-enveloppe")} />
      </div>
      <p className="inspecteur-aide">{t("planche.l8.miroir.note")}</p>
      {note && <p className="planche-l8-note" role="status" data-planche-l8-note>{note}</p>}
    </div>
  );
}

export function PanneauVuesMesures({ s, poser, exacte, onProjection, eclatee, echelle, aire, courbes, executer, disponibilite, note }: { s: SaisiesL8; poser: (p: Partial<SaisiesL8>) => void; exacte: boolean; onProjection: (exacte: boolean) => void; eclatee: boolean; echelle: boolean; aire: { readonly union: string; readonly somme: string } | null; courbes: { readonly facettes: string; readonly courbe: string; readonly ecart: string } | null; executer: Exec; disponibilite: Dispo; note: string | null }) {
  return (
    <div className="planche-accrochage planche-versions" data-planche-l8-panneau="vues-mesures">
      <Liste libelle={t("planche.l8.vue.projection")} valeur={exacte ? "ortho" : "perspective"} options={[["perspective", t("planche.l8.vue.perspective")], ["ortho", t("planche.l8.vue.ortho")]]} onChange={(v) => onProjection(v === "ortho")} attribut="data-planche-l8-projection" />
      <Liste libelle={t("planche.l8.vue.par")} valeur={s.par} options={[["niveau", t("planche.l8.vue.niveau")], ["balise", t("planche.l8.vue.balise")]]} onChange={(v) => poser({ par: v })} attribut="data-planche-l8-par" />
      <Champ libelle={t("planche.l8.vue.ecart")} valeur={s.ecart} onChange={(v) => poser({ ecart: v })} indication={t("planche.l8.saisir")} attribut="data-planche-l8-ecart" />
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="eclater-axonometrie" d={disponibilite("eclater-axonometrie")} onClick={() => executer("eclater-axonometrie")} principal />
        <BoutonL8 id="echelle-graphique" d={disponibilite("echelle-graphique")} onClick={() => executer("echelle-graphique")} />
      </div>
      {(eclatee || echelle) && <p className="planche-l8-texte">{[eclatee ? t("planche.l8.vue.eclatee-active") : "", echelle ? t("planche.l8.vue.echelle-active") : ""].filter(Boolean).join(" ")}</p>}
      <h4>{t("planche.l8.aire.titre")}</h4>
      <dl className="planche-l8-mesures" data-planche-l8-aire>
        <dt>{t("planche.l8.aire.union")}</dt>
        <dd>{aire?.union ?? t("planche.l8.non-evaluee")}</dd>
        <dt>{t("planche.l8.aire.somme")}</dt>
        <dd>{aire?.somme ?? t("planche.l8.non-evaluee")}</dd>
      </dl>
      <div className="planche-debit-barre planche-gabarit-barre">
        <BoutonL8 id="aire-projetee" d={disponibilite("aire-projetee")} onClick={() => executer("aire-projetee")} />
      </div>
      {courbes && (
        <dl className="planche-l8-mesures" data-planche-l8-courbes>
          <dt>{t("planche.l8.courbe.vraie")}</dt>
          <dd>{courbes.courbe}</dd>
          <dt>{t("planche.l8.courbe.facettes")}</dt>
          <dd>{courbes.facettes}</dd>
          <dt>{t("planche.l8.courbe.ecart")}</dt>
          <dd>{courbes.ecart}</dd>
        </dl>
      )}
      <p className="inspecteur-aide">{t("planche.l8.courbe.note")}</p>
      {note && <p className="planche-l8-note" role="status" data-planche-l8-note>{note}</p>}
    </div>
  );
}
