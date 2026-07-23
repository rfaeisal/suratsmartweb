# CutiSmart — Alur Kerja Approval Berjenjang & Aturan Cuti

## 1. Alur Pengajuan → Penetapan (End-to-End)

```
1. Pegawai submit pengajuan cuti (+ pilih delegasi, opsional lampiran, opsional emergencyPhone)
        ↓  status: SUBMITTED
2. Pegawai pengganti (delegasi) konfirmasi kesediaan
        - DECLINED  → status: DELEGATE_DECLINED (pegawai pilih pengganti lain & submit ulang)
        - CONFIRMED + unit punya kepalaRuanganId → status: PENDING_KEPALA_RUANGAN
                                                    (step approval kepala ruangan dibuat otomatis)
        - CONFIRMED + unit TIDAK punya kepalaRuanganId → status: PENDING_ADMIN_REVIEW
        ↓ (lanjut dari CONFIRMED)
2a. [Opsional — jika ada Kepala Ruangan] Kepala Ruangan memutuskan
        - APPROVED  → status: PENDING_ADMIN_REVIEW, masuk antrean admin kepegawaian
        - REJECTED/RETURNED → status berubah sesuai, notifikasi ke pegawai
        ↓ (lanjut hanya jika PENDING_ADMIN_REVIEW)
3. Admin Kepegawaian menetapkan/menyesuaikan alur approval
   (default template: Atasan Langsung → Kepala Bagian/Bidang → Wakil Direktur,
    admin bisa ubah jumlah tahap & siapa approvernya;
    stepOrder dihitung otomatis di belakang step kepala ruangan jika ada)
        ↓  status: IN_APPROVAL, notifikasi ke approver tahap 1
4. Approver tahap 1 memutuskan: APPROVED / REJECTED / RETURNED
        - APPROVED  → lanjut ke tahap 2, notifikasi approver tahap 2
        - REJECTED  → status: REJECTED (selesai, notifikasi ke pegawai)
        - RETURNED  → status: RETURNED (pegawai bisa revisi & submit ulang — TIDAK otomatis lanjut ke tahap berikutnya)
5. ... berulang untuk tiap tahap (semua tahap bisa diproses dari web maupun app Flutter) ...
6. Tahap terakhir APPROVED → status: APPROVED
        ↓
7. Sistem generate PDF SK Cuti otomatis (nomor SK sesuai format instansi)
        ↓
8. Sistem kirim data ke aplikasi lama via POST /api/leave/approved
        - sukses → status: SENT_TO_LEGACY (selesai)
        - gagal  → status: SEND_FAILED (admin kepegawaian bisa kirim ulang/retry manual dari admin panel)
```

## 2. Penetapan Alur Approval oleh Admin Kepegawaian
- Pengajuan masuk ke antrean admin saat berstatus `PENDING_ADMIN_REVIEW` (setelah delegasi dikonfirmasi dan — jika unit punya kepala ruangan — setelah kepala ruangan menyetujui).
- Admin dapat memakai **template default** (3 tahap sesuai struktur organisasi pegawai tsb) atau menyusun manual (tambah/kurangi tahap, ganti approver individual — misal saat atasan langsung sedang cuti juga).
- Request body cukup berisi `steps: [{ employeeId, roleLabel }]` — `stepOrder` dihitung otomatis oleh server, dilanjutkan dari step kepala ruangan yang sudah `APPROVED` (jika ada).
- Setelah admin menekan "Tetapkan/Mulai Approval", alur terkunci berjalan (perubahan approver di tengah jalan tetap dimungkinkan oleh admin dalam kondisi darurat, dicatat di audit log).

## 3. Delegasi/Pengganti
- Dipilih pegawai sendiri saat pengajuan (dari daftar pegawai di unit yang sama, status aktif).
- **Wajib dikonfirmasi oleh pegawai pengganti** sebelum pengajuan bisa diproses. Setelah pegawai submit, sistem mengirim notifikasi ke calon pengganti untuk menyetujui atau menolak.
  - Jika **ditolak**: status menjadi `DELEGATE_DECLINED`, pegawai pengaju perlu memilih pengganti lain dan submit ulang.
  - Jika **dikonfirmasi + unit punya `kepalaRuanganId`**: status → `PENDING_KEPALA_RUANGAN`, step approval kepala ruangan dibuat otomatis, notifikasi ke kepala ruangan. Kepala ruangan harus menyetujui dulu sebelum masuk ke antrean admin.
  - Jika **dikonfirmasi + unit TIDAK punya `kepalaRuanganId`**: status langsung → `PENDING_ADMIN_REVIEW`, muncul di antrean admin kepegawaian.
