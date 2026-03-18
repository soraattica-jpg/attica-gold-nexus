import { ReactNode } from "react";
import AppSidebar from "@/components/AppSidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex w-full bg-background">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto p-6">
          {children}
        </div>
      </main>
    </div>
  );
}
