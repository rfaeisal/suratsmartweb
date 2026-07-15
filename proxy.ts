import { auth } from "@/auth"
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export default auth(async (req) => {
  const { pathname } = req.nextUrl

  const adminRoles = ["ADMIN_KEPEGAWAIAN", "SUPERADMIN"]

  // Lindungi semua halaman admin & pegawai — redirect ke login jika belum autentikasi
  if (pathname.startsWith("/admin") || pathname.startsWith("/pegawai") || pathname.startsWith("/dashboard")) {
    if (!req.auth) {
      const loginUrl = new URL("/login", req.url)
      loginUrl.searchParams.set("callbackUrl", req.url)
      return NextResponse.redirect(loginUrl)
    }

    // Pastikan hanya role admin yang bisa akses halaman /admin
    if (pathname.startsWith("/admin") && !req.auth.user?.roles?.some((r) => adminRoles.includes(r))) {
      return NextResponse.redirect(new URL("/pegawai/dashboard", req.url))
    }
  }

  // Redirect user yang sudah login dari halaman login ke dashboard sesuai role
  if (pathname === "/login" && req.auth) {
    const roles = req.auth.user?.roles ?? []
    if (roles.includes("ADMIN_KEPEGAWAIAN") || roles.includes("SUPERADMIN")) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url))
    }
    return NextResponse.redirect(new URL("/pegawai/dashboard", req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/admin/:path*", "/pegawai/:path*", "/dashboard/:path*", "/login"],
}
