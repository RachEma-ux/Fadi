/* Pont Fadi pour l'outil Parcelle (remplace local-files.js du prototype).
 * L'outil parle l'API `/api/parcels` de son « Site » d'origine (voir
 * project-files.js) : on la dirige vers le projet Fadi indiqué dans l'URL
 * de l'iframe (`?project=<id>`), avec les identifiants de session. Rien
 * d'autre n'est modifié : `ParcelFiles.create` reçoit simplement un
 * `fetch` et l'identifiant de parcelle à rouvrir. */
(() => {
  'use strict';
  const projectId = new URL(location.href).searchParams.get('project') || '';
  const base = '/projects/' + encodeURIComponent(projectId) + '/parcels';
  async function request(path, init = {}) {
    if (!projectId) throw new Error('Projet Fadi absent : ouvrez la parcelle depuis un projet.');
    const target = path === '/api/parcels' ? base : path.startsWith('/api/parcels/') ? base + path.slice('/api/parcels'.length) : null;
    if (!target) return { ok: false, status: 404, json: async () => ({ error: 'Opération indisponible.' }) };
    return fetch(target, { ...init, credentials: 'include' });
  }
  if (!crypto.randomUUID) {
    crypto.randomUUID = () => {
      const a = new Uint8Array(16);
      crypto.getRandomValues(a);
      a[6] = (a[6] & 15) | 64;
      a[8] = (a[8] & 63) | 128;
      return Array.from(a, (v, i) => ([4, 6, 8, 10].includes(i) ? '-' : '') + v.toString(16).padStart(2, '0')).join('');
    };
  }
  const originalCreate = ParcelFiles.create;
  ParcelFiles.create = (options) => originalCreate({ ...options, fetch: request });
})();
