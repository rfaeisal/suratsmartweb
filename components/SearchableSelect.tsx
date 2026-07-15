"use client"

import { useState, useRef, useEffect } from "react"

export interface SelectOption {
  value: string
  label: string
  sub?: string
}

interface Props {
  options: SelectOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  allowEmpty?: boolean
  emptyLabel?: string
  className?: string
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Cari…",
  allowEmpty = false,
  emptyLabel = "— Tidak ada —",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onClickOutside)
    return () => document.removeEventListener("mousedown", onClickOutside)
  }, [])

  const selected = options.find((o) => o.value === value)

  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sub ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : options

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value)
    setOpen(true)
    if (!e.target.value) onChange("")
  }

  function handleFocus() {
    setQuery("")
    setOpen(true)
  }

  function select(val: string) {
    onChange(val)
    setOpen(false)
    setQuery("")
  }

  const inputBase =
    "w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        type="text"
        value={open ? query : (selected?.label ?? "")}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={placeholder}
        autoComplete="off"
        className={inputBase}
      />
      {/* Chevron icon */}
      <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </span>

      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {allowEmpty && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select("")}
              className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors ${value === "" ? "bg-blue-50" : ""}`}
            >
              <p className="text-sm text-gray-400 italic">{emptyLabel}</p>
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">Tidak ada hasil</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors ${o.value === value ? "bg-blue-50" : ""}`}
              >
                <p className="text-sm font-medium text-gray-900">{o.label}</p>
                {o.sub && <p className="text-xs text-gray-400 mt-0.5">{o.sub}</p>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
