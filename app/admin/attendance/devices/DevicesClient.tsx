"use client"

import { useState } from "react"

interface Room {
  id: string
  nama: string
  workUnit: { id: string; name: string }
}

interface Device {
  id: string
  deviceId: string
  nama: string | null
  status: string
  roomId: string | null
  room: (Room & { workUnit: { id: string; name: string } }) | null
  ibeaconUuid: string
  ibeaconMajor: number
  ibeaconMinor: number
  createdAt: string
}

interface WorkUnit { id: string; name: string }

interface Props {
  initial: Device[]
  rooms: Room[]
  units: WorkUnit[]
}

const inputClass = "px-3 py-1.5 border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"

export default function DevicesClient({ initial, rooms: initialRooms, units }: Props) {
  const [rooms, setRooms] = useState<Room[]>(initialRooms)
  const [newRoomNama, setNewRoomNama] = useState("")
  const [newRoomKode, setNewRoomKode] = useState("")
  const [newRoomUnit, setNewRoomUnit] = useState("")
  const [addingRoom, setAddingRoom] = useState(false)
  const [addRoomError, setAddRoomError] = useState("")
  const [activeTab, setActiveTab] = useState<"devices" | "rooms">("devices")
  const [devices, setDevices] = useState<Device[]>(initial)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState("")
  const [newSecret, setNewSecret] = useState<{ deviceId: string; secret: string } | null>(null)

  const [form, setForm] = useState({ nama: "", roomId: "", ibeaconUuid: "", ibeaconMajor: "", ibeaconMinor: "" })

  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ nama: "", status: "", roomId: "" })
  const [saving, setSaving] = useState(false)
  const [editError, setEditError] = useState("")

  const [enrollLoading, setEnrollLoading] = useState<string | null>(null)
  const [enrollTicket, setEnrollTicket] = useState<{
    deviceId: string
    deviceLabel: string
    code: string
    expiresAt: string
  } | null>(null)
  const [enrollError, setEnrollError] = useState("")

  async function handleEnroll(d: Device) {
    setEnrollError("")
    setEnrollLoading(d.id)
    try {
      const res = await fetch(`/api/v1/devices/${d.id}/enroll-ticket`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { setEnrollError(data.error?.message ?? "Gagal generate kode"); return }
      setEnrollTicket({
        deviceId: d.deviceId,
        deviceLabel: d.nama ?? d.deviceId,
        code: data.enroll_code,
        expiresAt: data.expires_at,
      })
    } catch { setEnrollError("Koneksi gagal") }
    finally { setEnrollLoading(null) }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError("")
    if (!form.nama.trim()) { setAddError("Nama perangkat wajib diisi"); return }
    setAdding(true)
    try {
      const body: Record<string, unknown> = { nama: form.nama.trim() }
      if (form.roomId) body.room_id = form.roomId
      if (form.ibeaconUuid) body.ibeacon_uuid = form.ibeaconUuid
      if (form.ibeaconMajor) body.ibeacon_major = Number(form.ibeaconMajor)
      if (form.ibeaconMinor) body.ibeacon_minor = Number(form.ibeaconMinor)
      const res = await fetch("/api/v1/devices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error?.message ?? "Gagal menyimpan"); return }
      setNewSecret({ deviceId: data.device_id, secret: data.secret })
      const newDevice: Device = {
        id: data.id,
        deviceId: data.device_id,
        nama: data.nama ?? null,
        status: data.status,
        roomId: data.room_id ?? null,
        room: rooms.find((r) => r.id === data.room_id) ?? null,
        ibeaconUuid: data.ibeacon_uuid ?? "",
        ibeaconMajor: data.ibeacon_major ?? 0,
        ibeaconMinor: data.ibeacon_minor ?? 0,
        createdAt: data.createdAt,
      }
      setDevices((prev) => [newDevice, ...prev])
      setForm({ nama: "", roomId: "", ibeaconUuid: "", ibeaconMajor: "", ibeaconMinor: "" })
    } catch { setAddError("Koneksi gagal") }
    finally { setAdding(false) }
  }

  function startEdit(d: Device) {
    setEditId(d.id)
    setEditForm({ nama: d.nama ?? "", status: d.status, roomId: d.roomId ?? "" })
    setEditError("")
  }

  async function handleSave(id: string) {
    setEditError("")
    setSaving(true)
    try {
      const body: Record<string, unknown> = { nama: editForm.nama, status: editForm.status }
      if (editForm.roomId) body.room_id = editForm.roomId
      const res = await fetch(`/api/v1/devices/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) { setEditError(data.error?.message ?? "Gagal menyimpan"); return }
      setDevices((prev) => prev.map((d) => d.id === id ? { ...d, ...data, room: rooms.find((r) => r.id === data.roomId) ?? null } : d))
      setEditId(null)
    } catch { setEditError("Koneksi gagal") }
    finally { setSaving(false) }
  }

  async function handleAddRoom(e: React.FormEvent) {
    e.preventDefault()
    setAddRoomError("")
    if (!newRoomNama.trim() || !newRoomKode.trim() || !newRoomUnit) { setAddRoomError("Nama, kode, dan unit wajib diisi"); return }
    setAddingRoom(true)
    try {
      const res = await fetch("/api/v1/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama: newRoomNama.trim(), kode: newRoomKode.trim().toUpperCase(), work_unit_id: newRoomUnit }),
      })
      const data = await res.json()
      if (!res.ok) { setAddRoomError(data.error?.message ?? "Gagal menyimpan"); return }
      const unit = units.find((u) => u.id === newRoomUnit)!
      setRooms((prev) => [...prev, { id: data.id, nama: data.nama, workUnit: unit }].sort((a, b) => a.nama.localeCompare(b.nama)))
      setNewRoomNama("")
      setNewRoomKode("")
      setNewRoomUnit("")
    } catch { setAddRoomError("Koneksi gagal") }
    finally { setAddingRoom(false) }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-slate-700">
        {(["devices", "rooms"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"}`}
          >
            {tab === "devices" ? "Perangkat (ESP32)" : "Ruangan"}
          </button>
        ))}
      </div>

      {activeTab === "rooms" && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Tambah Ruangan Baru</h3>
            <form onSubmit={handleAddRoom} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-36">
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Nama Ruangan <span className="text-red-500">*</span></label>
                <input value={newRoomNama} onChange={(e) => setNewRoomNama(e.target.value)} placeholder="misal: IGD" className={`${inputClass} w-full`} />
              </div>
              <div className="w-28">
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Kode <span className="text-red-500">*</span></label>
                <input value={newRoomKode} onChange={(e) => setNewRoomKode(e.target.value)} placeholder="IGD-01" className={`${inputClass} w-full`} />
              </div>
              <div className="flex-1 min-w-48">
                <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Unit Kerja <span className="text-red-500">*</span></label>
                <select value={newRoomUnit} onChange={(e) => setNewRoomUnit(e.target.value)} className={`${inputClass} w-full`}>
                  <option value="">— Pilih Unit —</option>
                  {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={addingRoom} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
                {addingRoom ? "Menyimpan…" : "Tambah"}
              </button>
              {addRoomError && <p className="text-xs text-red-600 dark:text-red-400 w-full">{addRoomError}</p>}
            </form>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
            {rooms.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">Belum ada ruangan.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Nama Ruangan</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Unit Kerja</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {rooms.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">{r.nama}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-slate-400">{r.workUnit.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {activeTab === "devices" && (<>
      {enrollTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setEnrollTicket(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-6 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">Kode Enroll untuk {enrollTicket.deviceLabel}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
              Masukkan kode di bawah pada portal captive WiFi perangkat ESP32 (SSID: <code>CutiSmart-Setup</code>).
              Kode berlaku sampai {new Date(enrollTicket.expiresAt).toLocaleString("id-ID")}.
            </p>
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
              <div className="text-3xl font-mono font-bold tracking-widest text-blue-700 dark:text-blue-300 select-all">
                {enrollTicket.code}
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-3">
              Device ID: <code className="font-mono">{enrollTicket.deviceId}</code>
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => navigator.clipboard.writeText(enrollTicket.code)}
                className="px-3 py-1.5 text-xs border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
              >Salin kode</button>
              <button
                onClick={() => setEnrollTicket(null)}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >Tutup</button>
            </div>
          </div>
        </div>
      )}
      {enrollError && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
          {enrollError}
        </div>
      )}
      {newSecret && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-xl p-5">
          <p className="text-sm font-semibold text-yellow-800 mb-2">Perangkat baru berhasil dibuat. Salin Device Secret sekarang — tidak akan ditampilkan lagi!</p>
          <div className="font-mono text-xs bg-white border border-yellow-200 rounded p-3 mb-1"><span className="text-gray-500">Device ID: </span><strong>{newSecret.deviceId}</strong></div>
          <div className="font-mono text-xs bg-white border border-yellow-200 rounded p-3"><span className="text-gray-500">Secret: </span><strong className="break-all">{newSecret.secret}</strong></div>
          <button onClick={() => setNewSecret(null)} className="mt-3 text-xs text-yellow-700 underline hover:text-yellow-900">Tutup pesan ini</button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-4">Daftarkan Perangkat Baru</h3>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Nama/Label <span className="text-red-500">*</span></label>
            <input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} placeholder="misal: ESP32-IGD-01" className={`${inputClass} w-full`} />
          </div>
          <div className="flex-1 min-w-40">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Ruangan</label>
            <select value={form.roomId} onChange={(e) => setForm({ ...form, roomId: e.target.value })} className={`${inputClass} w-full`}>
              <option value="">— Belum ditentukan —</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.workUnit.name})</option>)}
            </select>
          </div>
          <div className="w-48">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">iBeacon UUID</label>
            <input value={form.ibeaconUuid} onChange={(e) => setForm({ ...form, ibeaconUuid: e.target.value })} placeholder="xxxxxxxx-xxxx-..." className={`${inputClass} w-full`} />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Major</label>
            <input type="number" value={form.ibeaconMajor} onChange={(e) => setForm({ ...form, ibeaconMajor: e.target.value })} className={`${inputClass} w-full`} />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">Minor</label>
            <input type="number" value={form.ibeaconMinor} onChange={(e) => setForm({ ...form, ibeaconMinor: e.target.value })} className={`${inputClass} w-full`} />
          </div>
          <button type="submit" disabled={adding} className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {adding ? "Menyimpan…" : "Daftarkan"}
          </button>
          {addError && <p className="text-xs text-red-600 dark:text-red-400 w-full">{addError}</p>}
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
        {devices.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400 dark:text-slate-500">Belum ada perangkat. Daftarkan di atas.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Device ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Label</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Ruangan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {devices.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-slate-400">{d.deviceId}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-slate-100">
                    {editId === d.id
                      ? <input value={editForm.nama} onChange={(e) => setEditForm({ ...editForm, nama: e.target.value })} className={inputClass} autoFocus />
                      : (d.nama ?? <span className="italic text-gray-400 dark:text-slate-500">—</span>)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-slate-400">
                    {editId === d.id ? (
                      <select value={editForm.roomId} onChange={(e) => setEditForm({ ...editForm, roomId: e.target.value })} className={inputClass}>
                        <option value="">— Belum ditentukan —</option>
                        {rooms.map((r) => <option key={r.id} value={r.id}>{r.nama} ({r.workUnit.name})</option>)}
                      </select>
                    ) : (
                      d.room ? `${d.room.nama} — ${d.room.workUnit.name}` : <span className="italic text-gray-400 dark:text-slate-500">Belum ditentukan</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editId === d.id ? (
                      <select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className={inputClass}>
                        <option value="ACTIVE">Aktif</option>
                        <option value="INACTIVE">Nonaktif</option>
                      </select>
                    ) : (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${d.status === "ACTIVE" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400"}`}>
                        {d.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {editId === d.id ? (
                      <div className="flex gap-2 items-center justify-end">
                        {editError && <span className="text-xs text-red-600 dark:text-red-400">{editError}</span>}
                        <button onClick={() => handleSave(d.id)} disabled={saving} className="px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
                          {saving ? "…" : "Simpan"}
                        </button>
                        <button onClick={() => setEditId(null)} className="px-3 py-1 text-xs border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">Batal</button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEnroll(d)}
                          disabled={enrollLoading === d.id}
                          className="px-3 py-1 text-xs border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-50"
                        >{enrollLoading === d.id ? "…" : "Enroll"}</button>
                        <button onClick={() => startEdit(d)} className="px-3 py-1 text-xs border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700">Edit</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>)}
    </div>
  )
}
