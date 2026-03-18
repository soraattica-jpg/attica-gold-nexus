import React, { createContext, useContext, useState, ReactNode } from "react";

export type UserRole = "admin" | "agent" | "qc";

interface User {
  name: string;
  role: UserRole;
  id: string;
}

interface AuthContextType {
  user: User | null;
  login: (role: UserRole) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const roleUsers: Record<UserRole, User> = {
  admin: { name: "Rajesh Kumar", role: "admin", id: "USR-001" },
  agent: { name: "Priya Sharma", role: "agent", id: "USR-004" },
  qc: { name: "Anita Desai", role: "qc", id: "USR-007" },
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (role: UserRole) => setUser(roleUsers[role]);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
