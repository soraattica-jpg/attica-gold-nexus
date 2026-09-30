import { describe, expect, it } from "vitest";
import { getCallCategory, getDispositionCategory, getDispositionLabel } from "./dispositions";

describe("getDispositionLabel", () => {
  it("combines legacy codes and truncated report values into canonical labels", () => {
    expect(getDispositionLabel("COMING_TO_BRANCH")).toBe("Coming To Branch");
    expect(getDispositionLabel("CTO")).toBe("Coming to Office");
    expect(getDispositionLabel("DIS")).toBe("Disconnected");
    expect(getDispositionLabel("DIS_NC")).toBe("Disconnected - Not Connected");
    expect(getDispositionLabel("Disconnected - Not C")).toBe("Disconnected - Not Connected");
    expect(getDispositionLabel("Customer Disconnecte")).toBe("Customer Disconnected");
    expect(getDispositionLabel("GL_OTHER")).toBe("General Enquiry - Other");
    expect(getDispositionLabel("General Enquiry - Ot")).toBe("General Enquiry - Other");
    expect(getDispositionLabel("GRE_OLD")).toBe("Gold Rate Enquiry - Old Gold");
    expect(getDispositionLabel("Gold Rate Enquiry -")).toBe("Gold Rate Enquiry - Old Gold");
    expect(getDispositionLabel("NBL")).toBe("Nearest Branch Location");
    expect(getDispositionLabel("Nearest Branch Locat")).toBe("Nearest Branch Location");
    expect(getDispositionLabel("SE_SELL")).toBe("Service Enquiry - Sell Gold");
    expect(getDispositionLabel("Service Enquiry - Se")).toBe("Service Enquiry - Sell Gold");
    expect(getDispositionLabel("Service Enquiry - Re")).toBe("Service Enquiry - Release Gold");
    expect(getDispositionLabel("Margin Reduce Reques")).toBe("Margin Reduce Request");
    expect(getDispositionLabel("Service Delay Compla")).toBe("Service Delay Complaint");
    expect(getDispositionLabel("Payment Channel Enqu")).toBe("Payment Channel Enquiry");
    expect(getDispositionLabel("Documents Required I")).toBe("Documents Required Information");
    expect(getDispositionLabel("Quotation Given With")).toBe("Quotation Given Without Purity Check");
    expect(getDispositionLabel("Staff Behaviour Comp")).toBe("Staff Behaviour Complaint");
    expect(getDispositionLabel("Disconnected - Langu")).toBe("Disconnected - Language Barrier");
    expect(getDispositionLabel("Speed Up Validation")).toBe("Speed Up Validation Request");
    expect(getDispositionLabel("VISITED_SOLD_OUT")).toBe("Visited Sold Out");
  });

  it("suppresses placeholder values", () => {
    expect(getDispositionLabel("#N/A")).toBe("");
    expect(getDispositionLabel("N/A")).toBe("");
  });

  it("maps dispositions into report categories", () => {
    expect(getDispositionCategory("NI")).toBe("Lost");
    expect(getDispositionCategory("GRE_OLD")).toBe("Enquiry");
    expect(getDispositionCategory("CB")).toBe("Follow Up / Call Back");
    expect(getDispositionCategory("QM")).toBe("L2 Lost & Complaints");
    expect(getDispositionCategory("DIS_NC")).toBe("RNR");
    expect(getDispositionCategory("INT")).toBe("QL");
    expect(getDispositionCategory("SOLD")).toBe("Billed");
    expect(getDispositionCategory("Sold Out")).toBe("Billed");
    expect(getDispositionCategory("Abuse Call")).toBe("Lost");
    expect(getDispositionCategory("Door-Step Enquiry")).toBe("QL");
    expect(getDispositionCategory("Missed")).toBe("Follow Up / Call Back");
    expect(getDispositionCategory("None")).toBe("Others");
    expect(getDispositionCategory("Out of State")).toBe("Others");
    expect(getDispositionCategory("OOS")).toBe("Others");
    expect(getDispositionCategory("Not Serviceable")).toBe("L2 Lost & Complaints");
    expect(getDispositionCategory("Pending (They will discuss and come)")).toBe("Follow Up / Call Back");
    expect(getDispositionCategory("Pending Calls")).toBe("Follow Up / Call Back");
    expect(getDispositionCategory("Planning to Visit (Date and Time)")).toBe("QL");
    expect(getDispositionCategory("Repledge Enquiry")).toBe("Enquiry");
    expect(getDispositionCategory("Silver Enquiry")).toBe("Enquiry");
    expect(getDispositionCategory("Sold Outside")).toBe("L2 Lost & Complaints");
    expect(getDispositionCategory("Transferred")).toBe("Enquiry");
    expect(getDispositionCategory("Customer Disconnected")).toBe("Follow Up / Call Back");
    expect(getDispositionCategory("Visited Branch")).toBe("Walkin");
  });

  it("applies row-based call category business rules", () => {
    expect(getCallCategory({ duration: "00:00:00", status: "failed", disposition: "Ring No Reply" })).toBe("RNR");
    expect(getCallCategory({ status: "completed", disposition: "Planning to Visit" })).toBe("QL");
    expect(getCallCategory({ status: "completed", disposition: "Customer Disconnected" })).toBe("Follow Up / Call Back");
    expect(getCallCategory({ status: "completed", disposition: "Pending Calls" })).toBe("Follow Up / Call Back");
    expect(getCallCategory({ status: "active", disposition: "None" })).toBe("Others");
    expect(getCallCategory({ status: "active", disposition: "Scheduled" })).toBe("Active / Scheduled Call");
  });
});
