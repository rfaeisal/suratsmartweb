# CLAUDE.md — Panduan Kerja untuk Claude Code (Project: cutismart-web)

Ini adalah project **backend + admin panel + web UI pengajuan/approval** dari sistem **CutiSmart**. Baca seluruh file di folder ini sebelum mulai coding:

1. `01-PRD.md` — requirement produk lengkap
2. `02-ARSITEKTUR-DAN-DATABASE.md` — stack teknis & skema database (Prisma)
3. `03-API-SPEC.md` — kontrak API yang harus diimplementasikan (dipakai juga oleh app Flutter di repo terpisah `cutismart-mobile`)
4. `04-INTEGRASI-SISTEM-LAMA.md` — kontrak API ke aplikasi kepegawaian lama (PHP)
5. `05-ALUR-KERJA-APPROVAL-DAN-CUTI.md` — detail business logic approval berjenjang & aturan cuti

## Stack Teknis (ikuti kecuali ada kendala teknis nyata)
- Next.js 16 (App Router) + TypeScript
- PostgreSQL + Prisma 7 (dengan `@prisma/adapter-pg`)
- NextAuth.js (Credentials Provider custom → validasi ke SSO sistem lama)
- Tailwind CSS + shadcn/ui
- Zod untuk validasi input
- `@react-pdf/renderer` atau Puppeteer untuk generate SK PDF
- Firebase Admin SDK untuk push notification (FCM)
- Docker Compose untuk deployment on-premise

## Prinsip Implementasi
- **Jangan hard-code** aturan jenis cuti per kategori pegawai (PNS/PPPK/BLUD) — semua harus lewat master data (`LeaveType`, `LeaveQuota`) yang bisa diubah admin dari admin panel.
- Alur approval **dinamis per pengajuan** — jangan asumsikan selalu 3 tahap tetap; admin kepegawaian bisa menambah/mengurangi/mengganti approver per kasus.
- **Konfirmasi delegasi bersifat wajib dan memblokir**: admin kepegawaian tidak boleh bisa menetapkan alur approval (`approval-flow`) sebelum `delegateConfirmationStatus = CONFIRMED`. Pastikan validasi ini ada di level API, bukan cuma di UI.
- **Sesi login (khususnya mobile)**: satu akun hanya boleh punya satu `UserSession` aktif. Validasi status sesi (`ACTIVE`/`REVOKED`) di setiap request terautentikasi — bukan hanya validasi signature JWT — supaya force sign-out oleh admin langsung berefek. Sesi tidak boleh kedaluwarsa otomatis kecuali di-revoke.
- Semua endpoint yang dipakai bersama web & mobile harus konsisten dengan `03-API-SPEC.md` — jika ada perubahan kontrak, update file tersebut juga.
- Integrasi ke sistem lama harus **idempotent** dan punya mekanisme retry (lihat `IntegrationLog`).
- Setiap aksi penting (submit, konfirmasi delegasi, approval, kirim ke legacy) wajib tercatat di `AuditLog`.
- Autentikasi selalu lewat SSO sistem lama — jangan buat tabel password sendiri.

## Status Fase Pengembangan
1. ✅ **Fase 0 — Setup**: init Next.js project, setup Prisma + PostgreSQL, docker-compose dasar, struktur folder.
2. ✅ **Fase 1 — Auth & Master Data**: implementasi SSO login (mock → real legacy aktif), manajemen `UserSession` (single active session, refresh token, endpoint force-revoke untuk admin), CRUD master data (unit, jabatan, jenis cuti, kuota), manajemen user & role.
3. ✅ **Fase 2 — Pengajuan Cuti & Konfirmasi Delegasi**: form pengajuan, upload lampiran (2-step flow), validasi kuota, konfirmasi delegasi, alur kepala ruangan (`PENDING_KEPALA_RUANGAN`).
4. ✅ **Fase 3 — Approval Berjenjang**: penetapan alur oleh admin (hanya untuk pengajuan `PENDING_ADMIN_REVIEW`), inbox approval, aksi approve/reject/return, notifikasi FCM.
5. ✅ **Fase 4 — SK & Integrasi Legacy**: generate PDF SK (+ fitur cetak ulang/download), kirim ke sistem lama dengan HMAC signing, IntegrationLog.
6. ✅ **Fase 5 — Monitoring & Reporting**: dashboard admin, rekap cuti & export, audit log viewer, session management panel, settings panel, sinkronisasi pegawai.
7. ⚠️ **Fase 6 — Hardening**: rate limiter sudah ada (in-memory, single-instance). Sisanya (HTTPS/reverse proxy config, backup strategy) perlu dikonfirmasi.

## Environment Variables (draft, sesuaikan saat implementasi)
```
DATABASE_URL=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
LEGACY_API_BASE_URL=
LEGACY_API_KEY=
LEGACY_API_HMAC_SECRET=
FIREBASE_SERVICE_ACCOUNT_JSON=
FILE_STORAGE_PATH=
```

## Cara Menjalankan
```bash
pnpm install
pnpm prisma migrate dev
pnpm dev
```

## Catatan untuk Claude Code
- Jika ada ambiguitas requirement yang tidak terjawab di dokumen ini, tandai sebagai `// TODO: konfirmasi ke bagian kepegawaian` di kode, jangan menebak aturan bisnis (khususnya soal kuota/jenis cuti PNS/PPPK/BLUD — lihat catatan di `05-ALUR-KERJA-APPROVAL-DAN-CUTI.md` bagian 4).
- Selalu jaga agar `03-API-SPEC.md` tetap jadi sumber kebenaran kontrak API — beri tahu pengguna bila perlu mengubahnya karena repo `cutismart-mobile` bergantung padanya.
