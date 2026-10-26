/**
 * Barre territoriale permanente (lot H, D-GD-28) : « Pays › niveau 1 › niveau 2 › … », toujours présente sur la carte,
 * alimentée par le découpage territorial **en base** (`/territoires`), jamais par les couches affichées ni par un pays
 * écrit dans le code. Les noms de pays, de niveaux et d'unités sont des données (affichés tels quels, `translate="no"`).
 * Chaque niveau est une liste ; choisir une unité cadre la carte et trace son contour ; « Retour » (Alt+↑) remonte.
 */
import { useEffect, useState } from "react";
import type { PaysTerritorial, UniteTerritoriale } from "@parcours/geodata-model";
import { api } from "../client";

const RETOUR = "M15 18 9 12l6-6";
const NIVEAUX = "M4 6h16M7 12h13M10 18h10";

export interface EtapeTerritoriale { readonly code: string; readonly nom: string; readonly rang: number }

export function BarreTerritoriale(p: {
  pays: readonly PaysTerritorial[] | null; erreur: string | null; paysCourant: string | null; chemin: readonly EtapeTerritoriale[];
  onPays(code: string): void; onChoisir(index: number, code: string | null): void; onRetour(): void;
}) {
  const pays = p.pays?.find((x) => x.code === p.paysCourant) ?? null;
  // Listes des niveaux, par parent (null = premier niveau), lues en base au besoin et gardées le temps de la page.
  const [listes, setListes] = useState<Map<string, UniteTerritoriale[] | "erreur">>(new Map());
  const cle = (parent: string | null) => `${p.paysCourant}|${parent ?? ""}`;
  // Parent de chaque liste affichée : premier niveau (null), puis chaque unité choisie, jusqu'au niveau le plus fin.
  const parents: (string | null)[] = pays ? pays.niveaux.slice(0, p.chemin.length + 1).map((_, i) => (i === 0 ? null : p.chemin[i - 1]!.code)) : [];
  useEffect(() => {
    if (!p.paysCourant) return;
    for (const parent of parents) {
      const k = cle(parent);
      if (listes.has(k)) continue;
      setListes((m) => new Map(m).set(k, []));
      api.unitesTerritoriales(p.paysCourant, parent)
        .then((r) => setListes((m) => new Map(m).set(k, r.unites)))
        .catch(() => setListes((m) => new Map(m).set(k, "erreur")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.paysCourant, parents.join("|")]);
  const n = p.chemin.length;
  return (
    <nav className="gd-niveaux gd-territoires" aria-label="Navigation territoriale" data-gd-niveaux={n} data-gd-territoires={p.paysCourant ?? ""}>
      <svg className="gd-niveaux-icone" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d={NIVEAUX} /></svg>
      {p.erreur ? <span className="gd-discret" role="status" data-gd-territoires-erreur>{p.erreur}</span>
        : p.pays === null ? <span className="gd-discret" role="status">Chargement du découpage territorial…</span>
        : !pays ? <span className="gd-discret" role="status" data-gd-territoires-vide>Aucun découpage territorial en base.</span>
        : (
          <ol>
            <li>
              {p.pays.length > 1
                ? <select aria-label="Pays" value={pays.code} onChange={(e) => p.onPays(e.target.value)} data-gd-pays translate="no">{p.pays.map((x) => <option key={x.code} value={x.code}>{x.nom}</option>)}</select>
                : n === 0 ? <span aria-current="location" translate="no" data-gd-pays-nom>{pays.nom}</span>
                : <button type="button" onClick={() => p.onChoisir(0, null)} translate="no" data-gd-pays-nom>{pays.nom}</button>}
            </li>
            {pays.niveaux.map((niveau, i) => {
              if (i > n) return null;
              const parent = i === 0 ? null : p.chemin[i - 1]!.code;
              const liste = listes.get(cle(parent));
              const choisi = p.chemin[i]?.code ?? "";
              return (
                <li key={niveau.rang}>
                  <span aria-hidden="true" className="gd-niveaux-sep">›</span>
                  {/* Nom du niveau : donnée du découpage en base (jamais traduite), nom accessible de la liste. */}
                  <span id={`gd-niveau-${niveau.rang}`} className="sr-only" translate="no">{niveau.singulier}</span>
                  <select aria-labelledby={`gd-niveau-${niveau.rang}`} value={choisi} onChange={(e) => p.onChoisir(i, e.target.value || null)} disabled={liste === "erreur" || (Array.isArray(liste) && !liste.length && !choisi)} data-gd-niveau-select={niveau.rang} translate="no">
                    <option value="">{`${niveau.pluriel} (${Array.isArray(liste) ? liste.length : "…"})`}</option>
                    {Array.isArray(liste) && liste.map((u) => <option key={u.code} value={u.code}>{u.nom}</option>)}
                    {choisi && Array.isArray(liste) && !liste.some((u) => u.code === choisi) && <option value={choisi}>{p.chemin[i]!.nom}</option>}
                  </select>
                </li>
              );
            })}
          </ol>
        )}
      <button type="button" className="gd-niveaux-retour" onClick={p.onRetour} disabled={n === 0} aria-label="Retour au niveau supérieur" title="Retour au niveau supérieur (Alt+↑)" aria-keyshortcuts="Alt+ArrowUp" data-gd-retour>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={RETOUR} /></svg>
        <span>Retour</span>
      </button>
    </nav>
  );
}
