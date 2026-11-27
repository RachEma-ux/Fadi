/**
 * Panneau « Fonds calés » (cas 4 du catalogue des extensions, lot C4, étape 1 : D10-F23a-002 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-1-calage.png`) : liste des fonds, méthode de calage, tableau des
 * points (pixel, position saisie, résidu), longueur saisie, opacité, barre : importer, caler, verrouiller, supprimer le
 * point ou le fond. L'outil Calage pose les points sur le fond.
 */
import { type Fond, type MethodeCalage, type PositionPlan, residusCalage } from "@parcours/sandbox-planche-model";
import { useEffect, useRef, useState } from "react";
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_FONDS, type Disponibilite, type IdCommandeFond } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const nombre = (v: number, d = 2, max = d): string => v.toLocaleString(LOCALE, { minimumFractionDigits: d, maximumFractionDigits: max, useGrouping: false });
/** « 12,4 » ou « 12.4 » → 12,4 ; "" → null ; illisible → undefined. */
const lireNombre = (s: string): number | null | undefined => {
  const v = s.trim().replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};
/** « X ; Y » en mètres → position ; "" → null ; illisible → undefined. */
const lirePosition = (s: string): PositionPlan | null | undefined => {
  if (s.trim() === "") return null;
  const m = /^\s*(-?[0-9]+(?:[.,][0-9]+)?)\s*;\s*(-?[0-9]+(?:[.,][0-9]+)?)\s*$/.exec(s);
  return m ? { x: Number(m[1]!.replace(",", ".")), y: Number(m[2]!.replace(",", ".")) } : undefined;
};
/** Sans perte (jusqu'au dixième de millimètre au-delà des deux décimales affichées) : un champ relu ne réécrit pas une
 * valeur arrondie. */
const textePosition = (p: PositionPlan | null): string => (p ? `${nombre(p.x, 2, 6)} ; ${nombre(p.y, 2, 6)}` : "");

/** Image réduite à `cote` px (plus grand côté) : JPEG, sauf PNG gardé en PNG (plans au trait). */
export async function reduireFond(f: File, cote = 4096): Promise<{ image: string; largeur: number; hauteur: number }> {
  const bitmap = await createImageBitmap(f);
  const k = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * k));
  c.height = Math.max(1, Math.round(bitmap.height * k));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  const png = f.type === "image/png";
  return { image: c.toDataURL(png ? "image/png" : "image/jpeg", 0.85), largeur: c.width, hauteur: c.height };
}

