/** Registres des dessinateurs de plan et des descripteurs d'inspecteur (contrats figés au lot 3a). */
import type { EtatModele, IdObjet } from "@parcours/atelier-model";
import type { DescripteurInspecteur, DessinateurPlan, DessinPlan, RegistreDessinateurs, RegistreInspecteur, Registres } from "./contrats";
import { creerRegistre } from "./registre";

const ORDRE_COUCHE: Record<DessinPlan["couche"], number> = { fond: 0, objet: 1, annotation: 2 };

function parClasse<T extends { readonly classes: readonly string[] }>(nom: string) {
  const table = new Map<string, T>();
  return {
    enregistrer(d: T) {
      for (const c of d.classes) {
        if (table.has(c)) throw new Error(`${nom} : classe « ${c} » déjà prise`);
        table.set(c, d);
      }
    },
    pour: (classe: string) => table.get(classe) ?? null,
  };
}

export function creerRegistreDessinateurs(): RegistreDessinateurs {
  const base = parClasse<DessinateurPlan>("Registre des dessinateurs");
  return {
    ...base,
    dessinerNiveau(etat: EtatModele, niveauId: IdObjet, calquesMasques: readonly IdObjet[] = []) {
      const masques = new Set(calquesMasques);
      const dessins: DessinPlan[] = [];
      for (const o of Object.values(etat.objets)) {
        if (o.niveauId !== niveauId || (o.calqueId && masques.has(o.calqueId))) continue;
        const d = base.pour(o.classe)?.dessiner(o, etat);
        if (d) dessins.push(d);
      }
      return dessins.sort((a, b) => ORDRE_COUCHE[a.couche] - ORDRE_COUCHE[b.couche] || a.objetId.localeCompare(b.objetId));
    },
  };
}

export function creerRegistreInspecteur(): RegistreInspecteur {
  return parClasse<DescripteurInspecteur>("Registre de l'inspecteur");
}

export function creerRegistres(): Registres {
  return { outils: creerRegistre(), dessinateurs: creerRegistreDessinateurs(), inspecteur: creerRegistreInspecteur() };
}
