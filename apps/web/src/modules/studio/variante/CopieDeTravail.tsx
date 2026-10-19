/**
 * Exemple protégé (référence `example_mode = 'reference'`) : la variante se consulte, jamais ne se modifie — les outils
 * sont désactivés avec leur raison. Comme l'Atelier, le Studio propose de travailler dans une COPIE ; ici l'action est
 * explicite (un clic, jamais à l'ouverture : ouvrir un domaine ne crée rien) :
 *   1. copie du projet (`POST /projects/:id/copies`, droit de lecture suffisant ; la référence reste intacte) ;
 *   2. installation de l'étude exemple Studio dans la copie (`POST …/studio/exemple`, l'auteur de la copie en est le
 *      propriétaire ; la provenance P.118 est conservée par la copie) ;
 *   3. ouverture, dans la copie, de la variante de même nom (même niveau), même domaine et même planche — sinon la
 *      variante initiale de l'étude.
 * Rien n'est deviné : un échec est dit tel quel, la copie déjà créée reste dans Projets.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../../lib/api";
import { cheminVarianteStudio, type OptionsDomaineVariante } from "../routes-studio";

/** Variante de la copie qui correspond à la variante affichée : même nom (un niveau = une variante), sinon l'initiale. */
export function varianteCorrespondante(variantes: readonly { id: string; name: string; archived: boolean }[], nom: string, initiale: string): string {
  return variantes.find((v) => !v.archived && v.name === nom)?.id ?? initiale;
}

export function CopieDeTravail({ projectId, nomVariante, adresse = {} }: { projectId: string; nomVariante: string; adresse?: OptionsDomaineVariante }) {
  const navigate = useNavigate();
  const [etape, setEtape] = useState<"" | "copie" | "exemple">("");
  const [erreur, setErreur] = useState<{ texte: string; detail: string } | null>(null);
  async function copier() {
    setErreur(null);
    let copie: { id: string } | null = null;
    try {
      setEtape("copie");
      copie = await api.copyProject(projectId);
      setEtape("exemple");
      const r = await api.installStudioExample(copie.id);
      const v = varianteCorrespondante(r.etude.variants, nomVariante, r.etude.study.initialVariantId);
      navigate(cheminVarianteStudio(copie.id, r.etude.study.id, v, null, adresse));
    } catch (e) {
      const detail = e instanceof ApiError ? `${e.status}${e.code ? ` ${e.code}` : ""}` : "";
      setErreur({
        texte: copie
          ? "La copie a été créée, mais l’étude exemple n’a pas pu y être installée. Ouvrez la copie depuis Projets et chargez l’exemple Studio."
          : "La copie n’a pas pu être créée.",
        detail,
      });
      setEtape("");
    }
  }
  const enCours = etape !== "";
  return <div className="studio-alert studio-copie-travail" data-studio-reference-protegee aria-busy={enCours}>
    <span>Exemple protégé : cette référence se consulte sans modification. Pour dessiner, travaillez dans une copie (la référence reste intacte).</span>
    <button type="button" disabled={enCours} onClick={() => void copier()} data-studio-copie-travail>
      {etape === "copie" ? "Copie du projet…" : etape === "exemple" ? "Installation de l’étude exemple dans la copie…" : "Travailler dans une copie"}
    </button>
    {erreur && <span role="alert" data-studio-copie-erreur>{erreur.texte}{erreur.detail && <> <span translate="no">({erreur.detail})</span></>}</span>}
  </div>;
}
