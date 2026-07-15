import Link from "next/link"

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-gray-200 p-10 max-w-sm w-full text-center">
        <div className="text-4xl mb-4 text-red-400">⛔</div>
        <h1 className="text-lg font-semibold text-gray-900 mb-2">Akses Ditolak</h1>
        <p className="text-sm text-gray-500 mb-6">
          Anda tidak memiliki izin untuk mengakses halaman ini.
        </p>
        <Link
          href="/"
          className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Kembali ke Dashboard
        </Link>
      </div>
    </div>
  )
}
