/**
 * Panneau Profilés (lot L12, D-215) : choix de la section des outils Profilé et Profilés depuis arêtes — dimensions saisies (mm, aucune valeur par défaut) ou face sélectionnée. Le panneau ne
 * calcule rien : `sections-planche.ts` fait la conversion, la Planche passe la section aux machines.
 */
import type { SectionCourante } from "@parcours/sandbox-planche-model";
import { t } from "../messages";
import { type DimensionsSaisies, FORMES_SAISIE, SAISIE_AVEC_AILE, SAISIE_AVEC_EPAISSEUR, SAISIE_AVEC_HAUTEUR, texteSource, type FormeSaisie } from "./sections-planche";

export type ChoixSection =
  | { readonly mode: "saisie"; readonly dimensions: DimensionsSaisies }
  | { readonly mode: "face"; readonly section: SectionCourante | null };

const arreter = (e: { stopPropagation(): void }) => e.stopPropagation();

export function PanneauProfiles({
  choix,
  onChoix,
  section,
  erreur,
  onFace,
  onPoser,
  lecture,
}: {
  choix: ChoixSection;
  onChoix: (c: ChoixSection) => void;
  section: SectionCourante | null;
  erreur: string | null;
  onFace: () => void;
  onPoser?: () => void;
  lecture: boolean;
}) {
  const champ = (cle: keyof DimensionsSaisies, libelle: string, d: DimensionsSaisies) => (
    <label className="planche-profiles-champ">
      <span>{libelle}</span>
      <input inputMode="decimal" value={d[cle]} disabled={lecture} data-planche-profiles-champ={cle} onKeyDown={arreter} onChange={(e) => onChoix({ mode: "saisie", dimensions: { ...d, [cle]: e.target.value } })} />
    </label>
  );
  return (
    <section className="planche-profiles" aria-label={t("planche.profiles.titre")} data-planche-profiles>
      <label className="planche-profiles-champ">
        <span>{t("planche.profiles.source")}</span>
        <select
          value={choix.mode}
          disabled={lecture}
          data-planche-profiles-mode
          onKeyDown={arreter}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "face") onChoix({ mode: "face", section: null });
            else onChoix({ mode: "saisie", dimensions: { forme: "rectangle", largeur: "", hauteur: "", epaisseur: "", epaisseurAile: "", segments: "" } });
          }}
        >
          <option value="saisie">{t("planche.profiles.mode.saisie")}</option>
          <option value="face">{t("planche.profiles.mode.face")}</option>
        </select>
      </label>
      {choix.mode === "saisie" && (
        <>
          <label className="planche-profiles-champ">
            <span>{t("planche.profiles.forme")}</span>
            <select value={choix.dimensions.forme} disabled={lecture} data-planche-profiles-forme onKeyDown={arreter} onChange={(e) => onChoix({ mode: "saisie", dimensions: { ...choix.dimensions, forme: e.target.value as FormeSaisie } })}>
              {FORMES_SAISIE.map((f) => (
                <option key={f} value={f}>{t(`planche.profiles.forme.${f}` as Parameters<typeof t>[0])}</option>
              ))}
            </select>
          </label>
          {champ("largeur", choix.dimensions.forme === "rond" || choix.dimensions.forme === "rond-creux" ? t("planche.profiles.diametre") : t("planche.profiles.largeur"), choix.dimensions)}
          {SAISIE_AVEC_HAUTEUR.includes(choix.dimensions.forme) && champ("hauteur", t("planche.profiles.hauteur"), choix.dimensions)}
          {SAISIE_AVEC_EPAISSEUR.includes(choix.dimensions.forme) && champ("epaisseur", t("planche.profiles.epaisseur"), choix.dimensions)}
          {SAISIE_AVEC_AILE.includes(choix.dimensions.forme) && champ("epaisseurAile", t("planche.profiles.aile"), choix.dimensions)}
          {(choix.dimensions.forme === "rond" || choix.dimensions.forme === "rond-creux") && champ("segments", t("planche.profiles.segments"), choix.dimensions)}
        </>
      )}
      {choix.mode === "face" && (
        <button type="button" disabled={lecture} onClick={onFace} data-planche-profiles-face>
          {t("planche.profiles.face")}
        </button>
      )}
      <output className={erreur ? "planche-profiles-etat planche-profiles-erreur" : "planche-profiles-etat"} aria-live="polite" data-planche-profiles-section={section ? "ok" : "aucune"}>
        {/* Données du projet (désignation, source du catalogue) : jamais traduites par la couche DOM. */}
        {section ? (
          <>
            <span translate="no">{section.designation}</span>
            {" — "}
            {section.source.genre === "saisie" ? t("planche.info.piece.saisie") : <span translate="no">{texteSource(section.source)}</span>}
          </>
        ) : (erreur ?? t("planche.profiles.aucune"))}
      </output>
      {onPoser && (
        <button type="button" disabled={lecture || !section} onClick={onPoser} data-planche-profiles-poser>
          {t("planche.profiles.poser")}
        </button>
      )}
    </section>
  );
}
