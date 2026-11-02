/**
 * « Paramètres » : ce qui se règle réellement dans Fadi aujourd'hui —
 * le compte (adresse, déconnexion), la connexion MapTiler (clé de
 * l'utilisateur, réutilisée par l'étape 01 et l'outil Parcelle, jamais
 * envoyée à l'API Fadi), les données conservées par ce navigateur pour le
 * travail hors-ligne, la version de l'application, et les notifications
 * (types affichés, projets en sourdine — préférences du compte, appliquées
 * par le serveur). Les droits d'accès
 * d'un projet se règlent dans son module Collaboration, pas ici.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { localStore, type QuarantaineEntry } from "../lib/local-store";
import { QUERY_CACHE_VERSION } from "../lib/query-persister";
import { forgetMaptilerKey, maptilerKey, MAPTILER_KEY_STORAGE, useMaptilerKey } from "../lib/maptiler";
import { useOnline } from "../components/SyncIndicator";
import { ChoixLangue } from "../components/ChoixLangue";
import { LOCALE } from "../lib/i18n";
import { api, type NotificationKind, type NotificationPreferencesView } from "../lib/api";
import { NOTIFICATION_KIND_DESCRIPTION, NOTIFICATION_KIND_LABEL, NOTIFICATION_KINDS } from "../components/notification-kinds";
import { NOTIFICATION_PREFERENCES_KEY } from "../components/NotificationBell";
import { MonCompte } from "./MonCompte";
import { FournisseursCarte } from "./FournisseursCarte";

type KeyState = "absente" | "session" | "locale";

function keyState(): KeyState {
  if (!maptilerKey()) return "absente";
  try {
    return localStorage.getItem(MAPTILER_KEY_STORAGE) ? "locale" : "session";
  } catch {
    return "session";
  }
}

const KEY_LABEL: Record<KeyState, string> = {
  absente: "Aucune clé : les commandes « Afficher le fond MapTiler » et « Collecter centre + sommets » le diront, sans inventer d’image ni d’altitude.",
  session: "Clé en mémoire de session (oubliée à la fermeture du navigateur).",
  locale: "Clé conservée dans le stockage local de ce navigateur (réutilisée par l’outil Parcelle).",
};

function MaptilerSettings() {
  const [state, setState] = useState<KeyState>(keyState);
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <section className="panel settings-section" aria-labelledby="settings-maptiler">
      <h2 id="settings-maptiler">Connexion MapTiler</h2>
      <p className="panel-sub">
        Fond satellite et altimétrie indicative de l’étape 01 et du bilan : appelés depuis votre navigateur avec votre clé, à votre demande seulement. La clé n’est jamais envoyée à l’API Fadi ni
        incluse dans un rapport.
      </p>
      <p className="settings-state" data-key-state={state}>
        {KEY_LABEL[state]}
      </p>
      <form
        className="settings-form"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            useMaptilerKey(key, remember);
            setKey("");
            setState(keyState());
            setNotice("Clé enregistrée.");
          } catch (err) {
            setNotice(err instanceof Error ? err.message : "Clé non renseignée");
          }
        }}
      >
        <label>
          Clé API
          <input id="settings-maptiler-key" type="password" autoComplete="off" placeholder="Clé MapTiler" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <label className="h7-checkbox">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Conserver dans le stockage local du navigateur
        </label>
        <div className="h7-actions">
          <button type="submit" className="button-primary">
            Utiliser cette clé
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={state === "absente"}
            onClick={() => {
              forgetMaptilerKey();
              setState(keyState());
              setNotice("Clé oubliée.");
            }}
          >
            Oublier la clé
          </button>
        </div>
      </form>
      {notice && (
        <p className="h7-muted" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

interface LocalSummary {
  available: boolean;
  pendingWrites: number;
  /** Écritures de l'Atelier en attente par projet : rejouées à la prochaine ouverture de l'Atelier de ce projet (ou au retour du réseau s'il est ouvert). */
  pendingByProject: Record<string, number>;
  cachedModels: number;
  /** Requêtes déshydratées dans le cache persistant (écrans relisibles sans réseau). */
  cachedQueries: number;
  /** Saisies, arbitrages et commentaires en pause (hors-ligne), rejoués au retour du réseau. */
  pausedMutations: number;
}

