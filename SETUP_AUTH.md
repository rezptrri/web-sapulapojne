# Login username + password sendiri

## Perubahan UX

| Dulu | Sekarang |
|------|----------|
| Isi nama = langsung masuk | Pilih **nama** + isi **password** |
| Semua orang tahu “password”-nya (namanya) | Tiap orang bikin password sendiri |
| Tutup tab = login lagi | Tetap login di device itu (sampai Logout) |

## Alur

1. Pilih nama (Saira / April / …)
2. **Pertama kali** nama itu dipakai → muncul “Ulangi password” → password baru disimpan (hash)
3. **Berikutnya** → isi password yang sama → masuk
4. Di device yang sama, buka lagi website → **langsung masuk** (tanpa password)
5. Klik Logout → baru diminta nama + password lagi

## Yang perlu di Supabase (wajib)

Jalankan SQL ini sekali:

`supabase/auth_password.sql`

Isinya menambah kolom:

- `profiles.password_hash`
- `profiles.password_salt`

## Keamanan (realistis untuk 6 orang)

- Password **tidak** disimpan plain text → di-hash PBKDF2 (120k iterasi) + salt acak
- Yang tersimpan di database cuma hash + salt
- Username hanya 6 nama yang ada di daftar
- Login “nempel” per browser/device lewat `localStorage`

Batasan: verifikasi hash masih di browser (model website static + anon key). Untuk grup privat ini biasanya cukup. Kalau nanti mau lebih keras, verifikasi bisa dipindah ke Edge Function.

## Deploy

1. Jalankan `auth_password.sql` di Supabase  
2. Upload / deploy file website terbaru (terutama `index.html`, `script.js`, `style.css`) ke Vercel  
3. Tiap anggota buka website → pilih namanya → buat password → selesai  

Kalau sudah pernah “login” dengan sistem lama (nama saja), mereka cukup **buat password baru** sekali di langkah pertama.
