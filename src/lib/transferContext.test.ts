import { describe, expect, it } from "vitest";

import { shouldBypassLanguageFilterForTransfer } from "@/lib/transferContext";

describe("transferContext", () => {
  it("bypasses the language filter for an active recent transfer targeting the current extension", () => {
    expect(shouldBypassLanguageFilterForTransfer({
      id: "TRF-1",
      phone: "8068711201",
      targetExtension: "2033",
      customerName: "",
      mob2: "",
      age: "",
      gender: "",
      district: "",
      location: "",
      branch: "",
      language: "English",
      businessType: "",
      metalType: "",
      grams: "",
      releasingAmount: "",
      bankName: "",
      onlinePrice: "",
      pricePerGram: "",
      advertisement: "",
      lead: "",
      formStatus: "",
      purpose: "",
      notes: "",
      isActive: true,
      updatedAt: "2026-04-24T05:40:00.000Z",
    }, "2033", new Date("2026-04-24T05:42:00.000Z").getTime())).toBe(true);
  });

  it("does not bypass when the transfer targets another extension", () => {
    expect(shouldBypassLanguageFilterForTransfer({
      id: "TRF-1",
      phone: "8068711201",
      targetExtension: "2034",
      customerName: "",
      mob2: "",
      age: "",
      gender: "",
      district: "",
      location: "",
      branch: "",
      language: "English",
      businessType: "",
      metalType: "",
      grams: "",
      releasingAmount: "",
      bankName: "",
      onlinePrice: "",
      pricePerGram: "",
      advertisement: "",
      lead: "",
      formStatus: "",
      purpose: "",
      notes: "",
      isActive: true,
      updatedAt: "2026-04-24T05:40:00.000Z",
    }, "2033", new Date("2026-04-24T05:42:00.000Z").getTime())).toBe(false);
  });

  it("does not bypass stale transfer contexts", () => {
    expect(shouldBypassLanguageFilterForTransfer({
      id: "TRF-1",
      phone: "8068711201",
      targetExtension: "2033",
      customerName: "",
      mob2: "",
      age: "",
      gender: "",
      district: "",
      location: "",
      branch: "",
      language: "English",
      businessType: "",
      metalType: "",
      grams: "",
      releasingAmount: "",
      bankName: "",
      onlinePrice: "",
      pricePerGram: "",
      advertisement: "",
      lead: "",
      formStatus: "",
      purpose: "",
      notes: "",
      isActive: true,
      updatedAt: "2026-04-24T05:20:00.000Z",
    }, "2033", new Date("2026-04-24T05:42:00.000Z").getTime())).toBe(false);
  });
});
