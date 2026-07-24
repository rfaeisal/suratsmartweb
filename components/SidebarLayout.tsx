"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"

export function SidebarLayout({
  sidebar,
  children,
  title = "CutiSmart",
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
  title?: string
  maxWidth?: string // kept for API compat, unused — pages control their own width
}) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  return (
    <div className="h-screen bg-gray-50 dark:bg-slate-950 flex overflow-hidden">
      {/* Overlay mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — desktop: rendered by AdminSidebar (controls own width); mobile: drawer */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-30 h-full flex flex-col transition-transform duration-200 ease-in-out md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      {/* Konten utama */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar mobile */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Buka menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-semibold text-gray-900 dark:text-slate-100 text-sm">{title}</span>
        </div>

        {/* Routes listed here skip the max-w-7xl wrapper and get a full-page flex container */}
        {pathname.startsWith("/admin/attendance/roster") ? (
          <main className="flex-1 overflow-hidden flex flex-col min-h-0">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
              {children}
            </div>
          </main>
        )}
      </div>
    </div>
  )
}
