/**
 * Cas 2 du catalogue, lot 5 — emplacement, altitudes et soleil (maquettes validées le 28 novembre 2026,
 * `analyses/catalogue-extensions/cas-2/lot-5/`). Réglages par interaction :
 * - ±0,00 du projet (n° 5) : une seule altitude NGF, cliquée puis tapée en place (Entrée enregistre, Échap abandonne) ;
 *   c'est le niveau de référence des Niveaux et le H du point de base ;
 * - système de coordonnées et d'altitudes (n° 92) : liste fermée lue par l'API (systèmes dont Fadi a la définition),
 *   rappelée dans Info modèle ;
 * - altitudes basse et haute et encombrement de l'objet (n° 45, 18) dans Info entité ;
 * - diagramme de la course solaire et des masques depuis un point (n° 110).
 * Interface ≠ base de données : aucune valeur n'est fournie par le code ; une valeur absente est « non évaluée ».
 */
import { type Id, type Modele, type PointDeBase, type ResultatCourseSolaire, encombrement, lireAltitude, texteHeure, versNGF } from "@parcours/sandbox-planche-model";
import { useEffect, useState } from "react";
import { LANGUE_INTERFACE, t } from "../messages";
import type { SystemesConnus } from "./projections-client";

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();
const separateur = (): "," | "." => (LANGUE_INTERFACE === "en" ? "." : ",");
const metres = (v: number, d = 2): string => `${v.toFixed(d).replace(".", separateur())} m`;
const signe = (v: number): string => {
  const a = Math.round(v * 100) / 100;
  const s = Math.abs(a).toFixed(2).replace(".", separateur());
  return a === 0 ? `±${s}` : a > 0 ? `+${s}` : `−${s}`;
};

/** ±0,00 du projet (n° 5) : valeur cliquée puis tapée en place. */
export function SectionZeroProjet({ reference, lecture, erreur, onReference }: { reference: number | null; lecture: boolean; erreur: boolean; onReference: (texte: string) => void }) {
  const [saisie, setSaisie] = useState<string | null>(null);
  useEffect(() => setSaisie(null), [reference]);
  const texte = reference === null ? t("planche.l5.zero.non-declare") : metres(reference);
  return (
    <section className="planche-l5-zero" data-planche-zero={reference === null ? "non-declare" : reference}>
      <h4>{t("planche.l5.zero.titre")}</h4>
      <div className="planche-debit-reglages">
        <label className="planche-debit-champ">
          <span>{t("planche.l5.zero.libelle")}</span>
          {saisie === null ? (
            <button type="button" className="planche-l5-valeur" disabled={lecture} title={t("planche.l5.zero.modifier")} onClick={() => setSaisie(reference === null ? "" : String(reference).replace(".", separateur()))} data-planche-zero-valeur>
              {texte}
            </button>
          ) : (
            <input
              autoFocus
              value={saisie}
              inputMode="decimal"
              aria-label={t("planche.l5.zero.libelle")}
              aria-invalid={erreur}
              onChange={(e) => setSaisie(e.target.value)}
              onBlur={() => setSaisie(null)}
              onKeyDown={(e) => {
                arreter(e);
                if (e.key === "Enter") {
                  e.preventDefault();
                  onReference(saisie);
                  // Une valeur lisible (ou vide, pour retirer) ferme la saisie ; sinon elle reste ouverte avec l'erreur.
                  if (saisie.trim() === "" || lireAltitude(saisie) !== null) setSaisie(null);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setSaisie(null);
                }
              }}
              data-planche-zero-saisie
            />
          )}
        </label>
      </div>
      <p className="inspecteur-aide">{t("planche.l5.zero.aide")}</p>
      {erreur && <p className="inspecteur-aide" role="alert" data-planche-zero-erreur>{t("planche.l5.zero.erreur")}</p>}
    </section>
  );
}

