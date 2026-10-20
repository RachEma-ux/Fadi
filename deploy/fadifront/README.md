# FadiFront — Infomaniak Web Hosting

The sources are taken from **RachEma-ux/Fadi**, not from Parcours_Modele.html.

## Build

Run: `npm ci && cd apps/web && ../../node_modules/.bin/vite build --config vite.front.config.ts`.

The manually triggered GitHub Action `FadiFront static Infomaniak build` generates a deployable artifact from the selected source revision. It does not recreate a deployment branch. Upload the **contents** of `fadifront-deploy/` to the Infomaniak Apache/PHP document root, after backing up the existing website. The files `index.php`, `.htaccess`, `front.html` and `assets/` must be at that root. This uses PHP to gate all compiled resource requests behind a session.

**Initial demo login**: username `admin`, password `1234`. Weak demonstration-only credential. Change to a strong password before private work and do not treat this gate as multi-user access control.

The static edition uses the original Fadi React components, module registry and the 21 Parcours step definitions plus P.118 example and parcel data. It explicitly does **not** provide real Atelier editing, project persistence, collaboration, server reports or database access. None of those must be simulated as working.

Do **not** upload an old `index.html` next to the PHP entrypoint. Keep a backup outside the document root.
