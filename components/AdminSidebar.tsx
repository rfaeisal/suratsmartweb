"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ThemeToggle } from "./ThemeToggle"

export interface NavItem {
  href: string
  label: string
  iconName: string
}

export interface NavGroup {
  group: string
  items: NavItem[]
}

interface Props {
  navGroups: NavGroup[]
  userName: string
  userNip: string
  userInitial: string
  signOutAction: () => Promise<void>
}

// ── SVG helper ─────────────────────────────────────────────────────────────
function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      className="shrink-0">
      {children}
    </svg>
  )
}

const ICONS: Record<string, React.ReactNode> = {
  dashboard:  <Svg><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></Svg>,
  leave:      <Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></Svg>,
  report:     <Svg><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Svg>,
  employees:  <Svg><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></Svg>,
  sync:       <Svg><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></Svg>,
  leaveType:  <Svg><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></Svg>,
  unit:       <Svg><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Svg>,
  position:   <Svg><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></Svg>,
  shift:      <Svg><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></Svg>,
  holiday:    <Svg><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Svg>,
  device:     <Svg><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></Svg>,
  attendance: <Svg><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/></Svg>,
  roster:     <Svg><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></Svg>,
  overtime:   <Svg><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Svg>,
  swap:       <Svg><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></Svg>,
  users:      <Svg><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Svg>,
  sessions:   <Svg><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Svg>,
  audit:      <Svg><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></Svg>,
  settings:   <Svg><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></Svg>,
}

function NavLink({ href, label, iconName, active, collapsed }: {
  href: string; label: string; iconName: string; active: boolean; collapsed: boolean
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const [tooltipTop, setTooltipTop] = useState<number | null>(null)

  return (
    <>
      <Link
        ref={ref}
        href={href}
        onMouseEnter={() => {
          if (collapsed && ref.current) {
            const r = ref.current.getBoundingClientRect()
            setTooltipTop(r.top + r.height / 2)
          }
        }}
        onMouseLeave={() => setTooltipTop(null)}
        className={`flex items-center gap-2.5 rounded-lg transition-colors ${
          collapsed ? "justify-center px-0 py-2.5" : "px-2.5 py-2"
        } ${
          active
            ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
            : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-100"
        }`}
      >
        <span className={active ? "text-blue-600 dark:text-blue-400" : ""}>{ICONS[iconName]}</span>
        {!collapsed && <span className="text-sm overflow-hidden truncate">{label}</span>}
      </Link>
      {collapsed && tooltipTop !== null && (
        <span
          style={{ position: "fixed", top: tooltipTop, left: 66, transform: "translateY(-50%)" }}
          className="pointer-events-none z-[9999] whitespace-nowrap rounded-md bg-gray-900 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg"
        >
          {label}
        </span>
      )}
    </>
  )
}

export function AdminSidebar({ navGroups, userName, userNip, userInitial, signOutAction }: Props) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem("sidebar-collapsed") === "1")
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-collapsed", next ? "1" : "0")
      return next
    })
  }

  const isActive = (href: string) =>
    pathname === href || (href !== "/admin/dashboard" && pathname.startsWith(href))

  return (
    <aside
      className={`flex flex-col h-full bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-700 transition-all duration-200 ease-in-out ${
        collapsed ? "w-14" : "w-64"
      }`}
    >
      {/* Logo + toggle */}
      <div className={`flex items-center border-b border-gray-200 dark:border-slate-700 h-14 shrink-0 ${collapsed ? "justify-center" : "px-4 justify-between"}`}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 dark:text-slate-50 leading-tight">CutiSmart</p>
            <p className="text-[10px] text-gray-400 dark:text-slate-500 leading-tight">Admin Panel</p>
          </div>
        )}
        <button
          onClick={toggle}
          title={collapsed ? "Perluas sidebar" : "Perkecil sidebar"}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          <Svg>
            {collapsed
              ? <polyline points="9 18 15 12 9 6"/>
              : <polyline points="15 18 9 12 15 6"/>
            }
          </Svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {navGroups.map((group, gi) => (
          <div key={gi} className={collapsed ? "mb-1" : "mb-4"}>
            {!collapsed && group.group && (
              <p className="px-4 mb-1 text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
                {group.group}
              </p>
            )}
            {collapsed && group.group && gi > 0 && (
              <div className="mx-3 my-2 border-t border-gray-100 dark:border-slate-800" />
            )}
            <div className="space-y-0.5 px-2">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  iconName={item.iconName}
                  active={isActive(item.href)}
                  collapsed={collapsed}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-gray-200 dark:border-slate-700 shrink-0 ${collapsed ? "py-2 flex flex-col items-center gap-1" : "px-3 py-2"}`}>
        {collapsed ? (
          <>
            <div className="group relative w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center">
              <span className="pointer-events-none absolute left-full ml-2.5 bottom-0 z-50 whitespace-nowrap rounded-md bg-gray-900 dark:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
                {userName}<br/><span className="text-gray-400">NIP. {userNip}</span>
              </span>
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{userInitial}</span>
            </div>
            <ThemeToggle />
            <form action={signOutAction}>
              <button type="submit" title="Keluar" className="flex items-center justify-center w-7 h-7 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Svg>
              </button>
            </form>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">{userInitial}</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 dark:text-slate-100 truncate leading-tight">{userName}</p>
              <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate leading-tight">NIP. {userNip}</p>
            </div>
            <ThemeToggle />
            <form action={signOutAction}>
              <button type="submit" title="Keluar" className="flex items-center justify-center w-7 h-7 text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors">
                <Svg><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Svg>
              </button>
            </form>
          </div>
        )}
      </div>
    </aside>
  )
}
