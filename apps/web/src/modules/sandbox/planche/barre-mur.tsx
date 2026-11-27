/**
 * Barre d'options de l'outil Mur (cas 4 du catalogue des extensions, étape 4 : D4-F5-003 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-4-murs.png`) : nom de l'outil et son raccourci, épaisseur,
 * hauteur, côté de référence (axe, nu intérieur, nu extérieur) et « Murs depuis les arêtes ». Une épaisseur ou une
 * hauteur non positive est signalée et bloque la pose.
 */
import { REFERENCES_MUR, entreeOutil, outilParId, type ReferenceMur } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_MUR, type Disponibilite, type IdCommandeMur } from "./commandes-objets";
import { afficherRaccourci, nomOutil } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export function BarreMur({
  saisie,
  onSaisie,
  valide,
  reference,
  onReference,
  lecture,
  disponibilite,
  executer,
  note,
}: {
  saisie: { readonly epaisseur: string; readonly hauteur: string };
  onSaisie: (s: { epaisseur: string; hauteur: string }) => void;
  valide: boolean;
  reference: ReferenceMur;
  onReference: (r: ReferenceMur) => void;
  lecture: boolean;
  disponibilite: (id: IdCommandeMur) => Disponibilite;
  executer: (id: IdCommandeMur) => void;
  note: string | null;
}) {
  const outil = entreeOutil("mur");
  const champ = (c: "epaisseur" | "hauteur") => (
    <label className="planche-mur-champ">
      <span>{t(`planche.mur.${c}`)}</span>
      <input value={saisie[c]} inputMode="decimal" disabled={lecture} aria-invalid={!valide} onKeyDown={arreter} onChange={(e) => onSaisie({ ...saisie, [c]: e.target.value })} data-planche-mur-champ={c} />
      <span aria-hidden="true">m</span>
    </label>
  );
  return (
    <div className="planche-options-outil planche-mur-barre" role="toolbar" aria-label={t("planche.mur.barre")} data-planche-options data-planche-mur-barre>
      <b className="planche-mur-nom">
        <Pictogramme picto={outil.pictogramme} /> <span translate="no">{`${nomOutil(outilParId("mur")!)} (${afficherRaccourci(outil.raccourci ?? "")})`}</span>
      </b>
      {champ("epaisseur")}
      {champ("hauteur")}
      <span className="planche-option" role="group" aria-label={t("planche.option.mur.reference")} data-planche-option="reference">
        <span className="planche-option-nom" aria-hidden="true">{t("planche.option.mur.reference")}</span>
        {REFERENCES_MUR.map((r) => (
          <button key={r} type="button" aria-pressed={reference === r} title={`${t(`planche.option.mur.reference.${r}`)} (${afficherRaccourci("Ctrl")})`} onClick={() => onReference(r)} data-planche-option-valeur={`reference:${r}`}>
            {t(`planche.option.mur.reference.${r}`)}
          </button>
        ))}
      </span>
      {COMMANDES_MUR.map((c) => {
        const d = disponibilite(c.id);
        return (
          <button key={c.id} type="button" className="planche-mur-commande" disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(c.id)} data-planche-commande={c.id}>
            <Pictogramme picto={c.picto} /> {`${t(c.court)} (${afficherRaccourci(c.raccourci)})`}
          </button>
        );
      })}
      {!valide && <span className="planche-mur-erreur" role="alert" data-planche-mur-erreur>{t("planche.mur.motif.parametres")}</span>}
      {note && <span className="planche-mur-note" role="status" data-planche-mur-note>{note}</span>}
    </div>
  );
}
