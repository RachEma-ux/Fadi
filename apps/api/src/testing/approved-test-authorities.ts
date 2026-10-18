/**
 * Fixed trust anchor, deliberately empty in DB-1/2. No env variable/path or descriptor can enroll a key.
 * DB-3 requires separately approved provisioning, public-key enrollment and real disposable-DB trials.
 * Test fixture signers MUST NEVER be added here. This is not a production database configuration.
 */
export const APPROVED_TEST_AUTHORITIES: Readonly<Record<string, string>> = Object.freeze({});
