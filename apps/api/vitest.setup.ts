import { config } from "dotenv";

// En local, charge apps/api/.env.test s'il existe (voir README), sans
// jamais écraser une variable déjà définie par l'environnement (CI fournit
// DATABASE_URL directement, par exemple via un service Postgres).
config({ path: ".env.test" });
