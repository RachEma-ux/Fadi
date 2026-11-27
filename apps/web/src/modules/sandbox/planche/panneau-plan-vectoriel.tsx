/**
 * Panneau « Plan vectoriel » (cas 4 du catalogue des extensions, étape 5 : D7-F11-006, D7-S-001, D7-F11-001 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-5-plan-vectoriel.png`) : source, échelle, coupe, lignes cachées,
 * épaisseurs des traits coupé / vu / caché, aperçu SVG, export ; section « Motifs de hachure » : tableau (motif, aperçu,
 * angle, pas en mm papier, matières), nouveau motif, import d'un fichier .pat, suppression. Aucun motif n'est fourni.
 */
import type { ClasseTrait, Id, Materiau, MotifHachure, PlanDeCoupe } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { COMMANDES_PLAN, type Disponibilite, type IdCommandePlan } from "./commandes-objets";
import { afficherRaccourci } from "./outils-planche";

export type SourcePlan = "courante" | "dessus" | "avant" | "droite" | "arriere" | "gauche";
export const SOURCES_PLAN: readonly SourcePlan[] = ["courante", "dessus", "avant", "droite", "arriere", "gauche"];
export const ECHELLES_PLAN: readonly number[] = [1, 5, 10, 20, 50, 100, 200, 500];
/** Épaisseurs des traits (mm papier) : convention graphique du dessin, pas une donnée de projet. */
export const TRAITS_PLAN: Readonly<Record<ClasseTrait, number>> = { coupe: 0.5, vu: 0.18, cache: 0.13 };
export interface OptionsPlan {
  readonly source: SourcePlan;
  readonly echelle: number;
  /** Identifiant du plan de coupe, « aucune », ou `null` = le plan actif. */
  readonly coupe: string | null;
  readonly cachees: "pointille" | "masquees";
}
export interface ApercuPlan {
  readonly svg: string;
  readonly classes: number;
  readonly motifs: number;
  readonly vide: boolean;
}
export interface SaisieMotif {
  readonly nom: string;
  readonly angle: string;
  readonly pas: string;
}

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const nombre = (v: number, d: number): string => v.toFixed(d).replace(".", separateur());
const saisieDe = (m: MotifHachure | null): SaisieMotif => ({ nom: m?.nom ?? "", angle: m ? String(m.familles[0]?.angle ?? 0).replace(".", separateur()) : "", pas: m ? nombre(Math.abs(m.familles[0]?.dy ?? 0), 2) : "" });

/** Aperçu d'un motif dans le tableau : ses familles de lignes dans une vignette. */
function VignetteMotif({ motif }: { motif: MotifHachure }) {
  return (
    <svg className="planche-plan-vignette" viewBox="0 0 42 12" width="42" height="12" aria-hidden="true">
      <defs>
        {motif.familles.map((f, i) => (
          <pattern key={i} id={`vignette-${motif.id}-${i}`} patternUnits="userSpaceOnUse" width="100" height={Math.max(Math.abs(f.dy), 0.6)} patternTransform={`rotate(${-f.angle})`}>
            <line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" strokeWidth="0.35" strokeDasharray={f.tirets.length ? f.tirets.map((x) => Math.max(Math.abs(x), 0.2)).join(" ") : undefined} />
          </pattern>
        ))}
      </defs>
      <rect x="0.5" y="0.5" width="41" height="11" fill="none" stroke="currentColor" strokeWidth="0.4" />
      {motif.familles.map((_f, i) => <rect key={i} x="0.5" y="0.5" width="41" height="11" fill={`url(#vignette-${motif.id}-${i})`} />)}
    </svg>
  );
}

