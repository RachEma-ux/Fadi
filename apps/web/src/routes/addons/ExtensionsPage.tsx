/**
 * Page « Extensions » (« Add-ons » en anglais) de la barre latérale — maquettes validées par le maître d'ouvrage le
 * 25 novembre 2026 : deux options, « Installées » et « Disponibles », et un seul geste par extension (Installer /
 * Désinstaller). Les extensions sont les fonctions supplémentaires de la Planche ; le choix suit le compte et la Planche
 * l'applique à son ouverture. Désinstaller ne touche jamais au dessin. Les actions exigent le réseau, jamais en file.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addonsApi, paquetsCompteApi, repartirExtensions, type EtatExtensionsCompte, type ExtensionListee } from "../../lib/addons";
import { useAdminEnabled } from "../../lib/use-platform-role";
import { texteFiche } from "../../modules/sandbox/planche/extensions-installees";
import { AdministrationExtensions } from "./AdministrationExtensions";
import { Icon } from "../../components/Icon";
import { useOnline } from "../../components/SyncIndicator";
import { apiMessage } from "../../components/comptes/ComptesUI";
import { t } from "../../modules/sandbox/messages";
import "./extensions.css";

type Option = "installees" | "disponibles" | "administration";
const CLE = ["extensions-compte"] as const;
const CLE_PAQUETS = ["extensions-paquets-compte"] as const;

/** « 6 outils · 5 commandes · 1 panneau » : libellés du Sandbox, déjà traduits. */
function contenu(c: ExtensionListee["contenu"]): string {
  const un = (n: number, seul: "extensions.contenu.outil" | "extensions.contenu.commande" | "extensions.contenu.panneau", plusieurs: "extensions.contenu.outils" | "extensions.contenu.commandes" | "extensions.contenu.panneaux") =>
    n === 0 ? null : n === 1 ? t(seul) : t(plusieurs, { n: String(n) });
  return [un(c.outil, "extensions.contenu.outil", "extensions.contenu.outils"), un(c.commande, "extensions.contenu.commande", "extensions.contenu.commandes"), un(c.panneau, "extensions.contenu.panneau", "extensions.contenu.panneaux")].filter(Boolean).join(" · ");
}

