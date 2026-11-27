/**
 * Panneau « Références » (cas 4 du catalogue des extensions, lot C4, étape 3 : D10-F14-024, D10-F23a-011 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-3-reference.png`) : liste des références (maquettes reçues,
 * jamais fusionnées), placement (modifiable déverrouillée), opacité, unité des fichiers OBJ / STL, contrôle de
 * récolement avec la tolérance déclarée ; barre : charger, recharger, verrouiller, masquer, contrôler, supprimer.
 */
import type { PlacementReference, Reference, ResultatRecolement } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LOCALE } from "../../../lib/i18n";
import { t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_REFERENCES, type Disponibilite, type IdCommandeReference } from "./commandes-objets";
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

export type UniteReference = "m" | "cm" | "mm";
export const ECHELLES_UNITE: Readonly<Record<UniteReference, number>> = { m: 1, cm: 0.01, mm: 0.001 };

export function PanneauReferences({
  references,
  choisie,
  etats,
  lecture,
  unite,
  recolement,
  onChoisir,
  onUnite,
  onPlacement,
  onOpacite,
  onTolerance,
  executer,
  disponibilite,
  erreur,
  note,
}: {
  references: readonly Reference[];
  choisie: Reference | null;
  /** État du fichier de chaque référence : relu, en lecture, introuvable. */
  etats: Readonly<Record<string, "chargee" | "lecture" | "introuvable">>;
  lecture: boolean;
  unite: UniteReference;
  recolement: { readonly reference: string; readonly tolerance: number | null; readonly resultat: ResultatRecolement } | null;
  onChoisir: (id: string) => void;
  onUnite: (u: UniteReference) => void;
  onPlacement: (p: PlacementReference) => void;
  onOpacite: (v: number) => void;
  onTolerance: (v: number | null) => void;
  executer: (id: IdCommandeReference) => void;
  disponibilite: (id: IdCommandeReference) => Disponibilite;
  erreur: string | null;
  note: string | null;
}) {
  const [champs, setChamps] = useState({ x: "", y: "", z: "", rotation: "" });
  const [tolerance, setTolerance] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const cle = choisie ? JSON.stringify([choisie.id, choisie.placement, choisie.tolerance]) : "";
  useEffect(() => {
    const p = choisie?.placement;
    setChamps(p ? { x: nombre(p.x, 3, 6), y: nombre(p.y, 3, 6), z: nombre(p.z, 3, 6), rotation: nombre((p.rotation * 180) / Math.PI, 3, 6) } : { x: "", y: "", z: "", rotation: "" });
    setTolerance(choisie?.tolerance != null ? nombre(choisie.tolerance * 100, 1, 4) : "");
    setLocal(null);
  }, [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const verrou = lecture || !choisie || choisie.verrouille;
  const enregistrerPlacement = () => {
    if (!choisie) return;
    const v = { x: lireNombre(champs.x), y: lireNombre(champs.y), z: lireNombre(champs.z), r: lireNombre(champs.rotation) };
    if ([v.x, v.y, v.z, v.r].some((n) => n === undefined || n === null)) return setLocal(t("planche.references.erreur.position"));
    setLocal(null);
    const p = { x: v.x!, y: v.y!, z: v.z!, rotation: (v.r! * Math.PI) / 180 };
    const a = choisie.placement;
    const proche = (u: number, w: number) => Math.abs(u - w) < 1e-9;
    if (!(proche(p.x, a.x) && proche(p.y, a.y) && proche(p.z, a.z) && Math.abs(p.rotation - a.rotation) < 1e-9)) onPlacement(p);
  };
  const enregistrerTolerance = () => {
    const v = lireNombre(tolerance);
    if (v === undefined || (v !== null && (v < 0.01 || v > 1000))) return setLocal(t("planche.references.erreur.tolerance"));
    setLocal(null);
    const m = v === null ? null : v / 100;
    if (m !== (choisie?.tolerance ?? null)) onTolerance(m);
  };
  const bouton = (id: IdCommandeReference, classe = "") => {
    const c = COMMANDES_REFERENCES.find((x) => x.id === id)!;
    const d = disponibilite(id);
    const inverse = (id === "verrouiller-reference" && choisie?.verrouille) || (id === "afficher-reference" && choisie && !choisie.visible);
    const libelle = inverse ? t(id === "verrouiller-reference" ? "planche.references.deverrouiller" : "planche.references.montrer") : t(c.libelle);
    const court = inverse ? t(id === "verrouiller-reference" ? "planche.references.court.deverrouiller" : "planche.references.court.montrer") : t(c.court);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${libelle} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={libelle} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {court} ({afficherRaccourci(c.raccourci)})
      </button>
    );
  };
  const r = recolement && choisie && recolement.reference === choisie.id ? recolement : null;
  const cm = (v: number) => nombre(v * 100, 1);
  return (
    <div className="planche-controle planche-fonds planche-references" data-planche-references={references.length}>
      {references.length === 0 ? (
        <p className="inspecteur-aide" data-planche-references-vide>{t("planche.references.vide")}</p>
      ) : (
        <ul className="planche-fonds-liste">
          {references.map((x) => (
            <li key={x.id} className={x.id === choisie?.id ? "est-choisi" : ""} data-planche-reference={x.id} data-etat={etats[x.id] ?? "lecture"} data-version={x.version}>
              <button type="button" onClick={() => onChoisir(x.id)} aria-pressed={x.id === choisie?.id}>
                <b>{x.nom}</b>
                <span className={`planche-fonds-etat ${x.verrouille && x.visible ? "est-cale" : "est-non-cale"}`}>{t(!x.visible ? "planche.references.etat.masquee" : x.verrouille ? "planche.references.etat.verrouillee" : "planche.references.etat.libre", { version: String(x.version) })}</span>
                <small>
                  {t("planche.references.detail", { format: x.format.toUpperCase(), triangles: x.triangles.toLocaleString(LOCALE), date: x.chargeLe.split("-").reverse().join("."), empreinte: x.fichier.empreinte.slice(0, 12) })}
                  {etats[x.id] === "lecture" ? ` · ${t("planche.references.lecture")}` : etats[x.id] === "introuvable" ? ` · ${t("planche.references.introuvable")}` : ""}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}
      {choisie && (
        <div className="planche-fonds-fiche" data-planche-reference-fiche={choisie.id}>
          <fieldset className="planche-references-placement" disabled={verrou}>
            <legend>{t("planche.references.placement")}</legend>
            {(["x", "y", "z", "rotation"] as const).map((k) => (
              <label key={k}>
                <span>{k === "rotation" ? t("planche.references.rotation") : `${k.toUpperCase()} (m)`}</span>
                <input value={champs[k]} inputMode="decimal" onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrerPlacement(); }} onBlur={enregistrerPlacement} onChange={(e) => setChamps({ ...champs, [k]: e.target.value })} data-planche-reference-placement={k} />
              </label>
            ))}
          </fieldset>
          {choisie.verrouille && <p className="inspecteur-aide">{t("planche.references.aide-verrou")}</p>}
          <label className="planche-fonds-opacite">
            <span>{t("planche.references.opacite")}</span>
            <input type="range" min={10} max={100} step={5} value={Math.round(choisie.opacite * 100)} disabled={lecture} onKeyDown={arreter} onChange={(e) => onOpacite(Number(e.target.value) / 100)} data-planche-reference-opacite /> {Math.round(choisie.opacite * 100)} %
          </label>
        </div>
      )}
      <label className="planche-fonds-longueur">
        <span>{t("planche.references.unite")}</span>
        <select value={unite} disabled={lecture} onKeyDown={arreter} onChange={(e) => onUnite(e.target.value as UniteReference)} data-planche-reference-unite>
          {(["m", "cm", "mm"] as const).map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
      </label>
      <p className="inspecteur-aide">{t("planche.references.unite-ifc")}</p>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.references.barre")}>
        {bouton("charger-reference")}
        {bouton("recharger-reference")}
        {bouton("verrouiller-reference")}
        {bouton("afficher-reference")}
        {bouton("supprimer-reference")}
      </div>
      <h4 className="planche-fonds-titre">{t("planche.references.recolement")}</h4>
      <div className="planche-fonds-auteur">
        <label>
          <span>{t("planche.references.tolerance")}</span>
          <input value={tolerance} inputMode="decimal" disabled={lecture || !choisie} onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrerTolerance(); }} onBlur={enregistrerTolerance} onChange={(e) => setTolerance(e.target.value)} data-planche-reference-tolerance /> cm
        </label>
        {bouton("controler-recolement", "est-principal")}
      </div>
      {r && (
        <div className="planche-fonds-recue" data-planche-recolement={r.resultat.horsTolerance === null ? "non-juge" : String(r.resultat.horsTolerance.length)}>
          <p>
            <b>{t("planche.references.resultat", { points: r.resultat.points.toLocaleString(LOCALE), moyen: r.resultat.moyen === null ? "—" : cm(r.resultat.moyen), max: r.resultat.max === null ? "—" : cm(r.resultat.max) })}</b>
          </p>
          {r.resultat.horsTolerance === null ? (
            <p>{t("planche.references.non-juge")}</p>
          ) : r.resultat.horsTolerance.length === 0 ? (
            <p>{t("planche.references.dans-tolerance", { tolerance: cm(r.tolerance ?? 0) })}</p>
          ) : (
            <p>
              <b className="est-ecart">{t("planche.references.hors-tolerance", { nombre: String(r.resultat.horsTolerance.length), tolerance: cm(r.tolerance ?? 0) })}</b> :{" "}
              {r.resultat.horsTolerance.slice(0, 12).map((x) => `+${cm(x.ecart)} cm`).join(" · ")}
              {r.resultat.horsTolerance.length > 12 ? " · …" : ""}
            </p>
          )}
        </div>
      )}
      <p className="inspecteur-aide">{t("planche.references.aide-recolement")}</p>
      {(local ?? erreur) && <p className="planche-message" role="alert" data-planche-references-erreur>{local ?? erreur}</p>}
      {note && <p className="inspecteur-aide" data-planche-references-note>{note}</p>}
      <p className="inspecteur-aide">{t("planche.references.aide")}</p>
    </div>
  );
}