/** Système de coordonnées et d'altitudes (n° 92) : liste fermée ; il s'enregistre avec le point de base. */
export function SectionSystemes({ point, systemes, lecture, onSysteme }: { point: PointDeBase | null; systemes: SystemesConnus | null; lecture: boolean; onSysteme: (horizontal: string) => void }) {
  const horizontaux = systemes?.horizontaux ?? [];
  const courant = point?.systeme ?? "";
  const horsListe = courant !== "" && !horizontaux.some((s) => s.code === courant);
  return (
    <section className="planche-l5-systemes" data-planche-systemes={systemes === null ? "non-lu" : String(horizontaux.length)}>
      <h4>{t("planche.l5.systemes.titre")}</h4>
      <div className="planche-debit-reglages">
        <label className="planche-debit-champ">
          <span>{t("planche.l5.systemes.horizontal")}</span>
          <select value={courant} disabled={lecture || !point || systemes === null} onKeyDown={arreter} onChange={(e) => onSysteme(e.target.value)} data-planche-systeme-horizontal>
            {courant === "" && <option value="">{t("planche.l5.systemes.non-declare")}</option>}
            {horizontaux.map((s) => (
              <option key={s.code} value={s.code} translate="no">{s.code}</option>
            ))}
            {horsListe && <option value={courant} translate="no">{t("planche.l5.systemes.prj", { code: courant })}</option>}
          </select>
        </label>
        <label className="planche-debit-champ">
          <span>{t("planche.l5.systemes.vertical")}</span>
          <select value={point?.systemeVertical ?? ""} disabled data-planche-systeme-vertical>
            <option value="">{t("planche.l5.systemes.non-declare")}</option>
            {(systemes?.verticaux ?? []).map((s) => (
              <option key={s.code} value={s.code} translate="no">{s.code}</option>
            ))}
            {point?.systemeVertical && !(systemes?.verticaux ?? []).some((s) => s.code === point.systemeVertical) && <option value={point.systemeVertical} translate="no">{point.systemeVertical}</option>}
          </select>
        </label>
      </div>
      <p className="inspecteur-aide">{t(systemes === null ? "planche.l5.systemes.non-lu" : !point ? "planche.l5.systemes.sans-point" : "planche.l5.systemes.aide")}</p>
    </section>
  );
}

/** Rappel du système et du ±0,00 dans Info modèle (n° 92). */
export function RappelSysteme({ point, reference }: { point: PointDeBase | null; reference: number | null }) {
  return (
    <div className="planche-l5-rappel" data-planche-rappel-systeme={point?.systeme ?? "non-declare"}>
      <h4>{t("planche.l5.systemes.titre")}</h4>
      <dl>
        <dt>{t("planche.l5.systemes.horizontal")}</dt>
        <dd translate="no">{point?.systeme || t("planche.l5.systemes.non-declare")}</dd>
        <dt>{t("planche.l5.systemes.vertical")}</dt>
        <dd translate="no">{point?.systemeVertical || t("planche.l5.systemes.non-declare")}</dd>
        <dt>{t("planche.l5.zero.libelle")}</dt>
        <dd data-planche-rappel-zero>{reference === null ? t("planche.l5.zero.non-declare") : metres(reference)}</dd>
      </dl>
    </div>
  );
}

/** Altitudes basse et haute et encombrement d'une sélection de la racine (n° 45 ; même panneau sur tablette, n° 18). */
export function SectionAltitudes({ modele, ids, reference }: { modele: Modele; ids: readonly Id[]; reference: number | null }) {
  const e = encombrement(modele, ids);
  if (!e) return null;
  const ligne = (z: number) => {
    const ngf = versNGF(z, reference);
    return `${signe(z)} · ${ngf === null ? t("planche.l5.ngf-non-evaluee") : `${ngf.toFixed(2).replace(".", separateur())} NGF`}`;
  };
  const n = (v: number) => v.toFixed(2).replace(".", separateur());
  return (
    <>
      <dt>{t("planche.l5.altitude.basse")}</dt>
      <dd data-planche-altitude-basse={e.basse}>{ligne(e.basse)}</dd>
      <dt>{t("planche.l5.altitude.haute")}</dt>
      <dd data-planche-altitude-haute={e.haute}>{ligne(e.haute)}</dd>
      <dt>{t("planche.l5.encombrement")}</dt>
      <dd data-planche-encombrement>{`${n(e.longueur)} × ${n(e.largeur)} × ${n(e.hauteur)} m`}</dd>
    </>
  );
}

