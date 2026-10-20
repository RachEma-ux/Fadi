/**
 * Panneau « Personnaliser les outils » du Sandbox (lot 5), ouvert par « Modifier » dans la grille « ⋯ » : profil des
 * barres (Standard, Métier, Personnel), outils de la barre gauche, favoris, regroupements nommés et « Réinitialiser ».
 * Même fonctionnement que le catalogue du 01, sans son code. Chaque changement s'applique tout de suite et s'enregistre
 * sur le compte (`usePreferencesSandbox`) ; l'état d'enregistrement est affiché.
 */
import { useState } from "react";
import {
  PROFILS_METIER,
  barreGaucheSandbox,
  idRegroupement,
  MAX_NOM_REGROUPEMENT,
  MAX_REGROUPEMENTS,
  type Outil,
  type Pictogramme as DescriptionPictogramme,
  type PreferencesSandbox,
  type ProfilSandbox,
} from "@parcours/sandbox-planche-model";
import { t, type CleMessage } from "../messages";
import { Pictogramme } from "../pictogrammes/Pictogramme";
import { nomOutil, pictoOutil } from "../planche/outils-planche";
import type { EtatPreferences } from "./usePreferencesSandbox";

export interface CommandePersonnalisable {
  readonly id: string;
  readonly picto: DescriptionPictogramme;
  readonly nom: string;
}

interface Props {
  readonly preferences: PreferencesSandbox;
  readonly etat: EtatPreferences;
  readonly outils: readonly Outil[];
  readonly commandes: readonly CommandePersonnalisable[];
  readonly modifier: (p: PreferencesSandbox) => void;
  readonly reinitialiser: () => void;
}

const basculer = (liste: readonly string[], cle: string, present: boolean) => (present ? (liste.includes(cle) ? [...liste] : [...liste, cle]) : liste.filter((x) => x !== cle));

