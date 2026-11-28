/**
 * Cas 2 du catalogue, lot 6 (27 novembre 2026) : panneaux des échanges, selon les maquettes acceptées le 27 novembre.
 * - « Import · rapport d'échange » : rapport chiffré (écrits, omis, approchés, refusés), représentations non lues,
 *   rangement par étage et par classe, données IFC de l'objet sélectionné (n° 2, 6, 22, 91).
 * - « Exporter » : format, coordonnées, unité et repère réellement écrits, objets non affichés à inclure, rapport prévu
 *   (n° 6, 90, 95).
 * - « Fichier natif et image » : Planche complète au format natif contrôlé par son empreinte, image de la vue à une
 *   définition choisie, fond transparent en option (n° 36, 53).
 * - « Coller un tracé » : contenu reconnu, unité (demandée si absente), échelle, plan de pose (n° 112).
 * Aucune donnée : tout vient du fichier, de la Planche ou de la saisie.
 */
import { useEffect, useState } from "react";
import {
  disponibiliteCoordonnees,
  empreinteCourte,
  type BrancheEtage,
  type CoordonneesExport,
  type DonneesIfc,
  type FormatExport,
  type LectureColle,
  type LigneRapport,
  type Modele,
  type ObjetsNonAffiches,
  type RapportEchange,
  type UniteColle,
} from "@parcours/sandbox-planche-model";
import { t, type CleMessage } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_ECHANGE, type Disponibilite, type IdCommandeEchange } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const v = (x: number | null) => (x === null ? "" : String(x));

