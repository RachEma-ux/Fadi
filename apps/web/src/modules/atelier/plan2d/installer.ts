/**
 * Installation du module « plan 2D » (L3a.2) : outils d'esquisse (famille Créer), transformations (famille
 * Modifier), dessinateurs des esquisses et de la référence de plan. Le dessinateur de repli des classes
 * d'architecture (`repli.ts`) n'est **pas** enregistré : les vrais viennent de `objets/` et `documents/`.
 */
import type { InstallationModule } from "../socle";
import { DESSINATEUR_ESQUISSES, DESSINATEUR_REFERENCE_PLAN } from "./dessinateurs";
import { outilsEsquisse } from "./outils/esquisse";
import { outilsTransformation } from "./outils/transformations";

export const installer: InstallationModule = (r) => {
  r.dessinateurs.enregistrer(DESSINATEUR_ESQUISSES);
  r.dessinateurs.enregistrer(DESSINATEUR_REFERENCE_PLAN);
  const deps = { dessinateurs: r.dessinateurs };
  for (const o of [...outilsEsquisse(deps), ...outilsTransformation(deps)]) r.outils.enregistrer(o);
};
