# CutiSmart — Web (Next.js) — Product Requirements Document

## 1. Latar Belakang
Instansi memiliki aplikasi kepegawaian lama (existing, berbasis PHP) yang menyimpan profil pegawai, termasuk riwayat cuti. Saat ini proses pengajuan dan persetujuan cuti belum terdigitalisasi dengan baik secara berjenjang. **CutiSmart** dibangun sebagai sistem baru yang menangani seluruh proses pengajuan cuti, approval berjenjang, hingga penetapan cuti (penerbitan SK), lalu mengirim hasil cuti yang disetujui ke aplikasi lama agar tercatat di profil pegawai.

Repo ini (`cutismart-web`) adalah **backend + admin panel** berbasis Next.js. Repo terpisah `cutismart-mobile` (Flutter, Android) adalah aplikasi untuk pengajuan, approval, dan monitoring dari sisi mobile. Web app Next.js juga tetap menyediakan UI untuk pengajuan & approval (tidak hanya admin panel), sehingga pengguna bisa memakai web maupun mobile.

## 2. Tujuan
1. Menyediakan alur pengajuan cuti digital untuk seluruh pegawai (PNS, PPPK, BLUD).
2. Menyediakan approval berjenjang yang **fleksibel/dinamis** — level dan urutan approval bisa diatur oleh admin kepegawaian per pengajuan.
3. Mendukung penunjukan pegawai pengganti (delegasi) selama pegawai cuti.
4. Menerbitkan dokumen Surat Keputusan (SK) cuti otomatis (PDF) setelah pengajuan disetujui final.
5. Mengirim data cuti yang telah disetujui ke aplikasi kepegawaian lama melalui API baru, agar masuk ke profil pegawai.
6. Menyediakan admin panel untuk mengelola master data (jenis cuti, kuota, unit kerja, alur approval, pegawai) dan monitoring seluruh proses.

## 3. Skala & Lingkup
- Single instansi (bukan multi-tenant).
- Perkiraan 500–2000 pegawai.
- Kategori pegawai: **PNS**, **PPPK**, **BLUD** — masing-masing punya aturan jenis cuti & kuota berbeda (dikelola sebagai master data, bukan hard-code).
- Hosting: on-premise (server milik instansi).
- Autentikasi: SSO menggunakan akun aplikasi kepegawaian lama (bukan akun baru).

## 4. Aktor / Role
| Role | Deskripsi |
|---|---|
| Pegawai | Mengajukan cuti, memilih pengganti/delegasi, memantau status pengajuan sendiri |
| Atasan Langsung | Approval tahap 1 |
| Kepala Bagian/Bidang | Approval tahap 2 |
| Wakil Direktur | Approval tahap 3 (penetapan) |
| Admin Kepegawaian | Mengatur *siapa saja* yang menjadi approver untuk suatu pengajuan (alur approval per-pengajuan bisa disesuaikan), mengelola master data, memonitor seluruh proses, memicu pengiriman data ke sistem lama |
| Superadmin | Mengelola user, role, konfigurasi sistem, integrasi |

> Catatan penting: Urutan default approval adalah **Atasan Langsung → Kepala Bagian/Bidang → Wakil Direktur**, namun **admin kepegawaian dapat menyesuaikan** alur (menambah/mengurangi tahap, mengganti approver) setelah pengajuan masuk, sebelum alur approval berjalan. Lihat `06-ALUR-KERJA-APPROVAL.md`.

## 5. Fitur Utama

### 5.1 Pengajuan Cuti
- Pegawai memilih jenis cuti (jenis tersedia mengikuti kategori kepegawaiannya: PNS/PPPK/BLUD).
- Sistem menampilkan sisa kuota cuti yang relevan.
- Pegawai mengisi tanggal mulai/selesai, alasan, dan **memilih pegawai pengganti (delegasi)** dari daftar pegawai di unit yang sama.
- Upload dokumen pendukung bersifat **opsional** (misal surat dokter untuk cuti sakit), kecuali admin mengatur wajib untuk jenis cuti tertentu di kemudian hari (desain harus mendukung konfigurasi wajib/opsional per jenis cuti).
- Setelah submit, **pegawai pengganti harus konfirmasi kesediaan** terlebih dahulu (lihat 5.1a) sebelum admin kepegawaian bisa memproses pengajuan.