/** Tableau du rapport : une ligne par compte, quatre colonnes. */
export function TableauRapport({ lignes, attribut }: { lignes: readonly LigneRapport[]; attribut: string }) {
  return (
    <table className="planche-rapport-echange" {...{ [attribut]: "" }}>
      <thead>
        <tr>
          <th scope="col"><span className="planche-invisible">{t("planche.echange.colonne.ligne")}</span></th>
          <th scope="col">{t("planche.echange.colonne.ecrits")}</th>
          <th scope="col">{t("planche.echange.colonne.omis")}</th>
          <th scope="col">{t("planche.echange.colonne.approches")}</th>
          <th scope="col">{t("planche.echange.colonne.refuses")}</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((l, i) => (
          <tr key={l.cle} className={i === 0 ? "est-total" : undefined} data-planche-rapport-ligne={l.cle}>
            <th scope="row">{t(`planche.echange.ligne.${l.cle}` as CleMessage)}</th>
            <td data-col="ecrits">{v(l.ecrits)}</td>
            <td data-col="omis">{v(l.omis)}</td>
            <td data-col="approches">{v(l.approches)}</td>
            <td data-col="refuses">{v(l.refuses)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const altitude = (a: number | null, sep: "." | ",") => (a === null ? t("planche.echange.altitude-non-declaree") : `${a === 0 ? "± " : a > 0 ? "+" : "−"}${Math.abs(a).toFixed(2).replace(".", sep)}`);

export function PanneauImportEchange({
  rapport,
  arbre,
  objet,
  separateur,
  archive,
}: {
  rapport: RapportEchange | null;
  arbre: readonly BrancheEtage[];
  objet: { readonly nom: string; readonly donnees: DonneesIfc } | null;
  separateur: "." | ",";
  archive: string | null;
}) {
  const [ouverts, setOuverts] = useState<ReadonlySet<string>>(new Set());
  if (!rapport) return <p className="inspecteur-aide">{t("planche.echange.import.vide")}</p>;
  const basculer = (k: string) => setOuverts((o) => (o.has(k) ? new Set([...o].filter((x) => x !== k)) : new Set([...o, k])));
  const fichierOuvert = !ouverts.has("§fichier");
  return (
    <div className="planche-accrochage planche-echange" data-planche-echange-import>
      <h4>{t("planche.echange.rapport")}</h4>
      <TableauRapport lignes={rapport.lignes} attribut="data-planche-rapport-import" />
      {rapport.nonLues.length > 0 && (
        <p className="planche-echange-avertissement" role="note" data-planche-echange-non-lues>
          {t(rapport.nonLues.length === 1 ? "planche.echange.non-lues.un" : "planche.echange.non-lues", { n: String(rapport.nonLues.length), classes: [...new Set(rapport.nonLues.map((n) => n.classe))].join(", "), objets: rapport.nonLues.map((n) => n.objet).join(", ") })}
        </p>
      )}
      {arbre.length > 0 && (
        <>
          <h4>{t("planche.echange.rangement")}</h4>
          <ul className="planche-echange-arbre" data-planche-echange-arbre>
            <li>
              <button type="button" aria-expanded={fichierOuvert} onClick={() => basculer("§fichier")}>{rapport.fichier}</button>
              {fichierOuvert && (
                <ul>
                  {arbre.map((b) => {
                    const k = b.nom ?? "§sans";
                    return (
                      <li key={k} data-planche-echange-etage={b.nom ?? ""}>
                        <button type="button" aria-expanded={ouverts.has(k)} onClick={() => basculer(k)}>
                          {b.nom ?? t("planche.echange.sans-etage")} <small>{b.nom !== null ? `${altitude(b.altitude, separateur)} · ` : ""}{t(b.objets === 1 ? "planche.echange.objets.un" : "planche.echange.objets", { n: String(b.objets) })}</small>
                        </button>
                        {ouverts.has(k) && (
                          <ul>
                            {b.classes.map((c) => (
                              <li key={c.classe} translate="no">{c.classe} <small>{c.objets}</small></li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          </ul>
        </>
      )}
      {objet && (
        <>
          <h4>{t("planche.echange.objet")}</h4>
          <dl className="planche-accrochage-genres" data-planche-echange-objet>
            <div className="planche-accrochage-ligne"><dt>{t("planche.echange.objet.nom")}</dt><dd>{objet.nom}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.echange.objet.classe")}</dt><dd translate="no">{objet.donnees.classe}</dd></div>
            <div className="planche-accrochage-ligne"><dt>GlobalId</dt><dd translate="no" data-planche-echange-globalid>{objet.donnees.globalId ?? t("planche.echange.non-evalue")}</dd></div>
            <div className="planche-accrochage-ligne"><dt>{t("planche.echange.objet.proprietes")}</dt><dd translate="no">{Object.entries(objet.donnees.proprietes).map(([k, p]) => `${k} · ${Object.keys(p).length}`).join(" ; ") || t("planche.echange.non-evalue")}</dd></div>
          </dl>
          {Object.entries(objet.donnees.proprietes).map(([k, p]) => (
            <details key={k} className="planche-echange-pset">
              <summary translate="no">{k}</summary>
              <dl className="planche-accrochage-genres">
                {Object.entries(p).map(([n, x]) => (
                  <div key={n} className="planche-accrochage-ligne"><dt translate="no">{n}</dt><dd translate="no">{x}</dd></div>
                ))}
              </dl>
            </details>
          ))}
        </>
      )}
      <p className="inspecteur-aide">{t("planche.echange.import.note")}</p>
      {archive && <p className="inspecteur-aide" role="status" data-planche-echange-archive>{archive}</p>}
    </div>
  );
}

export interface EcritExport {
  readonly unite: string;
  readonly repere: string;
  readonly origine: string | null;
}

export function PanneauExportEchange({
  modele,
  format,
  onFormat,
  coordonnees,
  onCoordonnees,
  reference,
  ecrit,
  motif,
  nonAffiches,
  inclureMasques,
  onInclureMasques,
  balisesIncluses,
  onBaliseIncluse,
  prevu,
  onExporter,
  onAnnuler,
}: {
  modele: Modele;
  format: FormatExport;
  onFormat: (f: FormatExport) => void;
  coordonnees: CoordonneesExport;
  onCoordonnees: (c: CoordonneesExport) => void;
  reference: number | null;
  ecrit: EcritExport | null;
  motif: string | null;
  nonAffiches: ObjetsNonAffiches;
  inclureMasques: boolean;
  onInclureMasques: (v: boolean) => void;
  balisesIncluses: ReadonlySet<string>;
  onBaliseIncluse: (id: string, v: boolean) => void;
  prevu: RapportEchange | null;
  onExporter: () => void;
  onAnnuler: () => void;
}) {
  const masques = nonAffiches.masques;
  return (
    <div className="planche-accrochage planche-echange" data-planche-echange-export>
      <label className="planche-accrochage-champ">
        {t("planche.echange.format")}
        <select value={format} onChange={(e) => onFormat(e.target.value as FormatExport)} onKeyDown={arreter} data-planche-echange-format>
          <option value="ifc">IFC 4</option>
          <option value="obj">OBJ</option>
          <option value="stl">STL</option>
        </select>
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.echange.coordonnees")}
        <select value={coordonnees} onChange={(e) => onCoordonnees(e.target.value as CoordonneesExport)} onKeyDown={arreter} data-planche-echange-coordonnees>
          {(["modele", "travail", "source", "projete"] as const).map((c) => (
            <option key={c} value={c} disabled={disponibiliteCoordonnees(modele, c, format, reference) !== null}>{t(`planche.reperes.exports.${c}`)}</option>
          ))}
        </select>
      </label>
      <h4>{t("planche.echange.ecrit")}</h4>
      {ecrit ? (
        <dl className="planche-accrochage-genres" data-planche-echange-ecrit>
          <div className="planche-accrochage-ligne"><dt>{t("planche.echange.unite-ecrite")}</dt><dd data-planche-echange-unite>{ecrit.unite}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.echange.repere-ecrit")}</dt><dd data-planche-echange-repere>{ecrit.repere}</dd></div>
          {ecrit.origine && <div className="planche-accrochage-ligne"><dt>{t("planche.echange.origine")}</dt><dd>{ecrit.origine}</dd></div>}
        </dl>
      ) : (
        <p className="planche-echange-avertissement" role="alert">{motif}</p>
      )}
      <h4>{t("planche.echange.non-affiches")}</h4>
      {nonAffiches.eteintes.length === 0 && masques.length === 0 && <p className="inspecteur-aide">{t("planche.echange.tout-affiche")}</p>}
      {nonAffiches.eteintes.map((b) => (
        <label key={b.balise} className="planche-echange-case">
          <input type="checkbox" checked={balisesIncluses.has(b.balise)} onChange={(e) => onBaliseIncluse(b.balise, e.target.checked)} data-planche-echange-balise={b.balise} />
          {t(b.objets === 1 ? "planche.echange.inclure-balise.un" : "planche.echange.inclure-balise", { n: String(b.objets), balise: b.nom })}
        </label>
      ))}
      {masques.length > 0 && (
        <label className="planche-echange-case">
          <input type="checkbox" checked={inclureMasques} onChange={(e) => onInclureMasques(e.target.checked)} data-planche-echange-masques />
          {masques.length === 1 ? t("planche.echange.inclure-masque.un", { nom: masques[0]!.nom }) : t("planche.echange.inclure-masques", { n: String(masques.length) })}
        </label>
      )}
      {prevu && (
        <>
          <h4>{t("planche.echange.rapport-prevu")}</h4>
          <TableauRapport lignes={prevu.lignes} attribut="data-planche-rapport-export" />
        </>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.echange.exporter")}>
        <button type="button" className="planche-bouton-principal" disabled={!ecrit} onClick={onExporter} data-planche-echange-exporter>{t("planche.echange.exporter")}</button>
        <button type="button" onClick={onAnnuler} data-planche-echange-annuler>{t("planche.echange.annuler")}</button>
      </div>
      <p className="inspecteur-aide">{t("planche.echange.export.note")}</p>
    </div>
  );
}

export interface DefinitionImage {
  readonly id: string;
  readonly largeur: number;
  readonly hauteur: number;
}

/** Définitions proposées (convention d'écran, pas une donnée de projet) ; « personnalisée » = saisie libre. */
export const DEFINITIONS_IMAGE: readonly DefinitionImage[] = [
  { id: "hd", largeur: 1920, hauteur: 1080 },
  { id: "qhd", largeur: 2560, hauteur: 1440 },
  { id: "4k", largeur: 3840, hauteur: 2160 },
];
/** Plus grand côté accepté (tampon de rendu WebGL courant). */
export const COTE_MAX_IMAGE = 8192;

/** « 3840 × 2160 », « 3840x2160 » → dimensions ; `null` si illisible ou hors bornes. */
export function lireDefinition(s: string): { largeur: number; hauteur: number } | null {
  const m = /^\s*(\d{2,5})\s*[×xX*]\s*(\d{2,5})\s*$/.exec(s);
  if (!m) return null;
  const largeur = Number(m[1]), hauteur = Number(m[2]);
  return largeur >= 16 && hauteur >= 16 && largeur <= COTE_MAX_IMAGE && hauteur <= COTE_MAX_IMAGE ? { largeur, hauteur } : null;
}

const nomDefinition = (d: DefinitionImage) => `${d.largeur} × ${d.hauteur} (${t(`planche.echange.definition.${d.id}` as CleMessage)})`;

export function PanneauNatifImage({
  dernierExport,
  reimport,
  onExporterNatif,
  onImporterNatif,
  largeur,
  hauteur,
  onTaille,
  transparent,
  onTransparent,
  onExporterImage,
  note,
  disponibilite,
}: {
  dernierExport: { readonly date: string; readonly empreinte: string } | null;
  reimport: "conforme" | "refuse" | null;
  onExporterNatif: () => void;
  onImporterNatif: () => void;
  largeur: number;
  hauteur: number;
  onTaille: (largeur: number, hauteur: number) => void;
  transparent: boolean;
  onTransparent: (v: boolean) => void;
  onExporterImage: () => void;
  note: string | null;
  disponibilite: (id: IdCommandeEchange) => Disponibilite;
}) {
  const [texte, setTexte] = useState(`${largeur} × ${hauteur}`);
  useEffect(() => setTexte(`${largeur} × ${hauteur}`), [largeur, hauteur]);
  const choisie = DEFINITIONS_IMAGE.find((d) => d.largeur === largeur && d.hauteur === hauteur)?.id ?? "personnalisee";
  const valider = () => {
    const d = lireDefinition(texte);
    if (d) onTaille(d.largeur, d.hauteur);
    else setTexte(`${largeur} × ${hauteur}`);
  };
  const c = COMMANDES_ECHANGE.find((x) => x.id === "natif-image")!;
  const d = disponibilite("natif-image");
  return (
    <div className="planche-accrochage planche-echange" data-planche-natif-image title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`}>
      <h4><Pictogramme picto={c.picto} /> {t("planche.echange.natif")}</h4>
      <div className="planche-debit-barre planche-gabarit-barre" role="toolbar" aria-label={t("planche.echange.natif")}>
        <button type="button" className="planche-bouton-principal" onClick={onExporterNatif} data-planche-natif-exporter>{t("planche.echange.natif.exporter")}</button>
        <button type="button" onClick={onImporterNatif} data-planche-natif-importer>{t("planche.echange.natif.importer")}</button>
      </div>
      {dernierExport && (
        <dl className="planche-accrochage-genres" data-planche-natif-resume>
          <div className="planche-accrochage-ligne"><dt>{t("planche.echange.natif.dernier")}</dt><dd>{dernierExport.date}</dd></div>
          <div className="planche-accrochage-ligne"><dt>{t("planche.echange.natif.empreinte")}</dt><dd translate="no" title={dernierExport.empreinte} data-planche-natif-empreinte={dernierExport.empreinte}>{empreinteCourte(dernierExport.empreinte)}</dd></div>
          {reimport && <div className="planche-accrochage-ligne"><dt>{t("planche.echange.natif.reimport")}</dt><dd className={reimport === "conforme" ? "planche-echange-conforme" : "planche-echange-refuse"} data-planche-natif-reimport={reimport}>{t(`planche.echange.natif.${reimport}`)}</dd></div>}
        </dl>
      )}
      {!dernierExport && reimport && (
        <dl className="planche-accrochage-genres">
          <div className="planche-accrochage-ligne"><dt>{t("planche.echange.natif.reimport")}</dt><dd className={reimport === "conforme" ? "planche-echange-conforme" : "planche-echange-refuse"} data-planche-natif-reimport={reimport}>{t(`planche.echange.natif.${reimport}`)}</dd></div>
        </dl>
      )}
      <p className="inspecteur-aide">{t("planche.echange.natif.note")}</p>
      <h4>{t("planche.echange.image")}</h4>
      <label className="planche-accrochage-champ">
        {t("planche.echange.definition")}
        <select
          value={choisie}
          onChange={(e) => {
            const x = DEFINITIONS_IMAGE.find((y) => y.id === e.target.value);
            if (x) onTaille(x.largeur, x.hauteur);
          }}
          onKeyDown={arreter}
          data-planche-image-definition
        >
          {DEFINITIONS_IMAGE.map((x) => (
            <option key={x.id} value={x.id}>{nomDefinition(x)}</option>
          ))}
          <option value="personnalisee" disabled>{t("planche.echange.definition.personnalisee")}</option>
        </select>
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.echange.taille")}
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onKeyDown={(e) => {
            arreter(e);
            if (e.key === "Enter") valider();
          }}
          onBlur={valider}
          data-planche-image-taille
        />
      </label>
      <label className="planche-echange-case">
        <input type="checkbox" checked={transparent} onChange={(e) => onTransparent(e.target.checked)} data-planche-image-transparent />
        {t("planche.echange.transparent")}
      </label>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.echange.image")}>
        <button type="button" className="planche-bouton-principal" onClick={onExporterImage} data-planche-image-exporter>{t("planche.echange.image.exporter")}</button>
      </div>
      <p className="inspecteur-aide">{t("planche.echange.image.note")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-natif-note>{note}</p>}
    </div>
  );
}

export type PoserSur = "travail" | "sol";

export function PanneauCollerTrace({
  lecture,
  unite,
  onUnite,
  echelle,
  onEchelle,
  poserSur,
  onPoserSur,
  onColler,
  onAnnuler,
  echelleValide,
}: {
  lecture: LectureColle | null;
  unite: UniteColle | "";
  onUnite: (u: UniteColle | "") => void;
  echelle: string;
  onEchelle: (s: string) => void;
  poserSur: PoserSur;
  onPoserSur: (p: PoserSur) => void;
  onColler: () => void;
  onAnnuler: () => void;
  echelleValide: boolean;
}) {
  if (!lecture) return <p className="inspecteur-aide">{t("planche.echange.coller.vide")}</p>;
  const sommets = lecture.traces.reduce((n, x) => n + x.points.length, 0);
  return (
    <div className="planche-accrochage planche-echange" data-planche-coller-trace>
      <h4>{t("planche.echange.coller.contenu")}</h4>
      <dl className="planche-accrochage-genres" data-planche-coller-lecture>
        <div className="planche-accrochage-ligne"><dt>{t("planche.echange.coller.type")}</dt><dd data-planche-coller-type>{t(`planche.echange.coller.type.${lecture.type}`)}</dd></div>
        <div className="planche-accrochage-ligne"><dt>{t("planche.echange.coller.traces")}</dt><dd data-planche-coller-traces>{lecture.traces.length}</dd></div>
        <div className="planche-accrochage-ligne"><dt>{t("planche.echange.coller.sommets")}</dt><dd data-planche-coller-sommets>{sommets}</dd></div>
        <div className="planche-accrochage-ligne"><dt>{t("planche.echange.coller.approchees")}</dt><dd>{lecture.courbesApprochees}</dd></div>
        <div className="planche-accrochage-ligne"><dt>{t("planche.echange.coller.refuses")}</dt><dd>{lecture.refuses}</dd></div>
      </dl>
      <label className="planche-accrochage-champ">
        {t("planche.echange.coller.unite")}
        <select value={unite} onChange={(e) => onUnite(e.target.value as UniteColle | "")} onKeyDown={arreter} data-planche-coller-unite>
          <option value="" disabled>{t("planche.echange.coller.choisir")}</option>
          <option value="m">m</option>
          <option value="cm">cm</option>
          <option value="mm">mm</option>
        </select>
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.echange.coller.echelle")}
        <input value={echelle} onChange={(e) => onEchelle(e.target.value)} onKeyDown={arreter} aria-invalid={!echelleValide} data-planche-coller-echelle />
      </label>
      <label className="planche-accrochage-champ">
        {t("planche.echange.coller.poser")}
        <select value={poserSur} onChange={(e) => onPoserSur(e.target.value as PoserSur)} onKeyDown={arreter} data-planche-coller-poser>
          <option value="travail">{t("planche.echange.coller.poser.travail")}</option>
          <option value="sol">{t("planche.echange.coller.poser.sol")}</option>
        </select>
      </label>
      {lecture.unite === null && <p className="planche-echange-avertissement" role="note" data-planche-coller-unite-absente>{t("planche.echange.coller.unite-absente")}</p>}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.echange.coller.titre")}>
        <button type="button" className="planche-bouton-principal" disabled={unite === "" || !echelleValide} onClick={onColler} data-planche-coller-valider>{t("planche.echange.coller.coller")}</button>
        <button type="button" onClick={onAnnuler} data-planche-coller-annuler>{t("planche.echange.annuler")}</button>
      </div>
      <p className="inspecteur-aide">{t("planche.echange.coller.note")}</p>
    </div>
  );
}
