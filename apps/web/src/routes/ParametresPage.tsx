/**
 * « Paramètres » : ce qui se règle réellement dans Fadi aujourd'hui —
 * le compte (adresse, déconnexion), la connexion MapTiler (clé de
 * l'utilisateur, réutilisée par l'étape 01 et l'outil Parcelle, jamais
 * envoyée à l'API Fadi), les données conservées par ce navigateur pour le
 * travail hors-ligne, et la version de l'application. Les droits d'accès
 * d'un projet se règlent dans son module Collaboration, pas ici.
 */
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/auth-context";
import { localStore } from "../lib/local-store";
import { resumeStockageAtelier, viderModelesAtelier } from "../modules/atelier/bus";
import { QUERY_CACHE_VERSION } from "../lib/query-persister";
import { forgetMaptilerKey, maptilerKey, MAPTILER_KEY_STORAGE, useMaptilerKey } from "../lib/maptiler";
import { useOnline } from "../components/SyncIndicator";

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
  const atelier = await resumeStockageAtelier();
  const base = { available: atelier.disponible, pendingWrites: atelier.enAttente, pendingByProject: { ...atelier.enAttenteParProjet }, cachedModels: atelier.modeles };
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

function LocalDataSettings() {
  const queryClient = useQueryClient();
  const online = useOnline();
  const [summary, setSummary] = useState<LocalSummary | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const refresh = () => void readLocalSummary().then(setSummary);
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
      </dl>
      <div className="h7-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={async () => {
            // Les écritures et saisies en attente ne sont jamais retirées : seules les lectures (requêtes, modèles) le sont.
            await viderModelesAtelier();
            queryClient.getQueryCache().clear();
            await new Promise((r) => setTimeout(r, 400)); // le cache persistant est réécrit (regroupement 200 ms)
            refresh();
            setNotice("Caches vidés : les écrans et modèles seront relus depuis le serveur. Les écritures et saisies en attente sont conservées.");
          }}
        >
          Vider les caches locaux
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
          <p>Compte, services externes et données locales. Les droits d’accès d’un projet (lecteur, éditeur, propriétaire, réservation d’édition) se règlent dans son module Collaboration.</p>
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
      <MaptilerSettings />
      <LocalDataSettings />
      <AppSettings />
    </main>
  );
}