### 5.1a Konfirmasi Delegasi/Pengganti
- Pegawai yang ditunjuk sebagai pengganti menerima notifikasi dan harus memutuskan: **Konfirmasi** atau **Tolak**.
- Jika dikonfirmasi → pengajuan baru masuk ke antrean admin kepegawaian untuk ditetapkan alur approvalnya.
- Jika ditolak → pengajuan tidak diteruskan ke admin; pegawai pengaju perlu memilih pengganti lain dan mengajukan ulang.
- Ini adalah **gerbang wajib** sebelum alur approval berjenjang dimulai (bukan bagian dari approval berjenjang itu sendiri).

### 5.2 Approval Berjenjang
- Setiap tahap approver dapat: Setujui, Tolak, atau Kembalikan (revisi) dengan catatan. Jika ditolak, proses selesai (status ditolak). Jika dikembalikan, pegawai merevisi dan submit ulang — tidak otomatis lanjut ke tahap berikutnya.
- Seluruh tahap approval (Atasan Langsung, Kepala Bagian/Bidang, Wakil Direktur) dapat dilakukan **baik dari web maupun dari app Flutter** — kedua klien memakai API dan data yang sama.
- Notifikasi push dikirim ke approver berikutnya setiap kali status berubah.

### 5.3 Penetapan Cuti & SK
- Setelah semua tahap approval selesai (disetujui), sistem otomatis generate **PDF Surat Keputusan (SK) Cuti**.
- SK memuat: identitas pegawai, jenis cuti, tanggal, pejabat penetap, nomor SK (auto-generate sesuai format nomor surat instansi — dikonfigurasi admin).

### 5.4 Integrasi ke Sistem Lama
- Setelah SK terbit, sistem mengirim data cuti (via API baru yang dibangun di sistem lama) agar tercatat pada profil pegawai di aplikasi kepegawaian lama.
- Proses pengiriman harus **idempotent**, punya status kirim (pending/success/failed) dan bisa di-retry manual oleh admin.

### 5.5 Admin Panel
- Manajemen master data: jenis cuti per kategori pegawai, kuota cuti, unit kerja, jabatan/hierarki approver, format nomor SK.
- Manajemen alur approval per pengajuan (menetapkan approver di setiap tahap) — hanya bisa dilakukan setelah pegawai pengganti mengonfirmasi kesediaannya.
- **Cetak SK Cuti**: mencetak/mengunduh ulang PDF SK kapan saja dari daftar pengajuan.
- **Rekap Cuti Periode Tertentu**: melihat rekapan pengajuan & total hari cuti dengan filter rentang tanggal, unit, kategori pegawai, dan/atau jenis cuti.
- **Kirim Ulang ke Sistem Lama**: mengirim ulang data cuti secara manual bila pengiriman sebelumnya gagal (status gagal kirim), tanpa perlu pegawai mengajukan ulang.
- **Manajemen Sesi Login (Force Sign-out)**: melihat sesi login aktif tiap pegawai di mobile (device apa, sejak kapan) dan memaksa sign-out bila diperlukan (mis. pegawai kehilangan HP, atau perlu pindah device tapi sesi lama masih terkunci).
- Monitoring dashboard: jumlah pengajuan per status, per unit, per jenis cuti, log pengiriman ke sistem lama.
- Manajemen user & role (khususnya mapping role approval ke akun SSO).

### 5.6 Monitoring
- Pegawai, approver, dan admin dapat memantau status pengajuan secara real-time (web maupun mobile).
- Riwayat/log setiap perubahan status (audit trail).

## 6. Kebutuhan Non-Fungsional
- Autentikasi via SSO ke sistem lama (lihat `05-INTEGRASI-SISTEM-LAMA.md`).
- **Sesi login mobile persisten**: pegawai tidak perlu login ulang setiap membuka app (auto-login via token tersimpan); sesi tidak kedaluwarsa otomatis, hanya berakhir jika di-sign out sendiri atau dipaksa oleh admin kepegawaian.
- **Satu sesi aktif per akun** (khususnya untuk mobile) untuk mencegah satu akun terbuka di banyak device sekaligus — login baru ditolak selama sesi lama masih aktif, kecuali sesi lama di-sign out lebih dulu (oleh pegawai sendiri atau admin).
- Database PostgreSQL.
- Deploy on-premise (perhatikan: perlu reverse proxy/HTTPS, backup DB berkala, koneksi jaringan internal ke server sistem lama).
- Push notification (FCM) — tidak ada kebutuhan email.
- Tidak perlu dukungan offline (mobile selalu online).
- Audit log wajib untuk semua aksi approval dan perubahan data cuti.

## 7. Di Luar Lingkup (Out of Scope) — Fase Awal
- Multi-instansi/tenant.
- Cuti bersama nasional otomatis dari kalender pemerintah (bisa jadi fase berikut).
- Payroll/penggajian.
