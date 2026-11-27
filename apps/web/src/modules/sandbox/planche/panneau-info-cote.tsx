/**
 * Info entité d'une cote (cas 2 du catalogue, lot 1, maquette lot1-2 validée le 27 novembre 2026) : valeur mesurée
 * pleine, association aux sommets, direction mesurée, valeur pilotante, texte forcé, style, plage gardée et cotes
 * orphelines. Composant React pur : il reçoit le modèle et des rappels ; la Planche applique les opérations.
 */
import { useEffect, useState } from "react";
import { type Cote, type DirectionCote, type Id, type Modele, controlerCotes, formaterPlage, lirePlage, pointsCote, reglagesDe, texteCote, valeurCote, valeurPleine } from "@parcours/sandbox-planche-model";
import { t } from "../messages";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const DIRECTIONS: readonly DirectionCote[] = ["alignee", "horizontale", "verticale", "axe-x", "axe-y", "axe-z"];

export interface ActionsInfoCote {
  modifierCote(id: Id, patch: { texteForce?: string | null; style?: Id | null; direction?: DirectionCote; plage?: { min?: number; max?: number } | null }): void;
  piloterCote(id: Id, valeur: number): void;
  selectionnerCotes(ids: readonly Id[]): void;
}

export function PanneauInfoCote({ modele, id, lecture, separateur, precision, actions }: { modele: Modele; id: Id; lecture: boolean; separateur: "." | ","; precision: number; actions: ActionsInfoCote }) {
  const c: Cote | undefined = modele.annotations?.cotes[id];
  const [valeur, setValeur] = useState("");
  const [plage, setPlage] = useState("");
  const [erreurPlage, setErreurPlage] = useState(false);
  useEffect(() => {
    setValeur("");
    setPlage(c && c.genre === "lineaire" ? formaterPlage(c.plage, separateur) : "");
    setErreurPlage(false);
  }, [id, c, separateur]);
  if (!c) return <p className="inspecteur-aide">{t("planche.info.aucune")}</p>;
  const r = reglagesDe(modele);
  const p = pointsCote(modele, c);
  const v = valeurCote(modele, c);
  const affichee = texteCote(modele, c, precision, separateur);
  const styles = Object.values(r.stylesCote ?? {});
  const orphelines = controlerCotes(modele, precision).orphelines;
  const hors = c.genre === "lineaire" && v !== null && c.plage && ((c.plage.min !== undefined && v < c.plage.min - 1e-9) || (c.plage.max !== undefined && v > c.plage.max + 1e-9));
  const nbSommets = c.genre === "lineaire" || c.genre === "pente" ? (c.sommets ? 2 : 0) : c.genre === "niveau" ? (c.sommet ? 1 : 0) : 0;
  const piloter = () => {
    const n = Number(valeur.replace(",", "."));
    if (valeur.trim() !== "" && Number.isFinite(n)) actions.piloterCote(id, n);
  };
  const appliquerPlage = () => {
    const l = lirePlage(plage);
    if (l === null) return setErreurPlage(true);
    setErreurPlage(false);
    actions.modifierCote(id, { plage: l ?? null });
  };
  return (
    <dl className="planche-info planche-info-cote" data-planche-info="cote" data-planche-info-cote={c.genre}>
      <dt>{t(`planche.cote.genre.${c.genre}`)}</dt>
      <dd />
      <dt>{t("planche.cote.mesuree")}</dt>
      <dd data-planche-info-cote-valeur>{v === null ? affichee.plein : c.genre === "lineaire" || c.genre === "diametre" ? valeurPleine(v, separateur) : affichee.plein}</dd>
      <dt>{t("planche.cote.association")}</dt>
      <dd data-planche-info-cote-association={p.association}>
        {p.association === "associee"
          ? t("planche.cote.association.associee", { sommets: String(nbSommets) })
          : p.association === "orpheline"
            ? t("planche.cote.association.orpheline")
            : t("planche.cote.association.libre")}
      </dd>
      {c.genre === "lineaire" && (
        <>
          <dt><label htmlFor="planche-cote-direction">{t("planche.cote.direction")}</label></dt>
          <dd>
            <select id="planche-cote-direction" value={c.direction ?? "alignee"} disabled={lecture} onKeyDown={arreter} onChange={(e) => actions.modifierCote(id, { direction: e.target.value as DirectionCote })} data-planche-info-cote-direction>
              {DIRECTIONS.map((d) => (
                <option key={d} value={d}>{t(`planche.cote.direction.${d}`)}</option>
              ))}
            </select>
          </dd>
          <dt><label htmlFor="planche-cote-pilote">{t("planche.cote.pilote")}</label></dt>
          <dd>
            <input
              id="planche-cote-pilote"
              inputMode="decimal"
              value={valeur}
              placeholder={v === null ? "" : affichee.texte.replace(/^≈ /, "")}
              disabled={lecture || p.association !== "associee"}
              title={p.association !== "associee" ? t("planche.cote.pilote.libre") : t("planche.cote.pilote.aide")}
              onKeyDown={(e) => {
                arreter(e);
                if (e.key === "Enter") piloter();
              }}
              onChange={(e) => setValeur(e.target.value)}
              data-planche-info-cote-pilote
            />
            <button type="button" disabled={lecture || p.association !== "associee" || valeur.trim() === ""} onClick={piloter} data-planche-info-cote-piloter>{t("planche.cote.appliquer")}</button>
          </dd>
        </>
      )}
      <dt><label htmlFor="planche-cote-texte">{t("planche.cote.texte-force")}</label></dt>
      <dd>
        <input
          id="planche-cote-texte"
          value={c.texteForce ?? ""}
          placeholder={t("planche.cote.texte-force.aucun")}
          disabled={lecture}
          onKeyDown={arreter}
          onChange={(e) => actions.modifierCote(id, { texteForce: e.target.value === "" ? null : e.target.value })}
          data-planche-info-cote-texte
        />
      </dd>
      <dt><label htmlFor="planche-cote-style">{t("planche.cote.style")}</label></dt>
      <dd>
        <select id="planche-cote-style" value={c.style ?? ""} disabled={lecture} onKeyDown={arreter} onChange={(e) => actions.modifierCote(id, { style: e.target.value || null })} data-planche-info-cote-style>
          <option value="">{t("planche.cote.style.modele")}</option>
          {styles.map((s) => (
            <option key={s.id} value={s.id}>{s.nom}</option>
          ))}
        </select>
      </dd>
      {c.genre === "lineaire" && (
        <>
          <dt><label htmlFor="planche-cote-plage">{t("planche.cote.plage")}</label></dt>
          <dd>
            <input
              id="planche-cote-plage"
              value={plage}
              placeholder="≥ 4,00 · ≤ 2,50 · 2,40 – 2,60"
              disabled={lecture}
              aria-invalid={erreurPlage}
              onKeyDown={(e) => {
                arreter(e);
                if (e.key === "Enter") appliquerPlage();
              }}
              onChange={(e) => setPlage(e.target.value)}
              onBlur={appliquerPlage}
              data-planche-info-cote-plage
            />
            {erreurPlage && <small role="alert">{t("planche.cote.plage.illisible")}</small>}
            <small>{t("planche.cote.plage.aide")}</small>
            {hors && <small className="planche-info-cote-alerte" role="status" data-planche-info-cote-hors>{t("planche.cote.plage.hors")}</small>}
          </dd>
        </>
      )}
      <dt>{t("planche.cote.controle")}</dt>
      <dd data-planche-info-cote-orphelines={orphelines.length}>
        {orphelines.length === 0 ? (
          t("planche.cote.orphelines.aucune")
        ) : (
          <button type="button" onClick={() => actions.selectionnerCotes(orphelines)} data-planche-info-cote-selectionner-orphelines>
            {t("planche.cote.orphelines.selectionner", { nombre: String(orphelines.length) })}
          </button>
        )}
      </dd>
    </dl>
  );
}