- Konfirmasi delegasi terpisah dari alur approval berjenjang (bukan `ApprovalStep`) dan menjadi **gerbang wajib** sebelum alur approval bisa dimulai.
- Kepala ruangan adalah satu-satunya `ApprovalStep` yang dibuat otomatis oleh sistem — step lainnya selalu ditetapkan manual oleh admin kepegawaian.
- Field `delegateId` beserta status konfirmasinya disimpan & ikut dikirim ke SK serta ke sistem lama (`delegateEmployeeLegacyId`).

## 4. Aturan Jenis & Kuota Cuti per Kategori Pegawai
Karena PNS, PPPK, dan BLUD memiliki aturan berbeda, jenis cuti dikelola sebagai **master data** (bukan hard-code), agar mudah disesuaikan admin kepegawaian ketika regulasi instansi berubah. Berikut referensi awal yang lazim berlaku di instansi pemerintah Indonesia — **wajib dikonfirmasi ulang ke bagian kepegawaian instansi** sebelum dijadikan default final:

| Jenis Cuti | PNS | PPPK | BLUD (non-PNS/PPPK, umumnya pegawai kontrak BLUD) |
|---|---|---|---|
| Cuti Tahunan | Ya, umumnya 12 hari/tahun | Ya, mengikuti ketentuan PPPK yang berlaku | Ya, mengikuti kebijakan internal BLUD |
| Cuti Sakit | Ya | Ya | Ya |
| Cuti Melahirkan | Ya | Ya | Ya |
| Cuti Besar | Ya | Umumnya tidak berlaku untuk PPPK (perlu konfirmasi) | Tergantung kebijakan BLUD |
| Cuti Alasan Penting | Ya | Ya | Tergantung kebijakan BLUD |
| Cuti di Luar Tanggungan Negara (CLTN) | Ya | Umumnya tidak berlaku untuk PPPK | Umumnya tidak berlaku |

> **Penting**: tabel di atas adalah titik awal desain data model saja, bukan keputusan final. Sebelum implementasi kuota, sinkronkan dengan bagian kepegawaian instansi terkait jenis cuti apa saja yang berlaku dan berapa kuotanya untuk masing-masing kategori (PNS/PPPK/BLUD). Model data (`LeaveType.applicableTo`, `LeaveQuota`) sudah dirancang fleksibel untuk menampung hasil konfirmasi tersebut tanpa perlu ubah skema.

## 5. Dokumen Pendukung (Lampiran)
- Bersifat **opsional** secara default untuk semua jenis cuti pada fase awal.
- Model data (`LeaveType.requiresAttachment`) sudah disiapkan agar admin bisa mengubah suatu jenis cuti (misal Cuti Sakit) menjadi **wajib lampiran** di kemudian hari tanpa perlu perubahan kode.

## 6. Generate SK Cuti
- Trigger: status `LeaveRequest` berubah menjadi `APPROVED` (tahap approval terakhir selesai).
- Proses: render template SK (HTML → PDF), isi nomor SK sesuai format aktif di admin panel (misal `800/{urutan}/SK/{tahun}`), simpan file, catat di `SkDocument`.
- SK memuat: identitas pegawai (NIP, nama, jabatan, unit), jenis & rentang cuti, nama pejabat penetap (approver tahap terakhir/Wakil Direktur), riwayat approval (trail), nama pegawai pengganti.

## 7. Fitur Tambahan Admin Kepegawaian
- **Cetak SK Cuti**: admin dapat mencetak/mengunduh ulang PDF SK kapan saja dari daftar pengajuan (tidak hanya sesaat setelah terbit).
- **Rekap Cuti Periode Tertentu**: admin dapat melihat rekapan jumlah pengajuan & total hari cuti, difilter berdasarkan rentang tanggal, unit kerja, kategori pegawai (PNS/PPPK/BLUD), dan/atau jenis cuti — untuk kebutuhan pelaporan.
- **Kirim Ulang ke Sistem Lama**: jika pengiriman data cuti ke aplikasi lama gagal (status `SEND_FAILED`), admin kepegawaian dapat menekan tombol kirim ulang tanpa perlu pegawai mengajukan ulang dari awal.

## 8. Notifikasi Push (FCM)
Dikirim pada momen:
- Pengajuan baru menunggu konfirmasi delegasi (ke calon pengganti).
- Delegasi menolak jadi pengganti (ke pegawai pengaju).
- Pengajuan diteruskan ke approver berikutnya.
- Pengajuan ditolak/dikembalikan (ke pegawai).
- Pengajuan disetujui final & SK terbit (ke pegawai + delegasi, opsional).
- Pengiriman ke sistem lama gagal (ke admin kepegawaian).
