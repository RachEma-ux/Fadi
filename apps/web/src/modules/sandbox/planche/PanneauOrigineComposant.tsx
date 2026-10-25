/**
 * Panneau « Origine et axes du composant » (chantier Axes, lot AX-4 ; concept Axes 1.0, § 7). Édition d'objet : l'objet,
 * sa définition et le nombre d'occurrences sont montrés AVANT l'aperçu ; la portée est explicite (cette occurrence,
 * rendue unique si partagée — ou toutes, avec le compte hors sélection) ; origine (27 ancrages de la boîte locale,
 * préréglages, point libre local, origine du repère de travail) et orientation sont deux choix séparés ; l'aperçu
 * montre la nouvelle origine et les nouveaux axes sur l'objet ; un refus dit pourquoi ; Appliquer = un seul pas.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ANCRAGE_CENTRE_BASE,
  ANCRAGE_CENTRE_BOITE,
  ANCRAGE_COIN_MIN,
  type Ancrage,
  type ContexteTravail,
  type Modele,
  type OptionsOrigine,
  type PositionAncrage,
  type Vec3,
  changerOrigineLot,
  repereDuContexte,
} from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";
import { lireNombre } from "./BarreReperes";

export interface PropsPanneauOrigine {
  modele: Modele;
  /** Groupes et composants sélectionnés (un ou plusieurs : lot). */
  occurrences: readonly string[];
  contexte: ContexteTravail;
  lecture: boolean;
  separateurDecimal: "." | ",";
  onApercu: (r: { origine: Vec3; x: Vec3; y: Vec3; z: Vec3 } | null) => void;
  onAppliquer: (opts: OptionsOrigine) => void;
  onFermer: () => void;
}

const POSITIONS: readonly PositionAncrage[] = ["min", "centre", "max"];
const nombre = (v: number, sep: "." | ",") => {
  const s = (Math.abs(v) < 5e-4 ? 0 : v).toFixed(3);
  return sep === "," ? s.replace(".", ",") : s;
};

function definitionDe(m: Modele, id: string): string | undefined {
  for (const c of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) {
    const o = c.occurrences[id];
    if (o) return o.definition;
  }
  return undefined;
}

