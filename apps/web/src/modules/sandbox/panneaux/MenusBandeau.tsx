/**
 * Menus du bandeau de la Planche (26 novembre 2026, ordinateur seulement, maquette validée par le maître d'ouvrage) :
 * Édition, Affichage, Caméra et Fenêtres, juste après le nom de la Planche ; ☰ reste le menu Fichier. Les menus ne
 * créent aucune fonction : chaque entrée appelle ce que la Planche offre déjà (raccourci, clic droit, panneau).
 *
 * Comportement (motif W3C APG « Menubar ») : un clic ouvre un menu ; tant qu'un menu est ouvert, survoler un autre titre
 * l'ouvre à sa place ; flèches gauche / droite d'un menu à l'autre, haut / bas d'une entrée à l'autre ; Échap ou un clic
 * ailleurs referme. Une case à cocher ou un choix radio laisse le menu ouvert pour enchaîner ; une commande le ferme.
 * Les quatre titres restent toujours visibles, comme sur la maquette validée (pas de menu replié) ; sur fenêtre étroite,
 * ils se resserrent et le nom de la Planche s'abrège.
 * Composant de présentation : aucun état de la Planche ici, seulement des descriptions et des rappels.
 */
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { t } from "../messages";
import { IconeSandbox } from "../pictogrammes/Pictogramme";

/** Une entrée de menu : commande, case à cocher, choix radio, titre de section ou séparateur. */
export type EntreeMenuBandeau =
  | { readonly genre: "commande"; readonly id: string; readonly libelle: string; readonly raccourci?: string; readonly disabled?: boolean; readonly titre?: string; readonly coche?: boolean; readonly onClick: () => void }
  | { readonly genre: "case"; readonly id: string; readonly libelle: string; readonly raccourci?: string; readonly coche: boolean; readonly disabled?: boolean; readonly onClick: () => void }
  | { readonly genre: "radio"; readonly id: string; readonly libelle: string; readonly coche: boolean; readonly disabled?: boolean; readonly onClick: () => void }
  | { readonly genre: "titre"; readonly libelle: string }
  | { readonly genre: "separateur" };

export interface MenuBandeau {
  readonly id: string;
  readonly libelle: string;
  readonly entrees: readonly EntreeMenuBandeau[];
}

/** Entrées actives d'un menu ouvert (éléments du DOM), dans l'ordre. */
function entreesActives(menu: HTMLElement | null): HTMLElement[] {
  return menu ? [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])')] : [];
}

