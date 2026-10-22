/**
 * Fixed trust anchor. No env variable/path or descriptor can enroll a key.
 * Owner-provided DB-3 public key; disposable CI databases only.
 * DB-3 requires separately approved provisioning and real disposable-DB trials.
 * Test fixture signers MUST NEVER be added here. This is not a production database configuration.
 */
export const APPROVED_TEST_AUTHORITIES: Readonly<Record<string, string>> = Object.freeze({
  "owner-db3-2026-10":
    "-----BEGIN PUBLIC KEY-----\n" +
    "MCowBQYDK2VwAyEAN/AwLJY/sjXkTT4FYr5KQDPMDmXJyj7+3qdusFu6UhA=\n" +
    "-----END PUBLIC KEY-----\n",
});
