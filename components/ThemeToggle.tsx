"use client"

import { useState, useEffect } from "react"

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem("theme")
    const dark =
      stored === "dark" ||
      (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
    setIsDark(dark)
  }, [])

  function toggle() {
    const next = !isDark
    setIsDark(next)
    const theme = next ? "dark" : "light"
    localStorage.setItem("theme", theme)
    document.documentElement.setAttribute("data-theme", theme)
  }

  return (
    <button
      onClick={toggle}
      title={isDark ? "Beralih ke Mode Terang" : "Beralih ke Mode Gelap"}
      className={`flex items-center justify-center w-7 h-7 rounded-lg transition-colors
        text-gray-400 hover:text-gray-700 hover:bg-gray-100
        dark:text-slate-500 dark:hover:text-slate-200 dark:hover:bg-slate-700
        ${className}`}
    >
      {isDark ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4"/>
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  )
}