export function MenusBandeau({ menus }: { menus: readonly MenuBandeau[] }) {
  const affiches = menus;
  const [ouvert, setOuvert] = useState<string | null>(null);
  const racine = useRef<HTMLDivElement | null>(null);
  const liste = useRef<HTMLDivElement | null>(null);
  const focaliserPremiere = useRef(false);

  // Clic ailleurs (dans la fenêtre qui porte la Planche, détachée comprise) : le menu se referme.
  useEffect(() => {
    if (!ouvert) return;
    const doc = racine.current?.ownerDocument ?? document;
    const dehors = (e: PointerEvent) => {
      if (racine.current && !racine.current.contains(e.target as Node)) setOuvert(null);
    };
    doc.addEventListener("pointerdown", dehors, true);
    return () => doc.removeEventListener("pointerdown", dehors, true);
  }, [ouvert]);

  // Ouvert au clavier : la première entrée prend le focus.
  useEffect(() => {
    if (ouvert && focaliserPremiere.current) {
      focaliserPremiere.current = false;
      entreesActives(liste.current)[0]?.focus();
    }
  }, [ouvert]);

  // Liste des menus changée (extensions) : rien ne reste ouvert sur un titre disparu.
  useEffect(() => {
    if (ouvert && !affiches.some((m) => m.id === ouvert)) setOuvert(null);
  }, [affiches, ouvert]);

  const titre = (id: string) => racine.current?.querySelector<HTMLButtonElement>(`[data-planche-menu-bandeau="${id}"]`) ?? null;
  const voisin = (id: string, pas: number) => {
    const i = affiches.findIndex((m) => m.id === id);
    return affiches[(i + pas + affiches.length) % affiches.length]!.id;
  };
  const fermer = (rendreFocus: boolean) => {
    const id = ouvert;
    setOuvert(null);
    if (rendreFocus && id) titre(id)?.focus();
  };

  const toucheTitre = (e: KeyboardEvent<HTMLButtonElement>, id: string) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      // Menu déjà ouvert (ouvert à la souris) : l'effet sur `ouvert` ne repasserait pas, le focus y entre tout de suite.
      if (ouvert === id) {
        entreesActives(liste.current)[0]?.focus();
        return;
      }
      focaliserPremiere.current = true;
      setOuvert(id);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopPropagation();
      const v = voisin(id, e.key === "ArrowRight" ? 1 : -1);
      titre(v)?.focus();
      if (ouvert) setOuvert(v);
    } else if (e.key === "Escape" && ouvert) {
      e.preventDefault();
      e.stopPropagation();
      fermer(true);
    }
  };

  const toucheListe = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!ouvert || e.altKey || e.ctrlKey || e.metaKey) return;
    const items = entreesActives(liste.current);
    const i = items.indexOf(e.target as HTMLElement);
    const aller = (j: number) => items[(j + items.length) % items.length]?.focus();
    if (e.key === "ArrowDown") aller(i + 1);
    else if (e.key === "ArrowUp") aller(i < 0 ? -1 : i - 1);
    else if (e.key === "Home") aller(0);
    else if (e.key === "End") aller(-1);
    else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Tab") {
        setOuvert(null);
        return;
      }
      fermer(true);
    } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      if (affiches.length < 2) return;
      focaliserPremiere.current = true;
      setOuvert(voisin(ouvert, e.key === "ArrowRight" ? 1 : -1));
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const choisir = (x: Extract<EntreeMenuBandeau, { onClick: () => void }>) => {
    if (x.disabled) return;
    x.onClick();
    // Case à cocher et choix radio : le menu reste ouvert pour enchaîner ; une commande le ferme.
    if (x.genre === "commande") fermer(false);
  };

  const menuOuvert = affiches.find((m) => m.id === ouvert) ?? null;
  return (
    <div ref={racine} className="planche-bandeau-menus" role="menubar" aria-label={t("planche.menus.barre")} data-planche-menus-bandeau>
      {affiches.map((m) => (
        <div key={m.id} className="planche-bandeau-menu">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={ouvert === m.id}
            tabIndex={m.id === (ouvert ?? affiches[0]!.id) ? 0 : -1}
            onClick={() => setOuvert(ouvert === m.id ? null : m.id)}
            onPointerEnter={() => ouvert && ouvert !== m.id && setOuvert(m.id)}
            onKeyDown={(e) => toucheTitre(e, m.id)}
            data-planche-menu-bandeau={m.id}
          >
            {m.libelle}
          </button>
          {menuOuvert?.id === m.id && (
            <div ref={liste} className="planche-bandeau-menu-liste" role="menu" aria-label={m.libelle} onKeyDown={toucheListe} data-planche-menu-bandeau-liste={m.id}>
              {m.entrees.map((x, i) => {
                if (x.genre === "separateur") return <div key={`s${i}`} role="separator" className="planche-bandeau-menu-separateur" />;
                if (x.genre === "titre") return <div key={`t${i}`} role="presentation" className="planche-bandeau-menu-titre">{x.libelle}</div>;
                const role = x.genre === "case" ? "menuitemcheckbox" : x.genre === "radio" ? "menuitemradio" : "menuitem";
                const coche = x.genre === "commande" ? x.coche : x.coche;
                return (
                  <div
                    key={x.id}
                    role={role}
                    tabIndex={-1}
                    aria-checked={role === "menuitem" ? undefined : coche}
                    aria-disabled={x.disabled || undefined}
                    title={x.genre === "commande" ? x.titre : undefined}
                    className={`planche-bandeau-menu-entree${x.genre === "commande" && coche ? " ouverte" : ""}`}
                    onClick={() => choisir(x)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        choisir(x);
                      }
                    }}
                    data-planche-menu-bandeau-entree={x.id}
                  >
                    <span className={`planche-bandeau-menu-marque ${x.genre}`} aria-hidden="true">
                      {x.genre === "case" && coche ? <IconeSandbox nom="coche" /> : x.genre === "case" ? <IconeSandbox nom="caseVide" /> : null}
                      {x.genre === "radio" ? <span className={`planche-bandeau-menu-radio${coche ? " coche" : ""}`} /> : null}
                      {x.genre === "commande" && coche ? <span className="planche-bandeau-menu-point" /> : null}
                    </span>
                    <span className="planche-bandeau-menu-libelle">{x.libelle}</span>
                    {"raccourci" in x && x.raccourci ? <span className="planche-bandeau-menu-raccourci">{x.raccourci}</span> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
