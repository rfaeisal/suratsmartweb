"use client"

import { useState } from "react"
import { Tooltip } from "@/components/Tooltip"
import type { EmployeeType } from "@prisma/client"

interface LeaveType {
  id: string
  code: string
  name: string
  applicableTo: EmployeeType[]
  requiresAttachment: boolean
  defaultQuotaDays: number | null
  isActive: boolean
}

interface Props {
  leaveTypes: LeaveType[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  toggleAction: (id: string, isActive: boolean) => any
}

export default function LeaveTypesTable({ leaveTypes, toggleAction }: Props) {
  const [search, setSearch] = useState("")

  const filtered = !search
    ? leaveTypes
    : leaveTypes.filter((lt) => {
        const q = search.toLowerCase()
        return lt.name.toLowerCase().includes(q) || lt.code.toLowerCase().includes(q)
      })

  const inputClass =
    "px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {leaveTypes.length > 0 && (
        <div className="px-4 py-3 border-b border-gray-200">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari kode atau nama jenis cuti…"
            className={`${inputClass} w-64`}
          />
        </div>
      )}

      <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left px-4 py-3 font-medium text-gray-700">Kode</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Nama</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Berlaku untuk</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Kuota (hari)</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Lampiran</th>
            <th className="text-left px-4 py-3 font-medium text-gray-700">Status</th>
            <th className="text-right px-4 py-3 font-medium text-gray-700">Aksi</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                {search
                  ? `Tidak ada jenis cuti yang cocok dengan "${search}".`
                  : "Belum ada jenis cuti. Tambahkan di atas."}
              </td>
            </tr>
          ) : (
            filtered.map((lt) => (
              <tr key={lt.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-600">{lt.code}</td>
                <td className="px-4 py-3 text-gray-900">{lt.name}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {lt.applicableTo.map((et) => (
                      <span
                        key={et}
                        className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700"
                      >
                        {et}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lt.defaultQuotaDays ?? <span className="text-gray-400">–</span>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {lt.requiresAttachment ? "Wajib" : "Opsional"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                      lt.isActive ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {lt.isActive ? "Aktif" : "Nonaktif"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <form action={toggleAction.bind(null, lt.id, !lt.isActive)}>
                    <Tooltip label={lt.isActive ? "Nonaktifkan" : "Aktifkan"}>
                      <button
                        type="submit"
                        className={`p-1.5 rounded-lg transition-colors ${
                          lt.isActive
                            ? "text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                            : "text-green-500 hover:text-green-700 hover:bg-green-50"
                        }`}
                      >
                        {lt.isActive ? (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                          </svg>
                        )}
                      </button>
                    </Tooltip>
                  </form>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      </div>
    </div>
  )
}