export function PanneauPersonnaliser({ preferences: p, etat, outils, commandes, modifier, reinitialiser }: Props) {
  const [groupeEdite, setGroupeEdite] = useState<string | null>(p.regroupements[0]?.id ?? null);
  const [nouveau, setNouveau] = useState("");
  const barre = barreGaucheSandbox(p);
  const groupe = p.regroupements.find((g) => g.id === groupeEdite) ?? null;

  const choisirProfil = (profil: ProfilSandbox) => modifier({ ...p, profil, barrePersonnelle: profil === "personnel" && p.barrePersonnelle.length === 0 ? [...barre] : p.barrePersonnelle });
  // Cocher ou décocher un outil de la barre passe au profil Personnel, à partir de la barre affichée.
  const basculerBarre = (id: string, present: boolean) => modifier({ ...p, profil: "personnel", barrePersonnelle: basculer(barre, id, present) });
  const basculerFavori = (cle: string, present: boolean) => modifier({ ...p, favoris: basculer(p.favoris, cle, present) });
  const basculerGroupe = (cle: string, present: boolean) =>
    groupe && modifier({ ...p, regroupements: p.regroupements.map((g) => (g.id === groupe.id ? { ...g, entrees: basculer(g.entrees, cle, present) } : g)) });
  const creerGroupe = () => {
    const nom = nouveau.trim();
    if (!nom || p.regroupements.length >= MAX_REGROUPEMENTS || p.regroupements.some((g) => g.nom.toLocaleLowerCase("fr") === nom.toLocaleLowerCase("fr"))) return;
    const id = idRegroupement(nom, p.regroupements.map((g) => g.id));
    modifier({ ...p, regroupements: [...p.regroupements, { id, nom, entrees: [] }] });
    setGroupeEdite(id);
    setNouveau("");
  };
  const supprimerGroupe = (id: string) => {
    modifier({ ...p, regroupements: p.regroupements.filter((g) => g.id !== id) });
    if (groupeEdite === id) setGroupeEdite(null);
  };

  const ligne = (cle: string, picto: DescriptionPictogramme, nom: string, outil: string | null) => (
    <tr key={cle} data-personnaliser-entree={cle}>
      <th scope="row">
        <Pictogramme picto={picto} /> {nom}
      </th>
      <td>{outil && <input type="checkbox" checked={barre.includes(outil)} onChange={(e) => basculerBarre(outil, e.target.checked)} aria-label={t("personnaliser.barre.aide", { outil: nom })} data-personnaliser-barre={outil} />}</td>
      <td>
        <input type="checkbox" checked={p.favoris.includes(cle)} onChange={(e) => basculerFavori(cle, e.target.checked)} aria-label={t("personnaliser.favori.aide", { outil: nom })} data-personnaliser-favori={cle} />
      </td>
      {groupe && (
        <td>
          <input type="checkbox" checked={groupe.entrees.includes(cle)} onChange={(e) => basculerGroupe(cle, e.target.checked)} aria-label={t("personnaliser.groupe.aide", { outil: nom, groupe: groupe.nom })} data-personnaliser-groupe={cle} />
        </td>
      )}
    </tr>
  );

  return (
    <div className="planche-personnaliser" data-planche-personnaliser>
      <p className="inspecteur-aide" role="status" data-personnaliser-etat={etat}>
        {t(`personnaliser.etat.${etat}` as CleMessage)}
      </p>
      <fieldset>
        <legend>{t("personnaliser.profil")}</legend>
        {(["standard", ...PROFILS_METIER.map((m) => m.id), "personnel"] as ProfilSandbox[]).map((id) => (
          <label key={id} className="planche-personnaliser-choix">
            <input type="radio" name="sandbox-profil" checked={p.profil === id} onChange={() => choisirProfil(id)} data-personnaliser-profil={id} />
            {id === "standard" ? t("personnaliser.profil.standard") : id === "personnel" ? t("personnaliser.profil.personnel") : t(`personnaliser.profil.${id.slice(7)}` as CleMessage)}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>{t("personnaliser.regroupements")}</legend>
        {p.regroupements.map((g) => (
          <div key={g.id} className="planche-personnaliser-groupe" data-personnaliser-regroupement={g.id}>
            <label className="planche-personnaliser-choix">
              <input type="radio" name="sandbox-groupe" checked={groupeEdite === g.id} onChange={() => setGroupeEdite(g.id)} />
              {g.nom} ({g.entrees.length})
            </label>
            <button type="button" onClick={() => supprimerGroupe(g.id)} aria-label={t("personnaliser.groupe.supprimer", { groupe: g.nom })}>
              {t("personnaliser.supprimer")}
            </button>
          </div>
        ))}
        {p.regroupements.length < MAX_REGROUPEMENTS && (
          <div className="planche-personnaliser-groupe">
            <input value={nouveau} maxLength={MAX_NOM_REGROUPEMENT} onChange={(e) => setNouveau(e.target.value)} onKeyDown={(e) => e.key === "Enter" && creerGroupe()} placeholder={t("personnaliser.groupe.nom")} aria-label={t("personnaliser.groupe.nom")} data-personnaliser-nouveau-nom />
            <button type="button" onClick={creerGroupe} disabled={!nouveau.trim()} data-personnaliser-creer>
              {t("personnaliser.groupe.creer")}
            </button>
          </div>
        )}
      </fieldset>

      <table className="planche-personnaliser-table">
        <thead>
          <tr>
            <th scope="col">{t("personnaliser.entree")}</th>
            <th scope="col">{t("personnaliser.barre")}</th>
            <th scope="col">{t("personnaliser.favori")}</th>
            {groupe && <th scope="col">{groupe.nom}</th>}
          </tr>
        </thead>
        <tbody>
          {outils.map((o) => ligne(`outil:${o.id}`, pictoOutil(o.id), nomOutil(o), o.id))}
          {commandes.map((c) => ligne(`commande:${c.id}`, c.picto, c.nom, null))}
        </tbody>
      </table>

      <button
        type="button"
        className="planche-personnaliser-reinitialiser"
        onClick={() => {
          if (window.confirm(t("personnaliser.reinitialiser.confirmer"))) {
            reinitialiser();
            setGroupeEdite(null);
          }
        }}
        data-personnaliser-reinitialiser
      >
        {t("personnaliser.reinitialiser")}
      </button>
    </div>
  );
}
