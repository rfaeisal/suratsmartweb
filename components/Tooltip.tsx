import { ReactNode } from "react"

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="relative group/tooltip inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover/tooltip:opacity-100 z-50">
        {label}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
      </span>
    </div>
  )
}