async function readLocalSummary(): Promise<LocalSummary> {
  const base = await localStore.summary();
  let cachedQueries = 0;
  let pausedMutations = 0;
  try {
    const raw = await localStore.getValue(QUERY_CACHE_VERSION);
    const parsed = raw ? (JSON.parse(raw) as { clientState?: { queries?: unknown[]; mutations?: { state?: { isPaused?: boolean } }[] } }) : null;
    cachedQueries = parsed?.clientState?.queries?.length ?? 0;
    pausedMutations = parsed?.clientState?.mutations?.filter((m) => m.state?.isPaused).length ?? 0;
  } catch {
    /* cache illisible : compté vide */
  }
  return { ...base, cachedQueries, pausedMutations };
}

/** Libellé de la table d'origine d'une donnée en quarantaine (MIG-COEX-04). */
const ORIGINE_QUARANTAINE: Record<QuarantaineEntry["table"], string> = { lots: "Écriture de l’Atelier", studioBrouillons: "Brouillon Studio", studioContextes: "Version lue d’une variante Studio" };

/** Téléchargement d'un fichier JSON produit sur l'appareil. */
function telecharger(nom: string, contenu: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url; a.download = nom;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LocalDataSettings() {
  const queryClient = useQueryClient();
  const online = useOnline();
  const [summary, setSummary] = useState<LocalSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [quarantaine, setQuarantaine] = useState<QuarantaineEntry[] | null>(null);
  const refresh = () => { void readLocalSummary().then(setSummary); void localStore.quarantaineLister().then(setQuarantaine); };
  useEffect(refresh, []);
  return (
    <section className="panel settings-section" aria-labelledby="settings-local">
      <h2 id="settings-local">Données conservées par ce navigateur</h2>
      <p className="panel-sub">Pour travailler sans réseau : les écrans déjà lus, les modèles de l’Atelier déjà ouverts et les écritures faites hors-ligne, rejouées au retour du réseau.</p>
      <dl className="settings-facts settings-facts-local">
        <div>
          <dt>Réseau</dt>
          <dd>{online ? "En ligne" : "Hors-ligne : les saisies sont mises en file"}</dd>
        </div>
        <div>
          <dt>Écritures de l’Atelier en attente</dt>
          <dd>
            {summary ? summary.pendingWrites : "…"}
            {summary && summary.pendingWrites > 0 && (
              <ul className="settings-pending">
                {Object.entries(summary.pendingByProject).map(([projectId, count]) => (
                  <li key={projectId}>
                    <Link to={`/projets/${projectId}?module=atelier`}>Ouvrir l’Atelier du projet</Link> — {count} écriture(s), rejouée(s) à l’ouverture
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>Modèles mis en cache</dt>
          <dd>{summary ? summary.cachedModels : "…"}</dd>
        </div>
        <div>
          <dt>Saisies en attente de réseau</dt>
          <dd>{summary ? summary.pausedMutations : "…"}</dd>
        </div>
        <div>
          <dt>Écrans mis en cache</dt>
          <dd>{summary ? (summary.available ? `${summary.cachedQueries} lecture(s)` : "stockage local indisponible (navigation privée ou quota)") : "…"}</dd>
        </div>
        <div data-quarantaine-locale={quarantaine?.length ?? ""}>
          <dt>Données sans propriétaire en quarantaine</dt>
          <dd>
            {quarantaine ? quarantaine.length : "…"}
            {!!quarantaine?.length && (
              <ul className="settings-pending" aria-label="Données en quarantaine">
                {quarantaine.map((e) => (
                  <li key={e.id} data-quarantaine-entree={e.table}>
                    <strong>{ORIGINE_QUARANTAINE[e.table]}</strong> <span>sans propriétaire</span> <time dateTime={e.misEnQuarantaineA}>{new Date(e.misEnQuarantaineA).toLocaleString(LOCALE)}</time>
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
      </dl>
      {!!quarantaine?.length && <p className="panel-sub">Données qu’une mise à jour n’a pu attribuer à aucun compte : conservées sur cet appareil, jamais rejouées ni envoyées. Exportez-les pour les examiner.</p>}
      <div className="h7-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={async () => {
            // Les écritures et saisies en attente ne sont jamais retirées : seules les lectures (requêtes, modèles) le sont.
            await localStore.clearModelCache();
            queryClient.getQueryCache().clear();
            await new Promise((r) => setTimeout(r, 400)); // le cache persistant est réécrit (regroupement 200 ms)
            refresh();
            setNotice("Caches vidés : les écrans et modèles seront relus depuis le serveur. Les écritures et saisies en attente sont conservées.");
          }}
        >
          Vider les caches locaux
        </button>
        <button type="button" className="button-secondary" disabled={!quarantaine?.length} data-quarantaine-exporter
          onClick={async () => { telecharger("fadi-quarantaine-locale.json", await localStore.quarantaineExporter()); setNotice("Quarantaine exportée : rien n’a été retiré de cet appareil."); }}>
          Exporter la quarantaine (JSON)
        </button>
      </div>
      {notice && (
        <p className="h7-muted" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}

function AppSettings() {
  const [worker, setWorker] = useState<string>("…");
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setWorker("Non pris en charge par ce navigateur : l’application exige le réseau.");
      return;
    }
    void navigator.serviceWorker
      .getRegistration()
      .then((reg) =>
        setWorker(reg?.active ? "Prête hors-ligne (application, Atelier et outil Parcelle mis en cache)." : "Pas encore installée : ouvrez l’application une fois en ligne (mode production)."),
      );
  }, []);
  return (
    <section className="panel settings-section" aria-labelledby="settings-app">
      <h2 id="settings-app">Application</h2>
      <dl className="settings-facts">
        <div>
          <dt>Version</dt>
          <dd>
            <code>{__FADI_BUILD__}</code>
          </dd>
        </div>
        <div>
          <dt>Enveloppe hors-ligne</dt>
          <dd>{worker}</dd>
        </div>
      </dl>
      <div className="h7-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={async () => {
            const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
            if (reg) await reg.update().catch(() => undefined);
            window.location.reload();
          }}
        >
          Rechercher une mise à jour
        </button>
      </div>
    </section>
  );
}

/** Cibles d'au moins 24 px (WCAG 2.5.8) : la liste des types empile sept cases à cocher. */
const LISTE_TYPES = { listStyle: "none", padding: 0, margin: "0.5rem 0", display: "grid", gap: "0.75rem" } as const;
const CIBLE_TACTILE = { width: 24, height: 24, flex: "0 0 auto" } as const;

/** Notifications : un interrupteur par type (affiché / masqué) et les projets en sourdine, réactivables ici. */
function NotificationSettings() {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: NOTIFICATION_PREFERENCES_KEY, queryFn: api.lirePreferencesNotification });
  const onSuccess = (view: NotificationPreferencesView) => {
    queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, view);
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
  // L'interrupteur suit le geste aussitôt ; un refus du serveur rétablit l'état relu.
  const types = useMutation({
    mutationFn: api.enregistrerTypesMasques,
    onMutate: async (typesMasques: NotificationKind[]) => {
      // Une lecture en cours ne doit pas écraser le geste par l'état précédent.
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_KEY });
      const avant = queryClient.getQueryData<NotificationPreferencesView>(NOTIFICATION_PREFERENCES_KEY);
      if (avant) queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, { ...avant, typesMasques });
      return { avant };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.avant) queryClient.setQueryData(NOTIFICATION_PREFERENCES_KEY, ctx.avant);
    },
    onSuccess,
  });
  const projet = useMutation({ mutationFn: (projectId: string) => api.mettreProjetEnSourdine(projectId, false), onSuccess });
  const data = prefs.data;
  const kinds = (data?.types ?? NOTIFICATION_KINDS).filter((k): k is NotificationKind => k in NOTIFICATION_KIND_LABEL);
  const busy = types.isPending || projet.isPending;
  function toggle(kind: NotificationKind, shown: boolean) {
    if (!data) return;
    const masques = shown ? data.typesMasques.filter((k) => k !== kind) : [...data.typesMasques, kind];
    types.mutate(masques);
  }
  return (
    <section className="panel settings-section" id="settings-notifications" aria-labelledby="settings-notifications-title" data-settings-notifications>
      <h2 id="settings-notifications-title">Notifications</h2>
      <p className="panel-sub">Choisissez les notifications affichées dans la cloche, pour votre compte sur tous vos appareils. Les alertes du dossier ne se masquent pas. Aucun courriel n’est envoyé.</p>
      {prefs.isLoading && <p role="status">Chargement…</p>}
      {prefs.isError && <p role="alert">Préférences non disponibles sans réseau.</p>}
      {data && (
        <ul className="settings-notification-kinds" style={LISTE_TYPES}>
          {kinds.map((kind) => {
            const shown = !data.typesMasques.includes(kind);
            return (
              <li key={kind} data-kind={kind} style={{ display: "grid", gap: "0.15rem" }}>
                <label className="h7-checkbox">
                  <input type="checkbox" style={CIBLE_TACTILE} checked={shown} disabled={busy} onChange={(e) => toggle(kind, e.target.checked)} /> {NOTIFICATION_KIND_LABEL[kind]}
                </label>
                <small>{NOTIFICATION_KIND_DESCRIPTION[kind]}</small>
              </li>
            );
          })}
        </ul>
      )}
      {data && (
        <div className="settings-muted-projects">
          <h3>Projets en sourdine</h3>
          {data.projets.length === 0 ? (
            <p className="h7-muted">Aucun projet en sourdine. Un projet se met en sourdine depuis la cloche, dans le projet.</p>
          ) : (
            <ul>
              {data.projets.map((p) => (
                <li key={p.id} data-muted-project={p.id}>
                  <span translate="no">
                    {p.code} — {p.name}
                  </span>{" "}
                  <button type="button" className="button-secondary" disabled={busy} onClick={() => projet.mutate(p.id)}>
                    Réactiver
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(types.isError || projet.isError) && <p role="alert">Le réglage n’a pas pu être enregistré (serveur injoignable ou refus).</p>}
    </section>
  );
}

/** « Nom affiché » : le prénom ou le nom sous lequel l'accueil et la barre latérale vous saluent ; facultatif, effaçable. */
function DisplayNameForm() {
  const { user, updateProfile } = useAuth();
  const [value, setValue] = useState(user?.displayName ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  useEffect(() => setValue(user?.displayName ?? ""), [user?.displayName]);
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("saving");
    try {
      await updateProfile(value.trim() || null);
      setState("saved");
    } catch {
      setState("error");
    }
  }
  return (
    <form className="settings-name-form" onSubmit={(e) => void onSubmit(e)}>
      <label htmlFor="display-name">Nom affiché</label>
      <div className="settings-name-row">
        <input id="display-name" name="displayName" type="text" maxLength={60} value={value} onChange={(e) => setValue(e.target.value)} placeholder="Prénom ou nom (facultatif)" autoComplete="name" />
        <button type="submit" className="button-primary" disabled={state === "saving" || (value.trim() || "") === (user?.displayName ?? "")}>
          {state === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <small>
        {state === "saved" ? "Nom enregistré : l’accueil vous salue par ce nom." : state === "error" ? "Le nom n’a pas pu être enregistré (serveur injoignable ou refus)." : "Sans nom, l’application reprend le début de votre adresse. Rien d’autre n’est déduit."}
      </small>
    </form>
  );
}

export function ParametresPage() {
  const { user, logout } = useAuth();
  return (
    <main className="home-page settings-page">
      <div className="home-greeting">
        <div>
          <h1>Paramètres</h1>
          <p>Compte, notifications, services externes et données locales. Les droits d’accès d’un projet (lecteur, éditeur, propriétaire, réservation d’édition) se règlent dans son module Collaboration.</p>
        </div>
      </div>
      <section className="panel settings-section" aria-labelledby="settings-account">
        <h2 id="settings-account">Compte</h2>
        <dl className="settings-facts">
          <div>
            <dt>Adresse</dt>
            <dd>{user?.email}</dd>
          </div>
        </dl>
        <DisplayNameForm />
        <div className="h7-actions">
          <button type="button" className="button-secondary" onClick={() => void logout()}>
            Se déconnecter
          </button>
          <Link className="button-secondary" to="/projets">
            Mes projets
          </Link>
        </div>
      </section>
      <MonCompte />
      <section className="panel settings-section" aria-labelledby="settings-langue" data-settings-langue>
        <h2 id="settings-langue">Langue de l'interface</h2>
        <p className="panel-sub">Français ou anglais, pour cet appareil. Les données du projet, les exemples et les documents produits restent dans leur langue.</p>
        <ChoixLangue />
      </section>
      <NotificationSettings />
      <MaptilerSettings />
      <FournisseursCarte />
      <LocalDataSettings />
      <AppSettings />
    </main>
  );
}
