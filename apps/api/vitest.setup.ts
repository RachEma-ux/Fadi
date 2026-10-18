import { config } from "dotenv";

// En local, charge apps/api/.env.test s'il existe (voir README), sans
// jamais écraser une variable déjà définie par l'environnement.
// DATABASE_URL n'est jamais une cible de test : le client exige une
// TEST_DATABASE_URL explicite et une attestation indépendante approuvée.
config({ path: ".env.test" });