export function PanneauPlanVectoriel({
  options,
  plans,
  apercu,
  motifs,
  matieres,
  choisi,
  lecture,
  onOptions,
  onChoisir,
  onModifierMotif,
  onAssocier,
  executer,
  disponibilite,
  refMotifs,
  erreur,
  note,
}: {
  options: OptionsPlan;
  plans: readonly PlanDeCoupe[];
  apercu: ApercuPlan | null;
  motifs: readonly MotifHachure[];
  matieres: readonly Materiau[];
  choisi: Id | null;
  lecture: boolean;
  onOptions: (o: OptionsPlan) => void;
  onChoisir: (id: Id) => void;
  onModifierMotif: (id: Id, s: SaisieMotif) => void;
  onAssocier: (materiau: Id, motif: Id | null) => void;
  executer: (id: IdCommandePlan) => void;
  disponibilite: (id: IdCommandePlan) => Disponibilite;
  refMotifs: React.RefObject<HTMLHeadingElement | null>;
  erreur: string | null;
  note: string | null;
}) {
  const courant = motifs.find((m) => m.id === choisi) ?? null;
  const [saisie, setSaisie] = useState<SaisieMotif>(() => saisieDe(courant));
  const cle = courant ? JSON.stringify(courant) : "";
  useEffect(() => setSaisie(saisieDe(courant)), [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const enregistrer = () => {
    if (!courant) return;
    const avant = saisieDe(courant);
    if (saisie.nom !== avant.nom || saisie.angle !== avant.angle || saisie.pas !== avant.pas) onModifierMotif(courant.id, saisie);
  };
  const actif = [...plans].reverse().find((p) => p.actif) ?? null;
  const coupe = options.coupe ?? actif?.id ?? "aucune";
  const bouton = (id: IdCommandePlan, classe: string, avecRaccourci = false) => {
    const c = COMMANDES_PLAN.find((x) => x.id === id)!;
    const d = disponibilite(id);
    return (
      <button key={id} type="button" className={classe} disabled={!d.disponible} title={`${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${d.motif ? ` — ${t(d.motif)}` : ""}`} aria-label={t(c.libelle)} onClick={() => executer(id)} data-planche-commande={id}>
        <Pictogramme picto={c.picto} /> {t(c.court)}
        {avecRaccourci ? ` (${afficherRaccourci(c.raccourci)})` : ""}
      </button>
    );
  };
  const commandeMotifs = COMMANDES_PLAN.find((x) => x.id === "motifs-hachure")!;
  const parMotif = (id: Id) => matieres.filter((m) => m.motif === id);
  return (
    <div className="planche-controle planche-plan" data-planche-plan>
      <p className="inspecteur-aide">{t("planche.plan.aide")}</p>
      <div className="planche-plan-reglages">
        <label className="planche-plan-champ">
          <span>{t("planche.plan.source")}</span>
          <select value={options.source} onChange={(e) => onOptions({ ...options, source: e.target.value as SourcePlan })} onKeyDown={arreter} data-planche-plan-option="source">
            {SOURCES_PLAN.map((s) => <option key={s} value={s}>{t(`planche.plan.source.${s}`)}</option>)}
          </select>
        </label>
        <label className="planche-plan-champ">
          <span>{t("planche.plan.echelle")}</span>
          <select value={options.echelle} onChange={(e) => onOptions({ ...options, echelle: Number(e.target.value) })} onKeyDown={arreter} data-planche-plan-option="echelle">
            {ECHELLES_PLAN.map((e) => <option key={e} value={e}>{`1:${e}`}</option>)}
          </select>
        </label>
        <label className="planche-plan-champ">
          <span>{t("planche.plan.coupe")}</span>
          <select value={coupe} onChange={(e) => onOptions({ ...options, coupe: e.target.value })} onKeyDown={arreter} data-planche-plan-option="coupe">
            <option value="aucune">{t("planche.plan.coupe.aucune")}</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{t("planche.plan.coupe.plan", { nom: p.nom })}</option>)}
          </select>
        </label>
        <label className="planche-plan-champ">
          <span>{t("planche.plan.cachees")}</span>
          <select value={options.cachees} onChange={(e) => onOptions({ ...options, cachees: e.target.value as OptionsPlan["cachees"] })} onKeyDown={arreter} data-planche-plan-option="cachees">
            <option value="pointille">{t("planche.plan.cachees.pointille")}</option>
            <option value="masquees">{t("planche.plan.cachees.masquees")}</option>
          </select>
        </label>
      </div>
      <dl className="planche-plan-traits">
        {(["coupe", "vu", "cache"] as const).map((c) => (
          <div key={c} className="planche-plan-trait" data-planche-plan-trait={c}>
            <dt>{t(`planche.plan.trait.${c}`)}</dt>
            <dd className={`planche-plan-trait-echantillon est-${c}`} aria-hidden="true" />
            <dd>{`${nombre(TRAITS_PLAN[c], 2)} mm`}</dd>
          </div>
        ))}
      </dl>
      <div className="planche-plan-apercu" role="img" aria-label={t("planche.plan.apercu")} data-planche-plan-apercu={apercu ? (apercu.vide ? "vide" : "dessin") : "attente"}>
        {apercu && !apercu.vide ? <img alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(apercu.svg)}`} /> : <p className="inspecteur-aide">{t("planche.plan.vide")}</p>}
      </div>
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.plan.barre")}>
        {bouton("exporter-plan-svg", "est-principal", true)}
        {bouton("rafraichir-plan", "")}
      </div>

      <h3 className="planche-plan-titre" tabIndex={-1} ref={refMotifs} data-planche-plan-motifs>
        <Pictogramme picto={commandeMotifs.picto} /> {t("planche.plan.motifs")}
        <span className="planche-plan-titre-raccourci">{afficherRaccourci(commandeMotifs.raccourci)}</span>
      </h3>
      {motifs.length === 0 ? (
        <p className="inspecteur-aide" data-planche-motifs-vide>{t("planche.plan.motifs.vide")}</p>
      ) : (
        <table className="planche-debit-table planche-plan-table">
          <thead>
            <tr>
              <th>{t("planche.plan.colonne.motif")}</th>
              <th>{t("planche.plan.colonne.apercu")}</th>
              <th className="planche-locaux-n">{t("planche.plan.colonne.angle")}</th>
              <th className="planche-locaux-n">{t("planche.plan.colonne.pas")}</th>
              <th>{t("planche.plan.colonne.matieres")}</th>
            </tr>
          </thead>
          <tbody>
            {motifs.map((m) => {
              const est = m.id === choisi;
              const edition = est && !lecture;
              const champ = (c: keyof SaisieMotif) => (
                <input
                  value={saisie[c]}
                  inputMode={c === "nom" ? "text" : "decimal"}
                  aria-label={t(`planche.plan.champ.${c}`)}
                  onClick={arreter}
                  onKeyDown={(e) => { arreter(e); if (e.key === "Enter") enregistrer(); }}
                  onBlur={enregistrer}
                  onChange={(e) => setSaisie({ ...saisie, [c]: e.target.value })}
                  data-planche-motif-champ={c}
                />
              );
              return (
                <tr key={m.id} tabIndex={0} aria-selected={est} className={est ? "est-choisi" : ""} onClick={() => onChoisir(m.id)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), onChoisir(m.id))} data-planche-motif={m.id}>
                  <td translate="no">{edition ? champ("nom") : m.nom}</td>
                  <td><VignetteMotif motif={m} /></td>
                  <td className="planche-locaux-n">{edition ? champ("angle") : `${nombre(m.familles[0]?.angle ?? 0, 0)}°`}</td>
                  <td className="planche-locaux-n">{edition ? champ("pas") : nombre(Math.abs(m.familles[0]?.dy ?? 0), 2)}</td>
                  <td translate="no">
                    {edition ? (
                      matieres.length === 0 ? (
                        <span className="inspecteur-aide">{t("planche.plan.matieres.aucune")}</span>
                      ) : (
                        <span className="planche-plan-matieres">
                          {matieres.map((x) => (
                            <label key={x.id} onClick={arreter}>
                              <input type="checkbox" checked={x.motif === m.id} onChange={(e) => onAssocier(x.id, e.target.checked ? m.id : null)} onKeyDown={arreter} data-planche-motif-matiere={x.id} /> {x.nom}
                            </label>
                          ))}
                        </span>
                      )
                    ) : (
                      parMotif(m.id).map((x) => x.nom).join(", ")
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="planche-debit-barre" role="toolbar" aria-label={t("planche.plan.motifs.barre")}>
        {(["nouveau-motif", "importer-motif", "supprimer-motif"] as const).map((id) => bouton(id, ""))}
      </div>
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-plan-erreur>{erreur}</p>}
      <p className="inspecteur-aide">{t("planche.plan.motifs.note")}</p>
      {note && <p className="inspecteur-aide" role="status" data-planche-plan-note>{note}</p>}
    </div>
  );
}
