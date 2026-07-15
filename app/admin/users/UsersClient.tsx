"use client"

import { useState, useMemo } from "react"
import UserRolesForm from "./UserRolesForm"
import { exportToExcel, exportToPdf, type ExportRow } from "@/lib/export/never-logged-in"

const ALL_ROLES = ["PEGAWAI", "APPROVER", "ADMIN_KEPEGAWAIAN", "SUPERADMIN"] as const

const ROLE_LABELS: Record<string, string> = {
  PEGAWAI: "Pegawai",
  APPROVER: "Approver",
  ADMIN_KEPEGAWAIAN: "Admin Kepegawaian",
  SUPERADMIN: "Superadmin",
}

const EMP_TYPE_LABELS: Record<string, string> = {
  PNS: "PNS",
  PPPK: "PPPK",
  PPPK_PARUH_WAKTU: "PPPK Paruh Waktu",
  BLUD: "BLUD",
}

interface User {
  id: string
  roles: string[]
  username: string | null
  employee: {
    fullName: string
    nip: string
    positionTitle: string | null
    unit: { name: string } | null
  }
}

interface NeverLoggedIn {
  id: string
  nip: string
  fullName: string
  employeeType: string
  positionTitle: string | null
  unit: { name: string } | null
}

interface Props {
  users: User[]
  neverLoggedIn: NeverLoggedIn[]
  isSuperadmin: boolean
}

