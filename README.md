# 🏗️ EPC / OSINT API

API backend berbasis **Node.js + Express** untuk manajemen proyek EPC dan fitur OSINT sederhana.  
Menyediakan endpoint validasi **NIK** (Nomor Induk Kependudukan) dengan parsing lokal (provinsi, kabupaten, kecamatan, tanggal lahir, zodiak, pasaran, dll) dan integrasi ke **KPU (cekdptonline.kpu.go.id)**.

---

## ✨ Features

- ✅ Validasi NIK (16 digit)
- ✅ Parsing otomatis:
  - Provinsi, kabupaten/kota, kecamatan
  - Jenis kelamin
  - Tanggal lahir & umur
  - Zodiak, pasaran Jawa
- ✅ Integrasi **KPU API**:
  - Ambil data nama, alamat, TPS, lat/lon
  - Link otomatis ke Google Maps
- ✅ Middleware keamanan:
  - Helmet, CORS, input validation
  - Logger (request, performance, security)
- ✅ Struktur modular (controllers, routes, lib, utils)

---

## 📂 Project Structure

```
src/
 ├─ controllers/
 │   └─ CekNik.js        # Endpoint validasi NIK
 ├─ lib/
 │   └─ fetchKpu.js      # Integrasi ke server KPU (ESM)
 ├─ routes/
 │   └─ NikRoute.js      # Routing untuk endpoint NIK
 ├─ utils/
 │   └─ responseHandler.js  # Standar response API
 ├─ data/
 │   └─ wilayah.json     # Data referensi provinsi/kabupaten/kecamatan
```

---

## 🚀 Getting Started

### 1. Clone repo

```bash
git clone https://github.com/username/nama-repo.git
cd nama-repo
```

### 2. Install dependencies

```bash
npm install
```

### 3. Setup environment

Buat file `.env` di root project:

```env
PORT=5000
NODE_ENV=development
CORS_ALLOW_ALL=true
KPU_TOKEN=ISI_TOKEN_VALID_DARI_KPU
```

### 4. Run server

```bash
npm run start
```

Server jalan di:  
👉 `http://localhost:5000`

---

## 📡 API Endpoint

### Health Check

```http
GET /
```

Response:

```json
{
  "success": true,
  "message": "API Running",
  "timestamp": "2025-09-04T12:34:56.000Z",
  "environment": "development"
}
```

### Cek NIK

```http
GET /api/nik/cek?nik=3204110609970004
```

Contoh response:

```json
{
{
  "success": true,
  "message": "NIK valid",
  "data": {
    "nik": "3204110609970004",
    "nama": "SANDI ABDUL MAJIT",
    "kelamin": "LAKI-LAKI",
    "lahir": "06/09/1997",
    "provinsi": "JAWA BARAT",
    "kotakab": "KAB. BANDUNG",
    "kecamatan": "KATAPANG",
    "uniqcode": "0004",
    "tambahan": {
      "kodepos": "40921",
      "pasaran": "Sabtu Wage, 6 September 1997",
      "usia": "27 Tahun 11 Bulan 30 Hari",
      "ultah": "0 Bulan 0 Hari Lagi",
      "zodiak": "Virgo"
    },
    "kpu": {
      "ok": true,
      "data": {
        "nik": "320411**********",
        "nkk": "320411**********",
        "provinsi": null,
        "kabupaten": "BANDUNG",
        "kecamatan": "KATAPANG",
        "kelurahan": "PANGAUBAN",
        "tps": "4",
        "alamat": "TANAH KOSONG DI RT 03 RW 03",
        "lat": "-6.988455",
        "lon": "107.559976",
        "metode": "TPS",
        "google_maps_url": "https://maps.google.com?q=-6.988455,107.559976"
      }
    }
  }
}
```

---

## ⚠️ Notes

- Jangan commit file `.env` ke git.
- `.gitignore` harus berisi minimal:
  ```
  node_modules
  .env
  dist
  build
  ```
- Endpoint KPU bisa lambat atau timeout → API tetap balas dengan data lokal.

---

## 📜 License

MIT License © 2025
