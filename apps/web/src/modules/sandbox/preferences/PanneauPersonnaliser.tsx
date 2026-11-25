/**
 * Panneau « Personnaliser les outils » du Sandbox (lot 5), ouvert par « Modifier » dans la grille « ⋯ » : profil des
 * barres (Standard, Métier, Personnel), outils de la barre gauche, favoris, regroupements nommés et « Réinitialiser ».
 * Même fonctionnement que le catalogue du 01, sans son code. Chaque changement s'applique tout de suite et s'enregistre
 * sur le compte (`usePreferencesSandbox`) ; l'état d'enregistrement est affiché.
 */
import { useEffect, useRef, useState } from "react";
import {
  PROFILS_METIER,
  barreDuProfilSandbox,
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
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { deplacerEntree } from "../planche/barres-nommees";
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
  /** Barre personnelle à modifier à l'ouverture (« Modifier », « Dupliquer » de la liste « Outils ») ; `null` : le champ du nom d'une nouvelle barre reçoit le focus. */
  readonly groupeInitial?: string | null;
  /**
   * Extensions actives pour le compte dans le catalogue de la plateforme (`choixEffectif`) : sert à l'affichage de la
   * barre seulement ; `preferences` reste le choix enregistré, c'est lui qu'on réécrit.
   */
  readonly extensionsEffectives?: PreferencesSandbox["extensions"];
}

const basculer = (liste: readonly string[], cle: string, present: boolean) => (present ? (liste.includes(cle) ? [...liste] : [...liste, cle]) : liste.filter((x) => x !== cle));

export function PanneauPersonnaliser({ preferences: p, etat, outils, commandes, modifier, reinitialiser, groupeInitial, extensionsEffectives }: Props) {
  const [groupeEdite, setGroupeEdite] = useState<string | null>(groupeInitial && p.regroupements.some((g) => g.id === groupeInitial) ? groupeInitial : (p.regroupements[0]?.id ?? null));
  const champNom = useRef<HTMLInputElement | null>(null);
  // « Nouvelle barre… » : le panneau s'ouvre sur le champ du nom.
  useEffect(() => {
    if (groupeInitial === null) champNom.current?.focus();
  }, [groupeInitial]);
  const [nouveau, setNouveau] = useState("");
  const barre = barreGaucheSandbox(extensionsEffectives ? { ...p, extensions: extensionsEffectives } : p);
  // Barre du profil avant le filtre des extensions : c'est elle qu'on réécrit, pour que les outils d'une extension
  // désactivée restent rangés à leur place et reviennent avec elle.
  const barreEntiere = barreDuProfilSandbox(p);
  const groupe = p.regroupements.find((g) => g.id === groupeEdite) ?? null;

  const choisirProfil = (profil: ProfilSandbox) => modifier({ ...p, profil, barrePersonnelle: profil === "personnel" && p.barrePersonnelle.length === 0 ? [...barreEntiere] : p.barrePersonnelle });
  // Cocher ou décocher un outil de la barre passe au profil Personnel, à partir de la barre affichée.
  const basculerBarre = (id: string, present: boolean) => modifier({ ...p, profil: "personnel", barrePersonnelle: basculer(barreEntiere, id, present) });
  const basculerFavori = (cle: string, present: boolean) => modifier({ ...p, favoris: basculer(p.favoris, cle, present) });
  const basculerGroupe = (cle: string, present: boolean) =>
    groupe && modifier({ ...p, regroupements: p.regroupements.map((g) => (g.id === groupe.id ? { ...g, entrees: basculer(g.entrees, cle, present) } : g)) });
  const ordonner = (cle: string, sens: -1 | 1) => groupe && modifier({ ...p, regroupements: p.regroupements.map((g) => (g.id === groupe.id ? { ...g, entrees: deplacerEntree(g.entrees, cle, sens) } : g)) });
  /** Nom et pictogramme d'une entrée de barre parmi les outils et commandes offerts ; une entrée masquée (extension coupée) garde sa place sans être listée. */
  const entreeOfferte = (cle: string): { picto: DescriptionPictogramme; nom: string } | null => {
    if (cle.startsWith("outil:")) {
      const o = outils.find((x) => x.id === cle.slice(6));
      return o ? { picto: pictoOutil(o.id), nom: nomOutil(o) } : null;
    }
    const c = commandes.find((x) => `commande:${x.id}` === cle);
    return c ? { picto: c.picto, nom: c.nom } : null;
  };
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
            <input ref={champNom} value={nouveau} maxLength={MAX_NOM_REGROUPEMENT} onChange={(e) => setNouveau(e.target.value)} onKeyDown={(e) => e.key === "Enter" && creerGroupe()} placeholder={t("personnaliser.groupe.nom")} aria-label={t("personnaliser.groupe.nom")} data-personnaliser-nouveau-nom />
            <button type="button" onClick={creerGroupe} disabled={!nouveau.trim()} data-personnaliser-creer>
              {t("personnaliser.groupe.creer")}
            </button>
          </div>
        )}
      </fieldset>

      {groupe && (
        <fieldset data-personnaliser-ordre={groupe.id}>
          <legend>{t("personnaliser.groupe.ordre", { groupe: groupe.nom })}</legend>
          {groupe.entrees.length === 0 && <p className="inspecteur-aide">{t("personnaliser.groupe.vide", { groupe: groupe.nom })}</p>}
          <ol className="planche-personnaliser-ordre">
            {groupe.entrees.map((cle, i) => {
              const e = entreeOfferte(cle);
              if (!e) return null;
              return (
                <li key={cle} data-personnaliser-ordre-entree={cle}>
                  <span className="planche-personnaliser-ordre-nom">
                    <Pictogramme picto={e.picto} /> {e.nom}
                  </span>
                  <button type="button" disabled={i === 0} onClick={() => ordonner(cle, -1)} aria-label={t("personnaliser.groupe.monter", { outil: e.nom })} title={t("personnaliser.groupe.monter", { outil: e.nom })} data-personnaliser-monter={cle}>
                    <IconeSandbox nom="monter" />
                  </button>
                  <button type="button" disabled={i === groupe.entrees.length - 1} onClick={() => ordonner(cle, 1)} aria-label={t("personnaliser.groupe.descendre", { outil: e.nom })} title={t("personnaliser.groupe.descendre", { outil: e.nom })} data-personnaliser-descendre={cle}>
                    <IconeSandbox nom="descendre" />
                  </button>
                  <button type="button" onClick={() => basculerGroupe(cle, false)} aria-label={t("personnaliser.groupe.retirer", { outil: e.nom })} title={t("personnaliser.groupe.retirer", { outil: e.nom })} data-personnaliser-retirer={cle}>
                    <IconeSandbox nom="fermer" />
                  </button>
                </li>
              );
            })}
          </ol>
        </fieldset>
      )}

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