export default function UsersClient({ users, neverLoggedIn, isSuperadmin }: Props) {
  const [tab, setTab] = useState<"registered" | "never">("registered")
  const [query, setQuery] = useState("")
  const [filterRole, setFilterRole] = useState("ALL")
  const [queryNever, setQueryNever] = useState("")
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null)

  function toExportRows(list: NeverLoggedIn[]): ExportRow[] {
    return list.map((e) => ({
      fullName: e.fullName,
      nip: e.nip,
      employeeType: e.employeeType,
      positionTitle: e.positionTitle,
      unitName: e.unit?.name ?? null,
    }))
  }

  async function handleExport(format: "excel" | "pdf") {
    setExporting(format)
    try {
      const rows = toExportRows(filteredNever)
      if (format === "excel") await exportToExcel(rows)
      else await exportToPdf(rows)
    } finally {
      setExporting(null)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.toLowerCase().trim()
    return users.filter((u) => {
      const matchQuery =
        !q ||
        u.employee.fullName.toLowerCase().includes(q) ||
        u.employee.nip.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q)
      const matchRole = filterRole === "ALL" || u.roles.includes(filterRole)
      return matchQuery && matchRole
    })
  }, [users, query, filterRole])

  const filteredNever = useMemo(() => {
    const q = queryNever.toLowerCase().trim()
    if (!q) return neverLoggedIn
    return neverLoggedIn.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.nip.toLowerCase().includes(q) ||
        (e.positionTitle ?? "").toLowerCase().includes(q)
    )
  }, [neverLoggedIn, queryNever])

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("registered")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "registered"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Pengguna Terdaftar
          <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
            tab === "registered" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
          }`}>
            {users.length}
          </span>
        </button>
        <button
          onClick={() => setTab("never")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === "never"
              ? "border-amber-500 text-amber-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Belum Pernah Login
          {neverLoggedIn.length > 0 && (
            <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
              tab === "never" ? "bg-amber-100 text-amber-700" : "bg-amber-50 text-amber-600"
            }`}>
              {neverLoggedIn.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Tab: Pengguna Terdaftar ── */}
      {tab === "registered" && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-5">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                type="text"
                placeholder="Cari nama, NIP, atau username…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {query && (
                <button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {["ALL", ...ALL_ROLES].map((role) => (
                <button
                  key={role}
                  onClick={() => setFilterRole(role)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    filterRole === role
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {role === "ALL" ? "Semua" : ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-400 mb-3">{filteredUsers.length} dari {users.length} pengguna</p>

          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {filteredUsers.length === 0 ? (
              <div className="py-12 text-center">
                <svg className="mx-auto mb-3 text-gray-300" xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className="text-sm text-gray-400">Tidak ada pengguna yang cocok</p>
                <button onClick={() => { setQuery(""); setFilterRole("ALL") }} className="mt-2 text-xs text-blue-600 hover:underline">
                  Reset pencarian
                </button>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isTargetSuperadmin = user.roles.includes("SUPERADMIN")
                const canEdit = isSuperadmin || !isTargetSuperadmin
                return (
                  <div key={user.id} className="px-5 py-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{user.employee.fullName}</p>
                      <p className="text-xs text-gray-500">
                        {user.employee.nip} · {user.employee.positionTitle ?? "—"} · {user.employee.unit?.name ?? "—"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        Username:{" "}
                        {user.username
                          ? <span className="font-mono text-gray-600">{user.username}</span>
                          : <span className="text-gray-300">—</span>}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {user.roles.map((r) => (
                          <span key={r} className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                            {ROLE_LABELS[r] ?? r}
                          </span>
                        ))}
                      </div>
                    </div>
                    {canEdit ? (
                      <UserRolesForm
                        userId={user.id}
                        currentRoles={user.roles}
                        allRoles={isSuperadmin ? ALL_ROLES : ALL_ROLES.filter((r) => r !== "SUPERADMIN")}
                      />
                    ) : (
                      <span className="text-xs text-gray-400 mt-1">Hanya SUPERADMIN yang bisa mengubah</span>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* ── Tab: Belum Pernah Login ── */}
      {tab === "never" && (
        <>
          <div className="relative mb-5">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Cari nama, NIP, atau jabatan…"
              value={queryNever}
              onChange={(e) => setQueryNever(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {queryNever && (
              <button onClick={() => setQueryNever("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>

          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <p className="text-xs text-gray-400">{filteredNever.length} dari {neverLoggedIn.length} pegawai</p>
            {neverLoggedIn.length > 0 && (
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                Belum pernah login ke CutiSmart
              </span>
            )}
            {filteredNever.length > 0 && (
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => handleExport("excel")}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  {exporting === "excel" ? "Mengekspor…" : "Export Excel"}
                </button>
                <button
                  onClick={() => handleExport("pdf")}
                  disabled={exporting !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  {exporting === "pdf" ? "Mengekspor…" : "Export PDF"}
                </button>
              </div>
            )}
          </div>

          {neverLoggedIn.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-xl border border-gray-200">
              <svg className="mx-auto mb-3 text-green-400" xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <p className="text-sm font-medium text-gray-700">Semua pegawai sudah pernah login</p>
              <p className="text-xs text-gray-400 mt-1">Tidak ada pegawai aktif yang belum menggunakan CutiSmart</p>
            </div>
          ) : filteredNever.length === 0 ? (
            <div className="py-12 text-center bg-white rounded-xl border border-gray-200">
              <p className="text-sm text-gray-400">Tidak ada hasil yang cocok</p>
              <button onClick={() => setQueryNever("")} className="mt-2 text-xs text-blue-600 hover:underline">Reset pencarian</button>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama / NIP</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Kerja</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Jabatan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredNever.map((emp) => (
                    <tr key={emp.id} className="hover:bg-amber-50/40 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{emp.fullName}</p>
                        <p className="text-xs text-gray-400 mt-0.5 font-mono">{emp.nip}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{emp.unit?.name ?? <span className="text-gray-300 italic">—</span>}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{emp.positionTitle ?? <span className="text-gray-300 italic">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          emp.employeeType === "PNS" ? "bg-blue-50 text-blue-700" :
                          emp.employeeType === "PPPK" ? "bg-green-50 text-green-700" :
                          emp.employeeType === "PPPK_PARUH_WAKTU" ? "bg-teal-50 text-teal-700" :
                          "bg-amber-50 text-amber-700"
                        }`}>
                          {EMP_TYPE_LABELS[emp.employeeType] ?? emp.employeeType}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  )
}
