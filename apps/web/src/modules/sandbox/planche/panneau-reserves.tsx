/**
 * Panneau « Réserves » (cas 4 du catalogue des extensions, étape 7b : D11-F18-037 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7b) : liste filtrée par lot et par statut,
 * fiche de la réserve choisie (lot, entreprise, échéance, objet, description, photo prise par la tablette), barre : lever
 * (ou rouvrir) et supprimer. L'outil Réserve épingle une nouvelle réserve.
 */
import { type Id, type Reserve, type StatutReserve, STATUTS_RESERVE, enRetard } from "@parcours/sandbox-planche-model";
import { useEffect, useRef, useState } from "react";
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_RESERVES, type Disponibilite, type IdCommandeReserve } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
/** « AAAA-MM-JJ » → date courte de la langue de l'interface ; "" → "—". */
const dateCourte = (j: string): string => (j ? new Date(`${j}T12:00:00`).toLocaleDateString(LOCALE) : "—");
type Champs = { lot: string; entreprise: string; echeance: string; description: string };
const champsDe = (r: Reserve | null): Champs => ({ lot: r?.lot ?? "", entreprise: r?.entreprise ?? "", echeance: r?.echeance ?? "", description: r?.description ?? "" });

/** Photo réduite à 1 280 px (plus grand côté) en JPEG : rangée avec la réserve. */
export async function reduirePhoto(f: File, cote = 1280): Promise<string> {
  const bitmap = await createImageBitmap(f);
  const k = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * k));
  c.height = Math.max(1, Math.round(bitmap.height * k));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c.toDataURL("image/jpeg", 0.82);
}