/** Diagramme solaire (projection stéréographique, nord en haut) : courses du 21 juin, 21 mars, 21 décembre et masques. */
export function DiagrammeCourseSolaire({ resultat, reference, onFermer }: { resultat: ResultatCourseSolaire; reference: number | null; onFermer: () => void }) {
  const R = 150;
  const C = 170;
  const xy = (azimut: number, hauteur: number): [number, number] => {
    const r = R * Math.tan(((90 - Math.max(0, hauteur)) * Math.PI) / 360);
    const a = (azimut * Math.PI) / 180;
    return [C + r * Math.sin(a), C - r * Math.cos(a)];
  };
  const s = resultat.silhouette;
  // Masques : un quadrilatère par intervalle couvert de chaque tranche (un objet en hauteur laisse le ciel dessous).
  const pt = ([x, y]: [number, number]) => `${x.toFixed(1)},${y.toFixed(1)}`;
  const masque = s.intervalles
    .flatMap((liste, k) => liste.map(([lo, hi]) => `M${pt(xy(k * s.pas, lo))}L${pt(xy((k + 1) * s.pas, lo))}L${pt(xy((k + 1) * s.pas, hi))}L${pt(xy(k * s.pas, hi))}Z`))
    .join("");
  // Couleurs déjà en usage dans la Planche (aucune couleur nouvelle) : juin, mars, décembre.
  const couleurs = ["#e0a800", "#b54708", "#1f1f1f"];
  const p = resultat.point;
  const ngf = versNGF(p.z, reference);
  return (
    <div className="planche-course-solaire" role="dialog" aria-label={t("planche.l5.course.titre")} data-planche-course-solaire onKeyDown={arreter}>
      <div className="planche-course-solaire-tete">
        <b>{t("planche.l5.course.titre")}</b>
        <button type="button" onClick={onFermer} aria-label={t("planche.l5.course.fermer")} data-planche-course-fermer>×</button>
      </div>
      <p className="inspecteur-aide" data-planche-course-point>
        {t("planche.l5.course.point", { x: p.x.toFixed(2).replace(".", separateur()), y: p.y.toFixed(2).replace(".", separateur()), z: signe(p.z), ngf: ngf === null ? t("planche.l5.ngf-non-evaluee") : `${ngf.toFixed(2).replace(".", separateur())} NGF` })}
      </p>
      <svg viewBox="0 0 340 340" width="340" height="340" role="img" aria-label={t("planche.l5.course.titre")}>
        {[90, 60, 30].map((h) => (
          <circle key={h} cx={C} cy={C} r={R * Math.tan(((90 - (90 - h)) * Math.PI) / 360) || R} fill="none" stroke="currentColor" strokeOpacity={0.2} />
        ))}
        <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeOpacity={0.35} />
        <text x={C - 4} y={C - R - 6}>N</text>
        <text x={C + R + 6} y={C + 4}>E</text>
        <text x={C - 4} y={C + R + 16}>S</text>
        <text x={C - R - 18} y={C + 4}>O</text>
        {masque && <path d={masque} fill="currentColor" fillOpacity={0.25} stroke="none" data-planche-course-masque />}
        {resultat.courses.map((c, i) => (
          <polyline key={`${c.mois}-${c.jour}`} points={c.points.map((q) => xy(q.azimut, q.hauteur).map((v) => v.toFixed(1)).join(",")).join(" ")} fill="none" stroke={couleurs[i]} strokeWidth={2.4} data-planche-course-jour={`${c.mois}-${c.jour}`} />
        ))}
      </svg>
      <ul className="planche-course-solaire-liste">
        {resultat.courses.map((c, i) => (
          <li key={`${c.mois}-${c.jour}`} data-planche-course-masquees={c.masquees.length}>
            <span style={{ color: couleurs[i] }}>{t(`planche.l5.course.date-${c.mois}` as "planche.l5.course.date-6")}</span>
            {" : "}
            {c.points.length === 0 ? t("planche.l5.course.nuit") : c.masquees.length === 0 ? t("planche.l5.course.aucun-masque") : c.masquees.map((m) => t("planche.l5.course.masque", { de: texteHeure(m.de), a: texteHeure(m.a) })).join(" ; ")}
          </li>
        ))}
      </ul>
      <p className="inspecteur-aide">{t(resultat.legale ? "planche.l5.course.heure-legale" : "planche.l5.course.heure-solaire")}</p>
      <p className="inspecteur-aide">{t("planche.l5.course.limites")}</p>
    </div>
  );
}

/** Altitude du point visé (n° 18), relative au ±0,00 et NGF, au pied de la vue pendant le dessin. */
export function EtiquetteVise({ z, reference }: { z: number; reference: number | null }) {
  const ngf = versNGF(z, reference);
  return (
    <p className="planche-vise" aria-live="off" data-planche-vise={z} data-planche-vise-ngf={ngf ?? "non-evaluee"}>
      {t("planche.l5.vise", { z: signe(z), ngf: ngf === null ? t("planche.l5.ngf-non-evaluee") : `${ngf.toFixed(2).replace(".", separateur())} NGF` })}
    </p>
  );
}
