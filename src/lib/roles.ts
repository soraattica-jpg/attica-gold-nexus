export const isAdminRole = (role?: string | null) => role === "admin" || role === "superadmin";

export const formatRoleLabel = (role?: string | null) => {
  if (role === "superadmin") return "Master Admin";
  if (!role) return "";
  return role.replace(/-/g, " ");
};
