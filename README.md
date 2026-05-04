# EMG Acquisition Guide

Sistem antarmuka pemandu akuisisi data gesture berbasis temporal untuk riset sinyal otot (sEMG). Berfungsi sebagai **"Master Clock"** yang mengotomasi 3 fase eksperimen secara presisi milidetik: **Persiapan → Aksi → Istirahat**.

---

## ⚙️ Tech Stack

| Komponen | Teknologi |
|---|---|
| Framework | Next.js 16 (App Router) |
| Bahasa | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| Auth | jose (JWT) + bcryptjs |
| Icons | lucide-react |

---

## 🔧 Prerequisites — Yang Harus Diinstall

Sebelum menjalankan proyek ini, pastikan semua tools berikut sudah terinstall di sistem:

### 1. Node.js (v20 atau lebih baru)
Download dari: https://nodejs.org/en/download
Verifikasi:
```bash
node --version   # harus >= v20.0.0
npm --version    # harus >= 9.x
```

### 2. PostgreSQL (v14 atau lebih baru)
Download dari: https://www.postgresql.org/download/

Atau gunakan **Laragon** (sudah include PostgreSQL):
- Download Laragon: https://laragon.org/download/
- Aktifkan PostgreSQL dari menu Laragon

Verifikasi PostgreSQL berjalan:
```bash
psql --version
```

### 3. Prisma Dev Server (untuk koneksi lokal)
Proyek ini menggunakan `prisma+postgres://` protocol (Prisma local proxy).

```bash
npm install -g prisma
prisma dev   # jalankan di terminal terpisah
```

Atau, jika ingin koneksi PostgreSQL standar langsung (lihat bagian Konfigurasi).

### 4. Git
Download dari: https://git-scm.com/downloads

---

## 🚀 Cara Menjalankan

### Langkah 1: Clone Repository
```bash
git clone <url-repository>
cd emg
```

### Langkah 2: Install Dependencies
```bash
npm install
```
Perintah ini akan menginstall semua package yang tercantum di `package.json`:
- `next`, `react`, `react-dom`
- `@prisma/client`, `@prisma/adapter-pg`
- `pg` (PostgreSQL driver)
- `jose`, `bcryptjs`, `jsonwebtoken`
- `lucide-react`
- `dotenv`, `tailwindcss`, dll.

### Langkah 3: Setup File Environment
Buat file `.env` di root folder (file ini **tidak** di-commit ke git karena sensitif):

```bash
# Salin template berikut ke file .env di root proyek
```

**Opsi A — Prisma Local Dev Server (default project ini):**
```env
DATABASE_URL="prisma+postgres://localhost:51213/?api_key=<api_key_dari_prisma_dev>"
JWT_SECRET="ganti-dengan-string-random-yang-panjang"
```

**Opsi B — PostgreSQL Langsung (lebih mudah untuk setup baru):**
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/emg_db"
JWT_SECRET="ganti-dengan-string-random-yang-panjang"
```

> ⚠️ Jika menggunakan Opsi B, perlu mengubah `prisma/schema.prisma` dan `prisma.config.ts`.  
> Lihat bagian **Konfigurasi PostgreSQL Standar** di bawah.

### Langkah 4: Setup Database

**Jika pakai Prisma Dev Server (Opsi A):**
```bash
# Di terminal terpisah, jalankan dulu:
npx prisma dev

# Lalu di terminal utama:
npx prisma migrate dev --name init
```

**Jika pakai PostgreSQL langsung (Opsi B):**
```bash
# Buat database dulu di PostgreSQL:
psql -U postgres -c "CREATE DATABASE emg_db;"

# Lalu jalankan migrasi:
npx prisma migrate dev --name init
```

### Langkah 5: Generate Prisma Client
```bash
npx prisma generate
```
Ini akan membuat folder `app/generated/prisma/` (di-ignore dari git).

### Langkah 6: Jalankan Development Server
```bash
npm run dev
```

Buka browser: **http://localhost:3000**

---

## 🔑 Login Admin

Saat pertama kali akses `/admin`, sistem otomatis membuat akun admin default:

| Field | Value |
|---|---|
| Username | `admin` |
| Password | `admin123` |

> ⚠️ **Ganti password setelah login pertama untuk keamanan!**

---

## 📁 Struktur Branch

| Branch | Fungsi |
|---|---|
| `master` | Production-ready code |
| `dev` | Development integration |
| `feature/tier1-core` | Core backend & auth |
| `feature/tier2-ui-mechanics` | UI improvements & timing engine |

---

## 📁 Struktur Folder Penting

```
emg/
├── app/
│   ├── admin/          # Dashboard admin (layout, gestures, config, sessions)
│   ├── api/            # REST API routes + SSE trigger
│   ├── components/     # UI components (admin/ dan session/)
│   ├── generated/      # Prisma Client (auto-generated, jangan edit)
│   ├── lib/            # Utilities (auth, prisma, actions, types, export)
│   ├── login/          # Halaman login
│   └── session/        # Session runner dan selection
├── prisma/
│   ├── schema.prisma   # Database schema
│   └── migrations/     # Migration history
├── public/
│   └── videos/         # Folder untuk video tutorial gesture (upload via admin)
├── proxy.ts            # Auth middleware (route protection)
├── prisma.config.ts    # Konfigurasi Prisma
└── .env                # Environment variables (TIDAK di-commit)
```

---

## 🗄️ Konfigurasi PostgreSQL Standar (Opsi B)

Jika tidak menggunakan Prisma Dev Server, ubah dua file berikut:

**`prisma/schema.prisma`** — hapus komentar, pastikan:
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**`prisma.config.ts`** — sesuaikan atau hapus isi, biarkan minimal:
```ts
import { defineConfig } from "prisma/config"
export default defineConfig({ schema: "prisma/schema.prisma" })
```

**`app/lib/prisma.ts`** — gunakan standard client tanpa adapter:
```ts
import { PrismaClient } from '@/app/generated/prisma/client'
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined }
export const prisma = globalForPrisma.prisma ?? new PrismaClient()
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

---

## 📜 Perintah Berguna

```bash
npm run dev          # Jalankan dev server (http://localhost:3000)
npm run build        # Build production
npm run lint         # Cek kualitas kode

npx prisma studio    # GUI untuk lihat/edit data database
npx prisma migrate dev --name <nama>   # Buat migration baru
npx prisma generate  # Regenerate Prisma Client setelah ubah schema
npx prisma db push   # Push schema tanpa migration (untuk prototyping)
```

---

## 🔌 Integrasi Sensor Eksternal (SSE)

Untuk menerima sinyal trigger real-time dari sesi akuisisi:

```python
# Python example
import sseclient, requests

response = requests.get('http://localhost:3000/api/trigger', stream=True)
client = sseclient.SSEClient(response)
for event in client.events():
    print(event.data)  # JSON: { type, sessionId, gestureName, repetitionNum, timestamp }
```

---

## 🐛 Troubleshooting

**`PrismaClientConstructorValidationError: accelerateUrl required`**  
→ Prisma Dev Server tidak berjalan. Jalankan `npx prisma dev` atau ganti ke Opsi B (PostgreSQL standar).

**`Module not found: app/generated/prisma`**  
→ Jalankan `npx prisma generate`

**Port 3000 sudah dipakai**  
→ `npm run dev -- -p 3001`

**Database connection error**  
→ Pastikan PostgreSQL service berjalan dan `DATABASE_URL` di `.env` sudah benar