export function PanneauOrigineComposant(p: PropsPanneauOrigine) {
  const [mode, setMode] = useState<"ancrage" | "local" | "travail">("ancrage");
  const [ancrage, setAncrage] = useState<Ancrage>(ANCRAGE_CENTRE_BASE);
  const [local, setLocal] = useState<[string, string, string]>(["0", "0", "0"]);
  const [orientation, setOrientation] = useState<"garder" | "travail">("garder");
  const [portee, setPortee] = useState<"occurrence" | "toutes">("toutes");

  const opts = useMemo((): OptionsOrigine | null => {
    const r = repereDuContexte(p.contexte);
    let origine: OptionsOrigine["origine"];
    if (mode === "ancrage") origine = { genre: "ancrage", ancrage };
    else if (mode === "travail") origine = { genre: "monde", point: r.origine };
    else {
      const v = local.map(lireNombre);
      if (v.some((x) => x === null)) return null;
      origine = { genre: "local", point: { x: v[0]!, y: v[1]!, z: v[2]! } };
    }
    return { origine, orientation: orientation === "travail" ? { genre: "repere", repere: r } : { genre: "garder" }, portee };
  }, [p.contexte, mode, ancrage, local, orientation, portee]);

  const lot = useMemo(() => (opts ? changerOrigineLot(p.modele, p.occurrences, opts).apercu : null), [p.modele, p.occurrences, opts]);
  const premier = lot?.eligibles[0] ?? null;
  const onApercu = p.onApercu;
  useEffect(() => {
    onApercu(premier ? { origine: premier.origineMonde, ...premier.axesMonde } : null);
  }, [premier, onApercu]);
  useEffect(() => () => onApercu(null), [onApercu]);

  const nomDe = (id: string) => {
    for (const c of [p.modele.racine, ...Object.values(p.modele.definitions).map((d) => d.contenu)]) {
      const o = c.occurrences[id];
      if (o) return o.nom ?? p.modele.definitions[o.definition]?.nom ?? id;
    }
    return id;
  };
  const vecteur = (v: Vec3) => `(${nombre(v.x, p.separateurDecimal)} ; ${nombre(v.y, p.separateurDecimal)} ; ${nombre(v.z, p.separateurDecimal)})`;
  // Portée « toutes » : toutes les occurrences de la définition, y compris celles hors de la sélection (concept § 7.2).
  const total = premier?.occurrences ?? 0;
  const selectionnees = premier ? p.occurrences.filter((id) => definitionDe(p.modele, id) === premier.definition).length : 0;
  const horsSelection = Math.max(0, total - selectionnees);

  return (
    <section className="planche-panneau planche-origine" aria-label={t("planche.origine.titre")} data-planche-origine>
      <header className="canevas-panneau-tete">
        <h3>{t("planche.origine.titre")}</h3>
        <button type="button" className="canevas-fermer" onClick={p.onFermer} aria-label={t("panneau.fermer", { titre: t("planche.origine.titre") })} data-origine-fermer>
          <IconeSandbox nom="fermer" />
        </button>
      </header>
      <div className="canevas-panneau-corps planche-options">
        {premier && <p data-origine-objet>{t("planche.origine.objet", { nom: premier.nom, occurrences: String(premier.occurrences) })}</p>}
        {lot && p.occurrences.length > 1 && (
          <p data-origine-lot>{t("planche.origine.lot", { eligibles: String(lot.eligibles.length), ecartes: String(lot.ecartes.length), definitions: String(lot.definitions.length) })}</p>
        )}
        {lot?.ecartes.map((e) => (
          <p key={e.occurrence} className="planche-reperes-erreur" role="alert" data-origine-ecarte={e.occurrence}>
            {t("planche.origine.ecarte", { nom: nomDe(e.occurrence), motif: e.motif })}
          </p>
        ))}
        <fieldset>
          <legend>{t("planche.origine.portee")}</legend>
          <label>
            <input type="radio" name="origine-portee" checked={portee === "occurrence"} onChange={() => setPortee("occurrence")} data-origine-portee="occurrence" />
            {t("planche.origine.portee.occurrence")}
          </label>
          <label>
            <input type="radio" name="origine-portee" checked={portee === "toutes"} onChange={() => setPortee("toutes")} data-origine-portee="toutes" />
            {t("planche.origine.portee.toutes", { touchees: String(total), hors: String(horsSelection) })}
          </label>
        </fieldset>
        <fieldset>
          <legend>{t("planche.origine.origine")}</legend>
          {(["ancrage", "local", "travail"] as const).map((m) => (
            <label key={m}>
              <input type="radio" name="origine-mode" checked={mode === m} onChange={() => setMode(m)} data-origine-mode={m} />
              {t(`planche.origine.mode.${m}`)}
            </label>
          ))}
          {mode === "ancrage" && (
            <div className="planche-origine-ancrage">
              <div className="barre-groupe">
                <button type="button" onClick={() => setAncrage(ANCRAGE_CENTRE_BASE)} data-origine-preset="base">{t("planche.origine.preset.base")}</button>
                <button type="button" onClick={() => setAncrage(ANCRAGE_CENTRE_BOITE)} data-origine-preset="boite">{t("planche.origine.preset.boite")}</button>
                <button type="button" onClick={() => setAncrage(ANCRAGE_COIN_MIN)} data-origine-preset="coin">{t("planche.origine.preset.coin")}</button>
              </div>
              {(["x", "y", "z"] as const).map((k) => (
                <label key={k}>
                  {t(`planche.origine.axe.${k}`)}
                  <select value={ancrage[k]} onChange={(e) => setAncrage({ ...ancrage, [k]: e.target.value as PositionAncrage })} data-origine-ancrage={k}>
                    {POSITIONS.map((pos) => (
                      <option key={pos} value={pos}>{t(`planche.origine.pos.${pos}`)}</option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {mode === "local" &&
            (["x", "y", "z"] as const).map((k, i) => (
              <label key={k}>
                {k.toUpperCase()}
                <input inputMode="decimal" value={local[i]} onChange={(e) => setLocal((v) => v.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])} data-origine-local={k} />
              </label>
            ))}
        </fieldset>
        <fieldset>
          <legend>{t("planche.origine.orientation")}</legend>
          <label>
            <input type="radio" name="origine-orientation" checked={orientation === "garder"} onChange={() => setOrientation("garder")} data-origine-orientation="garder" />
            {t("planche.origine.orientation.garder")}
          </label>
          <label>
            <input type="radio" name="origine-orientation" checked={orientation === "travail"} onChange={() => setOrientation("travail")} data-origine-orientation="travail" />
            {t("planche.origine.orientation.travail")}
          </label>
        </fieldset>
        {!opts && <p className="planche-reperes-erreur" role="alert">{t("planche.reperes.invalide")}</p>}
        {premier && (
          <p data-origine-apercu>
            {t("planche.origine.apercu", { origine: vecteur(premier.origineMonde), x: vecteur(premier.axesMonde.x) })}
          </p>
        )}
        <p className="inspecteur-aide">{t("planche.origine.monde-fixe")}</p>
        <div className="barre-groupe">
          <button type="button" disabled={p.lecture || !opts || !premier} onClick={() => opts && p.onAppliquer(opts)} data-origine-appliquer>
            {t("planche.origine.appliquer")}
          </button>
          <button type="button" onClick={p.onFermer} data-origine-annuler>{t("planche.origine.annuler")}</button>
        </div>
      </div>
    </section>
  );
}