export function ExtensionsPage() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const [option, setOption] = useState<Option>("installees");
  const [erreur, setErreur] = useState<string | null>(null);
  const q = useQuery({ queryKey: CLE, queryFn: addonsApi.lire });
  const basculer = useMutation({
    mutationFn: ({ etat, id, installee }: { etat: EtatExtensionsCompte; id: string; installee: boolean }) => addonsApi.basculer(etat, id, installee),
    onMutate: () => setErreur(null),
    onSuccess: (etat) => queryClient.setQueryData(CLE, etat),
    onError: (err) => setErreur(apiMessage(err, "Le changement n’a pas pu être enregistré.")),
  });
  const admin = useAdminEnabled();
  // Extensions ajoutées par la plateforme (images 12 à 15) : mêmes deux listes, même geste, choix rangé à part.
  const qp = useQuery({ queryKey: CLE_PAQUETS, queryFn: paquetsCompteApi.lire });
  const basculerPaquet = useMutation({
    mutationFn: ({ id, installee }: { id: string; installee: boolean }) => paquetsCompteApi.basculer(id, installee),
    onMutate: () => setErreur(null),
    onSuccess: (paquets) => queryClient.setQueryData(CLE_PAQUETS, paquets),
    onError: (err) => setErreur(apiMessage(err, "Le changement n’a pas pu être enregistré.")),
  });
  const listes = q.data ? repartirExtensions(q.data) : null;
  const liste = listes ? (option === "installees" ? listes.installees : listes.disponibles) : [];
  const paquets = (qp.data ?? []).filter((f) => f.installee === (option === "installees"));
  const nombre = (installee: boolean) => (listes ? (installee ? listes.installees : listes.disponibles).length + (qp.data ?? []).filter((f) => f.installee === installee).length : undefined);
  const occupe = !online || basculer.isPending || basculerPaquet.isPending;
  const onglet = (o: Option, libelle: string, n: number | undefined) => (
    <button type="button" role="tab" aria-selected={option === o} className={option === o ? "active" : undefined} onClick={() => setOption(o)} data-extensions-option={o}>
      {libelle}{n !== undefined && <span className="extensions-compte" translate="no">{n}</span>}
    </button>
  );
  const onglets = (
    <div className="extensions-options" role="tablist" aria-label="Extensions">
      {onglet("installees", "Installées", nombre(true))}
      {onglet("disponibles", "Disponibles", nombre(false))}
      {admin && onglet("administration", "Administration", undefined)}
    </div>
  );
  if (admin && option === "administration") {
    return (
      <main className="admin-page extensions-page extensions-page-large" data-extensions-page>
        <AdministrationExtensions onglets={onglets} />
      </main>
    );
  }
  return (
    <main className="admin-page extensions-page" data-extensions-page>
      <h1>Extensions</h1>
      <p className="h7-muted">Fonctions supplémentaires de la Planche. Vos choix suivent votre compte.</p>
      {!online && <p role="status" className="h7-muted">Hors connexion : installer ou désinstaller une extension exige le réseau.</p>}
      {onglets}
      {q.isPending && <p role="status">Chargement des extensions…</p>}
      {q.isError && <p role="alert" className="form-error">Impossible de charger les extensions.</p>}
      {erreur && <p role="alert" className="form-error">{erreur}</p>}
      {listes && liste.length + paquets.length === 0 && (
        <p className="h7-muted" data-extensions-vide>{option === "installees" ? "Aucune extension installée. Voyez celles qui sont disponibles." : "Toutes les extensions proposées sont déjà installées."}</p>
      )}
      <ul className="extensions-grille" data-extensions-liste={option}>
        {q.data && liste.map(({ extension: x, fiche, contenu: c }) => (
          <li key={x.id} className="extensions-carte" data-extension={x.id}>
            <span className="extensions-picto" aria-hidden="true"><Icon name="puzzle" size={24} /></span>
            <div className="extensions-texte">
              <h2 translate="no">{t(`extension.${x.id}` as "extension.bois")}</h2>
              <p translate="no">{t(`extension.${x.id}.description` as "extension.bois.description")}</p>
              <p className="extensions-meta">
                {fiche.etat === "experimentale" && <span className="extensions-etat" data-extension-etat="experimentale">Expérimentale</span>}
                <span>Version <span translate="no">{fiche.version}</span></span>
                <span translate="no">{contenu(c)}</span>
              </p>
            </div>
            {option === "installees"
              ? <button type="button" className="button-secondary" disabled={occupe} onClick={() => basculer.mutate({ etat: q.data, id: x.id, installee: false })} data-extension-desinstaller>Désinstaller</button>
              : <button type="button" className="button-primary" disabled={occupe} onClick={() => basculer.mutate({ etat: q.data, id: x.id, installee: true })} data-extension-installer>Installer</button>}
          </li>
        ))}
        {q.data && paquets.map((f) => (
          <li key={`paquet-${f.id}`} className="extensions-carte" data-extension={f.id} data-extension-ajoutee>
            <span className="extensions-picto" aria-hidden="true"><Icon name="puzzle" size={24} /></span>
            <div className="extensions-texte">
              <h2 translate="no">{texteFiche(f.nom)}</h2>
              <p translate="no">{texteFiche(f.description)}</p>
              <p className="extensions-meta">
                {f.etat === "experimentale" && <span className="extensions-etat" data-extension-etat="experimentale">Expérimentale</span>}
                <span>Version <span translate="no">{f.version}</span></span>
                <span translate="no">{contenu({ commande: f.commandes, outil: f.outils, panneau: f.panneaux })}</span>
                <span translate="no">{t("extensions.admin.compte.ajoutee")}</span>
              </p>
            </div>
            {option === "installees"
              ? <button type="button" className="button-secondary" disabled={occupe} onClick={() => basculerPaquet.mutate({ id: f.id, installee: false })} data-extension-desinstaller>Désinstaller</button>
              : <button type="button" className="button-primary" disabled={occupe} onClick={() => basculerPaquet.mutate({ id: f.id, installee: true })} data-extension-installer>Installer</button>}
          </li>
        ))}
      </ul>
      <p className="h7-muted extensions-note">Désinstaller une extension retire ses outils de la Planche sans toucher à vos dessins. Elle reste disponible et se réinstalle d’un geste.</p>
    </main>
  );
}
