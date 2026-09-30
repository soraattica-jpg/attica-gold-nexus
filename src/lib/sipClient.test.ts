import { describe, expect, it } from "vitest";
import { buildSipAgentProfile } from "./sipClient";

describe("SIP identity", () => {
  it("uses the authenticated admin's configured PBX credentials", () => {
    expect(buildSipAgentProfile({ id: "test-admin", role: "admin", name: "Test", extension: "1001", sipPassword: "test-only-secret" })?.sipPassword)
      .toBe("test-only-secret");
  });
  it("does not invent a shared password for an unconfigured admin phone", () => {
    expect(buildSipAgentProfile({ id: "test-admin", role: "superadmin", name: "Test", extension: "1007" })).toBeNull();
  });
  it("keeps assigned agent credentials unchanged", () => {
    expect(buildSipAgentProfile({ id: "test-agent", role: "agent", name: "Test", extension: "2001", sipPassword: "test-only-agent" })?.sipPassword)
      .toBe("test-only-agent");
  });
});
