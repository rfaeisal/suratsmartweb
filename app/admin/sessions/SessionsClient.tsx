"use client"

import { useState } from "react"
import { Tooltip } from "@/components/Tooltip"

interface Session {
  id: string
  deviceId: string
  deviceLabel: string | null
  createdAt: string | Date
  lastActiveAt: string | Date
  user: {
    employee: {
      nip: string
      fullName: string
      unit: { name: string } | null
    }
  }
}

interface Props {
  sessions: Session[]
  adminUserId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revokeAction: (sessionId: string, adminUserId: string) => any
}

export default function SessionsClient({ sessions, adminUserId, revokeAction }: Props) {
  const [search, setSearch] = useState("")

  const filtered = !search
    ? sessions
    : sessions.filter((s) => {
        const q = search.toLowerCase()
        return (
          s.user.employee.fullName.toLowerCase().includes(q) ||
          s.user.employee.nip.includes(q) ||
          (s.user.employee.unit?.name ?? "").toLowerCase().includes(q) ||
          (s.deviceLabel ?? "").toLowerCase().includes(q)
        )
      })

  const inputClass =
    "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-700 flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
          Sesi Aktif: {sessions.length}
        </span>
        {sessions.length > 0 && (
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama / NIP / unit / perangkat…"
            className={`${inputClass} w-64`}
          />
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="px-4 py-8 text-center text-gray-400 dark:text-slate-500 text-sm">
          {search
            ? `Tidak ada sesi yang cocok dengan "${search}".`
            : "Tidak ada sesi aktif saat ini."}
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-slate-700">
              <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-slate-300">Pegawai</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-slate-300">Unit</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-slate-300">Perangkat</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-slate-300">Login Sejak</th>
              <th className="text-left px-4 py-3 font-medium text-gray-700 dark:text-slate-300">Aktif Terakhir</th>
              <th className="text-right px-4 py-3 font-medium text-gray-700 dark:text-slate-300">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {filtered.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 dark:text-slate-100">{s.user.employee.fullName}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{s.user.employee.nip}</p>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-400">{s.user.employee.unit?.name ?? "—"}</td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-400">
                  <p>{s.deviceLabel ?? "–"}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{s.deviceId.slice(0, 12)}…</p>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-400 text-xs">
                  {new Date(s.createdAt).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-400 text-xs">
                  {new Date(s.lastActiveAt).toLocaleString("id-ID")}
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={revokeAction.bind(null, s.id, adminUserId)}>
                    <Tooltip label="Force Sign-out">
                      <button
                        type="submit"
                        className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                      </button>
                    </Tooltip>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
