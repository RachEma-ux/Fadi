import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import { afterAll, afterEach, expect, vi } from "vitest";

// Fail before any real network access, including accidentally imported database clients.
const blocked = () => { throw new Error("DB_GUARD_TEST_NETWORK_FORBIDDEN"); };
const sentinels = [
  vi.spyOn(net.Socket.prototype, "connect").mockImplementation(blocked),
  vi.spyOn(net, "createConnection").mockImplementation(blocked),
  vi.spyOn(tls, "connect").mockImplementation(blocked),
  vi.spyOn(dns, "lookup").mockImplementation(blocked),
  vi.spyOn(dns, "resolve").mockImplementation(blocked),
];
afterEach(() => { for (const sentinel of sentinels) expect(sentinel).not.toHaveBeenCalled(); });
afterAll(() => { for (const sentinel of sentinels) sentinel.mockRestore(); });