export function PanneauReserves({
  reserves,
  total,
  lots,
  filtre,
  choisie,
  aujourdhui,
  nomObjet,
  lecture,
  onFiltre,
  onChoisir,
  onModifier,
  onPhoto,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  reserves: readonly Reserve[];
  total: number;
  lots: readonly string[];
  filtre: { lot: string | null; statut: StatutReserve | null };
  choisie: Reserve | null;
  aujourdhui: string;
  nomObjet: (id: Id) => string | null;
  lecture: boolean;
  onFiltre: (f: { lot: string | null; statut: StatutReserve | null }) => void;
  onChoisir: (id: Id) => void;
  onModifier: (v: Partial<Champs>) => void;
  onPhoto: (f: File) => void;
  executer: (id: IdCommandeReserve) => void;
  disponibilite: (id: IdCommandeReserve) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const [champs, setChamps] = useState<Champs>(() => champsDe(choisie));
  const cle = choisie ? JSON.stringify([choisie.id, choisie.lot, choisie.entreprise, choisie.echeance, choisie.description]) : "";
  useEffect(() => setChamps(champsDe(choisie)), [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const photoRef = useRef<HTMLInputElement>(null);
  const ouvertes = reserves.filter((r) => r.statut === "ouverte").length;
  const enregistrer = (c: keyof Champs) => {
    if (!choisie || champs[c] === champsDe(choisie)[c]) return;
    onModifier({ [c]: champs[c] });
  };
  const bouton = (id: IdCommandeReserve, classe = "") => {
    const c = COMMANDES_RESERVES.find((x) => x.id === id)!;
    const d = disponibilite(id);
    const libelle = id === "lever-reserve" && choisie?.statut === "levee" ? t("planche.reserves.rouvrir") : t(c.libelle);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${libelle} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={libelle} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {id === "lever-reserve" && choisie?.statut === "levee" ? t("planche.reserves.court.rouvrir") : t(c.court)} ({afficherRaccourci(c.raccourci)})
      </button>
    );
  };
  const champ = (c: keyof Champs, type = "text") => (
    <label className="planche-reserves-champ" data-champ={c}>
      <span>{t(`planche.reserves.champ.${c}`)}</span>
      {c === "description" ? (
        <textarea rows={2} value={champs[c]} disabled={lecture} onKeyDown={arreter} onBlur={() => enregistrer(c)} onChange={(e) => setChamps({ ...champs, [c]: e.target.value })} data-planche-reserve-champ={c} />
      ) : (
        <input type={type} value={champs[c]} disabled={lecture} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrer(c); }} onBlur={() => enregistrer(c)} onChange={(e) => { setChamps({ ...champs, [c]: e.target.value }); if (type === "date" && choisie) onModifier({ [c]: e.target.value }); }} data-planche-reserve-champ={c} />
      )}
    </label>
  );
  return (
    <div className="planche-controle planche-reserves" data-planche-reserves={total}>
      <p className="planche-reserves-compte" data-planche-reserves-compte>{t("planche.reserves.compte", { total: String(total), ouvertes: String(ouvertes) })}</p>
      <div className="planche-reserves-filtres">
        <select value={filtre.lot ?? ""} onChange={(e) => onFiltre({ ...filtre, lot: e.target.value || null })} onKeyDown={arreter} aria-label={t("planche.reserves.filtre.lot")} data-planche-reserves-filtre="lot">
          <option value="">{t("planche.reserves.filtre.tous-lots")}</option>
          {lots.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select value={filtre.statut ?? ""} onChange={(e) => onFiltre({ ...filtre, statut: (e.target.value || null) as StatutReserve | null })} onKeyDown={arreter} aria-label={t("planche.reserves.filtre.statut")} data-planche-reserves-filtre="statut">
          <option value="">{t("planche.reserves.filtre.tous-statuts")}</option>
          {STATUTS_RESERVE.map((s) => <option key={s} value={s}>{t(`planche.reserves.statut.${s}`)}</option>)}
        </select>
      </div>
      {total === 0 ? (
        <p className="inspecteur-aide" data-planche-reserves-vide>{t("planche.reserves.vide")}</p>
      ) : (
        <table className="planche-reserves-table">
          <thead>
            <tr><th>{t("planche.reserves.col.numero")}</th><th>{t("planche.reserves.col.lot")}</th><th>{t("planche.reserves.col.entreprise")}</th><th>{t("planche.reserves.col.echeance")}</th><th>{t("planche.reserves.col.statut")}</th></tr>
          </thead>
          <tbody>
            {reserves.map((r) => (
              <tr key={r.id} className={r.id === choisie?.id ? "est-choisi" : ""} onClick={() => onChoisir(r.id)} data-planche-reserve={r.id} data-statut={r.statut}>
                <td><button type="button" onClick={() => onChoisir(r.id)} aria-pressed={r.id === choisie?.id}>{r.numero}</button></td>
                <td>{r.lot || "—"}</td>
                <td>{r.entreprise || "—"}</td>
                <td>{dateCourte(r.echeance)}{enRetard(r, aujourdhui) ? <em className="planche-reserves-retard"> {t("planche.reserves.retard")}</em> : null}</td>
                <td><span className={`planche-reserves-etat est-${r.statut}`}>{r.statut === "levee" ? t("planche.reserves.levee-le", { date: dateCourte(r.levee ?? "") }) : t("planche.reserves.statut.ouverte")}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {choisie && (
        <div className="planche-reserves-fiche" data-planche-reserve-fiche={choisie.numero}>
          {champ("lot")}
          {champ("entreprise")}
          {champ("echeance", "date")}
          <div className="planche-reserves-champ">
            <span>{t("planche.reserves.champ.objet")}</span>
            <span data-planche-reserve-objet>{choisie.objet ? (nomObjet(choisie.objet) ?? t("planche.reserves.objet.absent")) : t("planche.reserves.objet.point")}</span>
          </div>
          {champ("description")}
          <div className="planche-reserves-champ planche-reserves-photo">
            <span>{t("planche.reserves.champ.photo")}</span>
            <span>
              {choisie.photo ? <img src={choisie.photo} alt={t("planche.reserves.photo.alt", { numero: String(choisie.numero) })} data-planche-reserve-photo /> : <i className="planche-reserves-sans-photo">{t("planche.reserves.photo.aucune")}</i>}
              <button type="button" disabled={lecture} onClick={() => photoRef.current?.click()} data-planche-reserve-prendre-photo>{t("planche.reserves.photo.prendre")}</button>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) onPhoto(f);
                }}
                data-planche-reserve-photo-fichier
              />
            </span>
          </div>
        </div>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.reserves.barre")}>
        {bouton("lever-reserve", choisie?.statut === "ouverte" ? "est-principal" : "")}
        {bouton("supprimer-reserve")}
      </div>
      {erreur && <p className="planche-message" role="alert" data-planche-reserves-erreur>{erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-reserves-note>{note}</p>}
      <p className="inspecteur-aide">{t("planche.reserves.aide")}</p>
    </div>
  );
}
