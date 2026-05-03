import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { AdminProvider } from "@/components/layout/AdminContext";
import { Toaster } from "sonner";

export default function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <AuthGuard>
      <AdminProvider>
        <div className="flex h-screen overflow-hidden bg-neutral-100">
          <Sidebar />
          <main className="flex-1 overflow-y-auto" style={{ marginLeft: "var(--sidebar-width)" }}>
            {children}
          </main>
        </div>
        <Toaster richColors position="top-right" />
      </AdminProvider>
    </AuthGuard>
  );
}
