import type { RealBranchRecord } from "@/lib/api";

const cleanUrl = (value: unknown): string => String(value || "").trim();

export const isBranchLocationUrl = (value: unknown): value is string => {
  const url = cleanUrl(value);
  if (!/^https?:\/\//i.test(url)) return false;
  if (/docs\.google\.com\/spreadsheets/i.test(url)) return false;
  return true;
};

export const getBranchLocationUrl = (branch: Partial<RealBranchRecord> | null | undefined): string => {
  if (!branch) return "";

  const candidates = [
    branch.mapUrl,
    branch.bitlyUrl,
    branch.url,
  ];

  return candidates.find(isBranchLocationUrl) || "";
};
