"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"

export function SidebarLayout({
  sidebar,
  children,
  title = "CutiSmart",
  maxWidth = "max-w-6xl",
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
  title?: string
  maxWidth?: string
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Overlay mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-gray-200 flex flex-col h-full transition-transform duration-200 ease-in-out flex-shrink-0 ${
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {sidebar}
      </aside>

      {/* Konten utama */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top bar mobile */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Buka menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="font-semibold text-gray-900 text-sm">{title}</span>
        </div>

        <main className="flex-1 overflow-auto">
          <div className={`${maxWidth} mx-auto px-4 md:px-6 py-4 md:py-6`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