export function PanneauFonds({
  fonds,
  choisi,
  point,
  lecture,
  onChoisir,
  onChoisirPoint,
  onMethode,
  onLongueur,
  onCible,
  onOpacite,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  fonds: readonly Fond[];
  choisi: Fond | null;
  point: string | null;
  lecture: boolean;
  onChoisir: (id: string) => void;
  onChoisirPoint: (id: string) => void;
  onMethode: (m: MethodeCalage) => void;
  onLongueur: (v: number | null) => void;
  onCible: (point: string, v: PositionPlan | null) => void;
  onOpacite: (v: number) => void;
  executer: (id: IdCommandeFond) => void;
  disponibilite: (id: IdCommandeFond) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const [longueur, setLongueur] = useState("");
  const [cibles, setCibles] = useState<Record<string, string>>({});
  const [local, setLocal] = useState<string | null>(null);
  const cle = choisi ? JSON.stringify([choisi.id, choisi.longueur, choisi.points]) : "";
  useEffect(() => {
    setLongueur(choisi?.longueur != null ? nombre(choisi.longueur, 3, 6) : "");
    setCibles(Object.fromEntries((choisi?.points ?? []).map((p) => [p.id, textePosition(p.cible)])));
    setLocal(null);
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const champRef = useRef<HTMLInputElement>(null);
  const residus = choisi ? residusCalage(choisi) : null;
  const verrou = lecture || !choisi || choisi.verrouille;
  const enregistrerLongueur = () => {
    const v = lireNombre(longueur);
    if (v === undefined || (v !== null && v <= 0)) return setLocal(t("planche.fonds.erreur.longueur"));
    setLocal(null);
    if (v !== (choisi?.longueur ?? null)) onLongueur(v);
  };
  const enregistrerCible = (id: string) => {
    // Champ inchangé (texte relu du modèle) : rien n'est réécrit, même au-delà des décimales affichées.
    if ((cibles[id] ?? "") === textePosition(choisi?.points.find((p) => p.id === id)?.cible ?? null)) return setLocal(null);
    const v = lirePosition(cibles[id] ?? "");
    if (v === undefined) return setLocal(t("planche.fonds.erreur.position"));
    setLocal(null);
    const avant = choisi?.points.find((p) => p.id === id)?.cible ?? null;
    if (JSON.stringify(v) !== JSON.stringify(avant)) onCible(id, v);
  };
  const bouton = (id: IdCommandeFond, classe = "") => {
    const c = COMMANDES_FONDS.find((x) => x.id === id)!;
    const d = disponibilite(id);
    const deverrouiller = id === "verrouiller-fond" && choisi?.verrouille;
    const libelle = deverrouiller ? t("planche.fonds.deverrouiller") : t(c.libelle);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${libelle} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={libelle} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {deverrouiller ? t("planche.fonds.court.deverrouiller") : t(c.court)} ({afficherRaccourci(c.raccourci)})
      </button>
    );
  };
  return (
    <div className="planche-controle planche-fonds" data-planche-fonds={fonds.length}>
      {fonds.length === 0 ? (
        <p className="inspecteur-aide" data-planche-fonds-vide>{t("planche.fonds.vide")}</p>
      ) : (
        <ul className="planche-fonds-liste">
          {fonds.map((f) => (
            <li key={f.id} className={f.id === choisi?.id ? "est-choisi" : ""} data-planche-fond={f.id} data-cale={f.cale ? "oui" : "non"}>
              <button type="button" onClick={() => onChoisir(f.id)} aria-pressed={f.id === choisi?.id}>
                <b>{f.nom || t("planche.fonds.sans-nom")}</b>
                <span className={`planche-fonds-etat ${f.cale ? "est-cale" : "est-non-cale"}`}>{f.cale ? t(f.verrouille ? "planche.fonds.etat.cale-verrouille" : "planche.fonds.etat.cale") : t(f.verrouille ? "planche.fonds.etat.non-cale-verrouille" : "planche.fonds.etat.non-cale")}</span>
                <small>{t(f.cale ? "planche.fonds.detail" : "planche.fonds.detail-provisoire", { largeur: f.largeurPx.toLocaleString(LOCALE), hauteur: f.hauteurPx.toLocaleString(LOCALE), altitude: nombre(f.altitude), mm: nombre(f.pose.echelle * 1000, 2) })}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {choisi && (
        <div className="planche-fonds-fiche" data-planche-fond-fiche={choisi.id}>
          <fieldset className="planche-fonds-methode" disabled={verrou}>
            <legend>{t("planche.fonds.methode")}</legend>
            {(["longueur", "paires"] as const).map((m) => (
              <label key={m}>
                <input type="radio" name="planche-fonds-methode" checked={choisi.methode === m} onChange={() => onMethode(m)} data-planche-fonds-methode={m} /> {t(`planche.fonds.methode.${m}`)}
              </label>
            ))}
          </fieldset>
          {choisi.points.length === 0 ? (
            <p className="inspecteur-aide" data-planche-fonds-sans-point>{t("planche.fonds.sans-point")}</p>
          ) : (
            <table className="planche-fonds-points">
              <thead>
                <tr><th>{t("planche.fonds.col.point")}</th><th>{t("planche.fonds.col.pixel")}</th><th>{t("planche.fonds.col.position")}</th><th>{t("planche.fonds.col.residu")}</th></tr>
              </thead>
              <tbody>
                {choisi.points.map((p) => (
                  <tr key={p.id} className={p.id === point ? "est-choisi" : ""} onClick={() => onChoisirPoint(p.id)} data-planche-point-calage={p.id}>
                    <td><button type="button" onClick={() => onChoisirPoint(p.id)} aria-pressed={p.id === point}>{p.id}</button></td>
                    <td>{`${Math.round(p.pixel.u).toLocaleString(LOCALE)} ; ${Math.round(p.pixel.v).toLocaleString(LOCALE)}`}</td>
                    <td>
                      {choisi.methode === "paires" ? (
                        <input ref={p.id === point ? champRef : undefined} value={cibles[p.id] ?? ""} disabled={verrou} placeholder="X ; Y" aria-label={t("planche.fonds.position-de", { point: p.id })} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrerCible(p.id); }} onBlur={() => enregistrerCible(p.id)} onChange={(e) => setCibles({ ...cibles, [p.id]: e.target.value })} data-planche-cible={p.id} />
                      ) : (
                        <span data-planche-position={p.id}>{textePosition(p.cible) || "—"}</span>
                      )}
                    </td>
                    <td data-planche-residu={p.id}>{residus?.points[p.id] !== undefined ? `${nombre(residus.points[p.id]! * 100, 1)} cm` : t("planche.fonds.non-evalue")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {residus && <p className="planche-fonds-moyen" data-planche-fonds-moyen>{t("planche.fonds.moyen", { valeur: nombre(residus.moyen * 100, 1) })}</p>}
          {choisi.methode === "longueur" && (
            <label className="planche-fonds-longueur">
              <span>{t("planche.fonds.longueur")}</span>
              <input value={longueur} disabled={verrou} inputMode="decimal" onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrerLongueur(); }} onBlur={enregistrerLongueur} onChange={(e) => setLongueur(e.target.value)} data-planche-fonds-longueur /> m
            </label>
          )}
          <label className="planche-fonds-opacite">
            <span>{t("planche.fonds.opacite")}</span>
            <input type="range" min={10} max={100} step={5} value={Math.round(choisi.opacite * 100)} disabled={lecture} onKeyDown={arreter} onChange={(e) => onOpacite(Number(e.target.value) / 100)} data-planche-fonds-opacite /> {Math.round(choisi.opacite * 100)} %
          </label>
        </div>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.fonds.barre")}>
        {bouton("importer-fond")}
        {bouton("caler-fond", "est-principal")}
        {bouton("verrouiller-fond")}
        {bouton("supprimer-point-calage")}
        {bouton("supprimer-fond")}
      </div>
      {(local ?? erreur) && <p className="planche-message" role="alert" data-planche-fonds-erreur>{local ?? erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-fonds-note>{note}</p>}
      <p className="inspecteur-aide">{t("planche.fonds.aide")}</p>
    </div>
  );
}
