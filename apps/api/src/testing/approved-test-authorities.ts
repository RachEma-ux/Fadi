/**
 * Fixed trust anchor. No env variable/path or descriptor can enroll a key: only a reviewed change of this file.
 * DB-3 (owner approval, 22 October 2026): "fadi-ci-db3" is the Ed25519 public key whose private key is the GitHub
 * secret FADI_TEST_DB_SIGNING_KEY, generated and held by the owner (public key read from the CI run of PR #256).
 * Test fixture signers MUST NEVER be added here. This is not a production database configuration.
 */
export const APPROVED_TEST_AUTHORITIES: Readonly<Record<string, string>> = Object.freeze({
  "fadi-ci-db3": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAN/AwLJY/sjXkTT4FYr5KQDPMDmXJyj7+3qdusFu6UhA=\n-----END PUBLIC KEY-----\n",
});
