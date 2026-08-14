# Setup Notifikasi Push — sapulapojne

Notif muncul di HP/laptop **meski tab browser ditutup** (mirip WA), untuk:
- Surat baru
- Komentar di surat
- Komentar di galeri

Keamanan:
- **VAPID private key tidak pernah ada di frontend / Vercel**
- Kirim notif hanya lewat **Supabase Edge Function** (server)
- Request tanpa secret → ditolak (401)
- Tabel subscription: anon **tidak bisa SELECT** daftar device orang lain
- Nama user dibatasi CHECK constraint (hanya 6 anggota)

---

## 1) Generate VAPID keys (sekali saja)

Di laptop (butuh Node.js):

```bash
npx web-push generate-vapid-keys
```

Akan muncul kira-kira:

```
Public Key:  BNxxxx...
Private Key: xxxxx...
```

**Simpan keduanya.** Public → frontend. Private → Supabase secrets saja.

---

## 2) Isi public key di website

Buka `script.js`, ganti:

```js
window.VAPID_PUBLIC_KEY = "GANTI_DENGAN_VAPID_PUBLIC_KEY";
```

dengan Public Key hasil generate.

---

## 3) SQL di Supabase

Dashboard Supabase → **SQL Editor** → jalankan file:

`supabase/push_subscriptions.sql`

Ini membuat tabel + RLS.

---

## 4) Deploy Edge Function

Install Supabase CLI jika belum, login, link project:

```bash
npx supabase login
npx supabase link --project-ref yatmsttajhpdzmhcqyup
```

Set secrets (ganti nilai dengan milikmu):

```bash
npx supabase secrets set \
  VAPID_PUBLIC_KEY="PUBLIC_KEY_KAMU" \
  VAPID_PRIVATE_KEY="PRIVATE_KEY_KAMU" \
  VAPID_SUBJECT="mailto:email-kamu@example.com" \
  PUSH_SECRET="buat-string-acak-panjang-minimal-32-karakter"
```

Contoh buat secret acak:

```bash
openssl rand -hex 32
```

Deploy function:

```bash
npx supabase functions deploy send-push --no-verify-jwt
```

Folder function: `supabase/functions/send-push/`

> `--no-verify-jwt` dipakai karena pemanggil utamanya Database Trigger/Webhook (bukan user JWT). Keamanan dijamin oleh header `x-push-secret`.

---

## 5) Trigger otomatis saat ada pesan baru

### Opsi A (disarankan) — Database Webhooks (UI Supabase)

1. Supabase Dashboard → **Database** → **Webhooks** (atau Integrations → Database Webhooks)
2. Buat 3 webhook (atau 1 per tabel):

| Tabel | Event | URL | HTTP Headers |
|-------|--------|-----|----------------|
| `letters` | INSERT | `https://yatmsttajhpdzmhcqyup.supabase.co/functions/v1/send-push` | `Content-Type: application/json` + `x-push-secret: SECRET_KAMU` |
| `letter_comments` | INSERT | sama | sama |
| `gallery_comments` | INSERT | sama | sama |

Body / payload template (sesuaikan kolom):

Untuk `letters`:
```json
{
  "type": "letter",
  "author": {{ $record.author }},
  "preview": {{ $record.message }},
  "id": {{ $record.id }}
}
```

Untuk `letter_comments`:
```json
{
  "type": "letter_comment",
  "author": {{ $record.author }},
  "preview": {{ $record.text }},
  "id": {{ $record.id }},
  "letter_id": {{ $record.letter_id }}
}
```

Untuk `gallery_comments`:
```json
{
  "type": "gallery_comment",
  "author": {{ $record.author }},
  "preview": {{ $record.text }},
  "id": {{ $record.id }},
  "item_id": {{ $record.item_id }}
}
```

> Format template webhook bisa beda sedikit tergantung UI Supabase. Intinya kirim JSON dengan `type`, `author`, `preview`.

### Opsi B — SQL trigger + pg_net

Jalankan `supabase/db_webhooks.sql` **setelah** mengganti `PUSH_SECRET` di dalam file tersebut agar sama dengan secret Edge Function.

Pastikan ekstensi `pg_net` aktif (Database → Extensions).

---

## 6) Icon PWA (penting untuk iPhone)

Tambahkan 2 file di root project (sama level `index.html`):

- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

Bisa pakai logo grup kalian. Tanpa ini, notif tetap jalan di Android, tapi “Add to Home Screen” di iOS kurang rapi.

---

## 7) Deploy ulang ke Vercel

Upload / push semua file baru:

- `sw.js`
- `manifest.json`
- `script.js` (sudah diubah)
- `style.css` (sudah diubah)
- `index.html` (sudah diubah)
- icon-192.png / icon-512.png

Pastikan `sw.js` bisa diakses di `https://domain-kamu.vercel.app/sw.js`.

---

## 8) Cara pakai di HP

1. Buka website → login pakai nama anggota
2. Banner “Aktifkan notifikasi” muncul → klik **Aktifkan** → Izinkan
3. **Android (Chrome)**: biasanya langsung oke, notif masuk meski browser ditutup
4. **iPhone (Safari)**:
   - Share → **Add to Home Screen**
   - Buka dari ikon di home screen
   - Baru aktifkan notifikasi (iOS lebih ketat)

---

## 9) Test cepat

Setelah semua terpasang, test manual dari terminal:

```bash
curl -X POST \
  'https://yatmsttajhpdzmhcqyup.supabase.co/functions/v1/send-push' \
  -H 'Content-Type: application/json' \
  -H 'x-push-secret: SECRET_KAMU' \
  -d '{"type":"test","author":"System"}'
```

Kalau subscription sudah ada, HP harus dapat notif “Notifikasi test berhasil ✨”.

Atau kirim surat biasa dari akun lain → anggota lain yang sudah aktifkan notif harus dapat.

---

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| Banner tidak muncul | Permission sudah granted/denied, atau localStorage `sapulapojne_push_dismiss` |
| Aktifkan error VAPID | Public key belum diganti di `script.js` |
| Curl 401 | `x-push-secret` tidak sama dengan secret di Edge Function |
| Curl 200 tapi tidak ada notif | Belum ada baris di `push_subscriptions`, atau HP belum izinkan |
| iPhone tidak dapat notif background | Harus PWA (Add to Home Screen) + iOS 16.4+ |
| Notif ke pengirim sendiri | Seharusnya tidak — Edge Function filter `author` |

---

## Ringkasan keamanan

| Item | Status |
|------|--------|
| VAPID private key di browser | ❌ Tidak |
| Service role key di browser | ❌ Tidak |
| Anon bisa baca semua subscription | ❌ Tidak (RLS) |
| Kirim push tanpa secret | ❌ Ditolak 401 |
| Subscription user selain 6 anggota | ❌ Ditolak CHECK constraint |
| Notif ke pengirim | ❌ Difilter di Edge Function |

Kalau ada yang stuck di langkah berapa, kirim error-nya (screenshot / pesan) biar dibantu lanjut.
