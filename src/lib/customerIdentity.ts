export function buildCustomerUid(phone: string | null | undefined): string {
  void phone;
  return "";
}

export function getCallCustomerUid(call: {
  customerUid?: string;
  customerId?: string;
  callerId?: string;
} | null | undefined): string {
  const explicitUid = String(call?.customerUid || call?.customerId || "").trim();
  if (explicitUid) return explicitUid;
  return buildCustomerUid(call?.callerId);
}
