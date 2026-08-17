"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  Building2,
  Users,
  LogOut,
  Zap,
} from "lucide-react";
import { signOut } from "next-auth/react";

type NavItem = { href: string; label: string; icon: React.ReactNode; superAdminOnly?: boolean };

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/sessions", label: "Academic Sessions", icon: <CalendarRange size={18} />, superAdminOnly: true },
  { href: "/departments", label: "Departments", icon: <Building2 size={18} />, superAdminOnly: true },
  { href: "/students", label: "Students", icon: <Users size={18} /> },
];

export function AdminSidebar({ userName, role }: { userName: string; role: string }) {
  const pathname = usePathname();

  return (
    <aside className="flex w-64 flex-shrink-0 flex-col border-r border-[#2a2338] bg-[#0d0a14] px-4 py-5">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-admin-accent to-admin-accentDark">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-admin-text">UMaT DUES</p>
          <p className="text-xs leading-tight text-admin-muted">Admin Portal</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems
          .filter((item) => !item.superAdminOnly || role === "SUPER_ADMIN")
          .map((item) => {
            const active = pathname?.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href} className={`admin-nav-link ${active ? "active" : ""}`}>
                {item.icon}
                {item.label}
              </Link>
            );
          })}
      </nav>

      <div className="mt-4 border-t border-[#2a2338] pt-4">
        <div className="mb-2 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-admin-accent/20 text-sm font-semibold text-admin-accent">
            {userName?.[0]?.toUpperCase() ?? "A"}
          </div>
          <div className="overflow-hidden">
            <p className="truncate text-sm font-medium text-admin-text">{userName}</p>
            <p className="text-xs text-admin-muted">{role === "SUPER_ADMIN" ? "Super Admin" : "Department Admin"}</p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="admin-nav-link w-full justify-start"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
