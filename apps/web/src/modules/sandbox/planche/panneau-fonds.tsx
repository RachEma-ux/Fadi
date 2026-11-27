/**
 * Panneau « Fonds calés » (cas 4 du catalogue des extensions, lot C4, étape 1 : D10-F23a-002 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-1-calage.png`) : liste des fonds, méthode de calage, tableau des
 * points (pixel, position saisie, résidu), longueur saisie, opacité, barre : importer, caler, verrouiller, supprimer le
 * point ou le fond. L'outil Calage pose les points sur le fond.
 */
import { type ComparaisonFiche, type FicheCalage, type Fond, type MethodeCalage, type PositionPlan, residusCalage } from "@parcours/sandbox-planche-model";
import { useEffect, useRef, useState } from "react";
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_FONDS, type Disponibilite, type IdCommandeFond } from "./commandes-objets";
import { adresseOriginalFond } from "./fonds-client";
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
export async function reduireFond(f: File, cote = 4096): Promise<{ image: string; largeur: number; hauteur: number; largeurOriginal: number; hauteurOriginal: number }> {
  const bitmap = await createImageBitmap(f);
  const k = Math.min(1, cote / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bitmap.width * k));
  c.height = Math.max(1, Math.round(bitmap.height * k));
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  const largeurOriginal = bitmap.width;
  const hauteurOriginal = bitmap.height;
  bitmap.close();
  const png = f.type === "image/png";
  return { image: c.toDataURL(png ? "image/png" : "image/jpeg", 0.85), largeur: c.width, hauteur: c.height, largeurOriginal, hauteurOriginal };
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
  fiche,
  auteur,
  date,
  onAuteur,
  onDate,
  recue,
  orthophoto,
  systemeOrthophoto,
  onSystemeOrthophoto,
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
  /** Fiche de calage du projet, telle qu'elle serait exportée. */
  fiche: FicheCalage;
  auteur: string;
  date: string;
  onAuteur: (v: string) => void;
  onDate: (v: string) => void;
  /** Fiche reçue, comparée au projet (rien n'est modifié avant « Appliquer »). */
  recue: { readonly nom: string; readonly fiche: FicheCalage; readonly comparaison: ComparaisonFiche } | null;
  /** Orthophoto en attente de son système (fichier de calage sans .prj lisible). */
  orthophoto: { readonly image: string; readonly calage: string; readonly nomPrj: string | null } | null;
  systemeOrthophoto: string;
  onSystemeOrthophoto: (v: string) => void;
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
                <span className={`planche-fonds-etat ${f.cale ? "est-cale" : "est-non-cale"}`} data-planche-fond-geo={f.geo ? f.geo.fichier : undefined}>{f.geo ? t("planche.fonds.etat.geo", { fichier: f.geo.fichier }) : f.cale ? t(f.verrouille ? "planche.fonds.etat.cale-verrouille" : "planche.fonds.etat.cale") : t(f.verrouille ? "planche.fonds.etat.non-cale-verrouille" : "planche.fonds.etat.non-cale")}</span>
                <small>{f.geo ? `${f.geo.systeme} · ` : ""}{t(f.cale ? "planche.fonds.detail" : "planche.fonds.detail-provisoire", { largeur: f.largeurPx.toLocaleString(LOCALE), hauteur: f.hauteurPx.toLocaleString(LOCALE), altitude: nombre(f.altitude), mm: nombre(f.pose.echelle * 1000, 2) })}</small>
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
          <p className="planche-fonds-original" data-planche-fond-original={choisi.original?.id ?? ""}>
            {choisi.original ? (
              <>
                {t("planche.fonds.original", { taille: `${nombre(choisi.original.taille / 1048576, 2)} Mo`, empreinte: choisi.original.empreinte.slice(0, 12) })}{" "}
                <a href={adresseOriginalFond(choisi.original.id)} download={choisi.nom || undefined} target="_blank" rel="noreferrer">{t("planche.fonds.telecharger-original")}</a>
              </>
            ) : (
              t("planche.fonds.original-absent")
            )}
          </p>
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
      <h4 className="planche-fonds-titre">{t("planche.fonds.fiche.titre")}</h4>
      <table className="planche-fonds-fiche-projet" data-planche-fiche-projet>
        <thead>
          <tr><th>{t("planche.fonds.fiche.col.ligne")}</th><th>{t("planche.fonds.fiche.col.valeur")}</th></tr>
        </thead>
        <tbody>
          <tr data-planche-fiche-ligne="point-de-base">
            <td>{t("planche.fonds.fiche.point-de-base")}</td>
            <td>{fiche.pointDeBase ? <>{`${nombre(fiche.pointDeBase.e, 3)} ; ${nombre(fiche.pointDeBase.n, 3)} m`} <span className="planche-fonds-source">({t("planche.fonds.fiche.source.point-de-base")})</span></> : t("planche.fonds.fiche.non-declare")}</td>
          </tr>
          <tr data-planche-fiche-ligne="systeme">
            <td>{t("planche.fonds.fiche.systeme")}</td>
            <td>{fiche.pointDeBase ? <>{`${fiche.pointDeBase.systeme} / ${fiche.pointDeBase.systemeVertical || t("planche.fonds.fiche.non-declare")}`} <span className="planche-fonds-source">({t("planche.fonds.fiche.source.declares")})</span></> : t("planche.fonds.fiche.non-declare")}</td>
          </tr>
          <tr data-planche-fiche-ligne="nord">
            <td>{t("planche.fonds.fiche.nord")}</td>
            <td>{fiche.pointDeBase ? <>{`${nombre(fiche.pointDeBase.rotation, 3)}°`} <span className="planche-fonds-source">({t("planche.fonds.fiche.source.point-de-base")})</span></> : t("planche.fonds.fiche.non-declare")}</td>
          </tr>
          <tr data-planche-fiche-ligne="reference">
            <td>{t("planche.fonds.fiche.reference")}</td>
            <td>{fiche.reference !== null ? <>{`${nombre(fiche.reference, 3)} m`} <span className="planche-fonds-source">({t("planche.fonds.fiche.source.niveaux")})</span></> : t("planche.fonds.fiche.non-declare")}</td>
          </tr>
          <tr data-planche-fiche-ligne="niveaux">
            <td>{t("planche.fonds.fiche.niveaux")}</td>
            <td>{fiche.niveaux.length === 0 ? t("planche.fonds.fiche.aucun") : <>{`${fiche.niveaux.length} (${fiche.niveaux.map((x) => x.nom).join(", ")})`} <span className="planche-fonds-source">({t("planche.fonds.fiche.source.niveaux")})</span></>}</td>
          </tr>
          <tr data-planche-fiche-ligne="fonds">
            <td>{t("planche.fonds.fiche.fonds")}</td>
            <td>{fiche.fonds.length === 0 ? t("planche.fonds.fiche.aucun") : <>{t("planche.fonds.fiche.fonds-detail", { nombre: String(fiche.fonds.length) })} <span className="planche-fonds-source">({t("planche.fonds.fiche.source.fonds")})</span></>}</td>
          </tr>
        </tbody>
      </table>
      <div className="planche-fonds-auteur">
        <label>
          <span>{t("planche.fonds.fiche.auteur")}</span>
          <input value={auteur} maxLength={80} onKeyDown={arreter} onChange={(e) => onAuteur(e.target.value)} data-planche-fiche-auteur />
        </label>
        <label>
          <span>{t("planche.fonds.fiche.date")}</span>
          <input type="date" value={date} onKeyDown={arreter} onChange={(e) => onDate(e.target.value)} data-planche-fiche-date />
        </label>
      </div>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.fonds.fiche.barre")}>
        {bouton("exporter-fiche", "est-principal")}
        {bouton("importer-fiche")}
        {bouton("importer-orthophoto")}
        {bouton("exporter-calage-fond")}
      </div>
      {recue && (
        <div className="planche-fonds-recue" data-planche-fiche-recue={recue.nom} data-systeme={recue.comparaison.systeme}>
          <p>
            <b>{t("planche.fonds.recue.titre", { nom: recue.nom })}</b> ({recue.fiche.auteur || t("planche.fonds.recue.sans-auteur")}, {recue.fiche.date}) — {t(`planche.fonds.recue.systeme.${recue.comparaison.systeme}`, { fiche: recue.comparaison.systemeFiche ?? "", projet: recue.comparaison.systemeProjet ?? "" })}
          </p>
          <p data-planche-recue-point-de-base>
            {recue.comparaison.pointDeBase
              ? t("planche.fonds.recue.ecarts", { de: nombre(recue.comparaison.pointDeBase.de * 1000, 0), dn: nombre(recue.comparaison.pointDeBase.dn * 1000, 0), nord: nombre(recue.comparaison.pointDeBase.rotation, 3) })
              : t("planche.fonds.recue.ecarts-non-evalues")}
            {" · "}
            {recue.comparaison.reference !== null ? t("planche.fonds.recue.reference", { ecart: nombre(recue.comparaison.reference * 1000, 0) }) : t("planche.fonds.recue.reference-non-evaluee")}
          </p>
          <p data-planche-recue-niveaux>
            {t("planche.fonds.recue.niveaux")}{" "}
            {recue.comparaison.niveaux.length === 0 && t("planche.fonds.fiche.aucun")}
            {recue.comparaison.niveaux.map((x, i) => (
              <span key={`${x.nom}-${i}`} data-planche-recue-niveau={x.nom} data-ecart-mm={x.ecart === null ? "" : String(Math.round(x.ecart * 1000))}>
                {i > 0 ? " · " : ""}
                {x.ecart === null ? <><i>{x.nom}</i> {t("planche.fonds.recue.absent-du-projet")}</> : <>{x.nom} <b className={Math.abs(x.ecart) >= 0.0005 ? "est-ecart" : ""}>{`${x.ecart > 0 ? "+" : ""}${nombre(x.ecart * 1000, 0)} mm`}</b></>}
              </span>
            ))}
            {recue.comparaison.absentsDeLaFiche.length > 0 && <> · {t("planche.fonds.recue.absents-de-la-fiche", { noms: recue.comparaison.absentsDeLaFiche.join(", ") })}</>}
          </p>
          <p className="inspecteur-aide">{t("planche.fonds.recue.aide")}</p>
          <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.fonds.recue.barre")}>
            {bouton("appliquer-fiche", "est-principal")}
            {bouton("ignorer-fiche")}
          </div>
        </div>
      )}
      {orthophoto && (
        <div className="planche-fonds-recue" data-planche-orthophoto-attente={orthophoto.calage}>
          <p><b>{t("planche.fonds.ortho.attente", { image: orthophoto.image, calage: orthophoto.calage })}</b></p>
          <p className="inspecteur-aide">{orthophoto.nomPrj ? t("planche.fonds.ortho.prj-sans-code", { nom: orthophoto.nomPrj }) : t("planche.fonds.ortho.sans-prj")}</p>
          <label className="planche-fonds-longueur">
            <span>{t("planche.fonds.ortho.systeme")}</span>
            <input value={systemeOrthophoto} placeholder="EPSG:…" onKeyDown={arreter} onChange={(e) => onSystemeOrthophoto(e.target.value)} data-planche-orthophoto-systeme />
          </label>
          <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.fonds.ortho.barre")}>
            {bouton("poser-orthophoto", "est-principal")}
          </div>
        </div>
      )}
      {(local ?? erreur) && <p className="planche-message" role="alert" data-planche-fonds-erreur>{local ?? erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-fonds-note>{note}</p>}
      <p className="inspecteur-aide">{t("planche.fonds.aide")}</p>
      <p className="inspecteur-aide">{t("planche.fonds.fiche.aide")}</p>
    </div>
  );
}
