"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarRange,
  Building2,
  Users,
  Settings,
  LogOut,
  Zap,
  Menu,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";

type NavItem = { href: string; label: string; icon: React.ReactNode; superAdminOnly?: boolean };

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
  { href: "/sessions", label: "Academic Sessions", icon: <CalendarRange size={18} />, superAdminOnly: true },
  { href: "/departments", label: "Departments", icon: <Building2 size={18} />, superAdminOnly: true },
  { href: "/students", label: "Students", icon: <Users size={18} /> },
  { href: "/settings", label: "Account Settings", icon: <Settings size={18} /> },
];

export function AdminSidebar({ userName, role }: { userName: string; role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the drawer automatically on navigation (mobile) so tapping a
  // link doesn't leave the sidebar sitting open over the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-admin-accent to-admin-accentDark">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold leading-tight text-admin-text">UMaT DUES</p>
          <p className="text-xs leading-tight text-admin-muted">Admin Portal</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="ml-auto flex h-8 w-8 items-center justify-center rounded-lg text-admin-muted hover:text-admin-text md:hidden"
          aria-label="Close menu"
          type="button"
        >
          <X size={20} />
        </button>
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
    </>
  );

  return (
    <>
      {/* Mobile top bar: hamburger to open the drawer. Hidden on md+ where
          the sidebar is always visible inline. */}
      <div className="flex items-center gap-3 border-b border-[#2a2338] bg-[#0d0a14] px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-admin-text"
          aria-label="Open menu"
          type="button"
        >
          <Menu size={22} />
        </button>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-admin-accent to-admin-accentDark">
          <Zap size={16} className="text-white" />
        </div>
        <p className="text-sm font-bold text-admin-text">UMaT DUES</p>
      </div>

      {/* Mobile off-canvas drawer + backdrop */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-72 max-w-[80vw] flex-col border-r border-[#2a2338] bg-[#0d0a14] px-4 py-5">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop/tablet: always-visible static sidebar */}
      <aside className="hidden w-64 flex-shrink-0 flex-col border-r border-[#2a2338] bg-[#0d0a14] px-4 py-5 md:flex">
        {sidebarContent}
      </aside>
    </>
  );
}
