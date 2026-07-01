# Panduan Memulai: Sistem Akuisisi Data sEMG

Panduan ini ditujukan bagi operator atau pengguna sistem yang tidak memiliki latar belakang pemrograman (*non-coder*). Ikuti langkah-langkah di bawah ini secara berurutan untuk mulai merekam data.

---

## 🔌 Bagian 1: Persiapan Alat & Deteksi Port (COM Port)

Sebelum membuka aplikasi, kita harus menghubungkan sensor ke laptop dan mengetahui nomor jalurnya (Port COM).

1. **Hubungkan Alat Sensor (XIAO nRF52840)** ke port USB laptop menggunakan kabel USB.
2. **Cek Nomor COM Port:**
   * Klik kanan tombol **Start Windows** (ikon bendera Windows di pojok kiri bawah layar).
   * Pilih **Device Manager** (Pengelola Perangkat).
   * Cari menu **Ports (COM & LPT)** dan klik tanda panah di sebelahnya untuk memperluas daftar.
   * Perhatikan nama perangkat baru yang muncul (misalnya `USB Serial Device` atau sejenisnya). Di ujung namanya akan tertulis kode port di dalam tanda kurung, seperti **`(COM3)`** atau **`(COM4)`**.
   * **Catat nomor COM tersebut** (misal: `COM3`).

---

## ⚙️ Bagian 2: Menyesuaikan Konfigurasi Port Sensor

Sebelum menjalankan program, kita harus memberitahukan program di port mana sensor terhubung.

1. Buka folder projek **`C:\sEMG`** menggunakan File Explorer biasa.
2. Cari file bernama **`emg_bridge.py`**.
3. Klik kanan file tersebut, pilih **Open with** -> **Notepad** (atau aplikasi edit teks lainnya).
4. Cari baris berikut di bagian atas file (sekitar baris ke-43):
   ```python
   SERIAL_PORT = "COM3"           # ganti sesuai port XIAO nRF52840 Anda
   ```
5. Ubah tulisan `"COM3"` menjadi nomor port yang Anda catat pada langkah sebelumnya (misalnya `"COM4"` jika yang terdeteksi adalah COM4).
6. Simpan file tersebut dengan menekan tombol **Ctrl + S**, lalu tutup Notepad.

---

## 💻 Bagian 3: Menjalankan Sistem via Terminal (CMD)

Kita akan membuka dua jendela terminal hitam (Command Prompt) untuk menjalankan aplikasi web dan penghubung sensor.

### 🗄️ Langkah 1: Pastikan Database Aktif
* Jika Anda menggunakan **Laragon**, buka aplikasi Laragon dan klik tombol **Start All**.
* Jika menggunakan PostgreSQL bawaan Windows, database biasanya otomatis berjalan saat laptop dinyalakan.

### 🌐 Langkah 2: Menjalankan Halaman Web (Terminal 1)
1. Tekan tombol **Windows + R** di keyboard secara bersamaan.
2. Ketik `cmd` lalu tekan **Enter**. Jendela terminal hitam (Terminal 1) akan terbuka.
3. Ketik perintah berikut untuk masuk ke folder projek, lalu tekan **Enter**:
   ```cmd
   cd C:\sEMG
   ```
4. Ketik perintah untuk menjalankan server web, lalu tekan **Enter**:
   ```cmd
   npm run dev
   ```
5. Biarkan terminal ini terbuka di latar belakang. Jangan ditutup selama proses pengambilan data.

### 🔗 Langkah 3: Menjalankan Python Bridge / Penghubung Sensor (Terminal 2)
1. Buka kembali terminal baru. Tekan **Windows + R**, ketik `cmd`, lalu tekan **Enter** (Terminal 2).
2. Ketik perintah berikut untuk masuk ke folder projek, lalu tekan **Enter**:
   ```cmd
   cd C:\sEMG
   ```
<!-- 3. *(Lakukan ini hanya saat pertama kali setup)* Ketik perintah berikut untuk memasang paket yang diperlukan, lalu tekan **Enter**:
   ```cmd
   pip install -r requirements.txt
   ``` -->
4. Ketik perintah berikut untuk mulai menghubungkan sensor ke database, lalu tekan **Enter**:
   ```cmd
   python emg_bridge.py
   ```
5. Jika berhasil terhubung, terminal akan menampilkan log seperti:
   ```text
   [bridge] Local API server jalan di http://127.0.0.1:8000
   [bridge] Membuka Serial port COM3 @ 115200...
   ```
6. Biarkan terminal ini tetap terbuka dan jangan ditutup selama perekaman data berlangsung.

---

## 🚀 Bagian 4: Memulai Sesi Pengambilan Data

Setelah kedua terminal berjalan aktif:

1. Buka browser internet Anda (seperti Google Chrome atau Microsoft Edge).
2. Ketik alamat berikut di bagian address bar atas:
   ```text
   http://localhost:3000
   ```
   lalu tekan **Enter**.
3. Halaman web sEMG Acquisition System akan tampil. Anda bisa masuk ke menu **Admin** atau **Session Runner** untuk mengontrol pengambilan data gesture partisipan.

---

## 🛑 Cara Mematikan Sistem
Jika Anda telah selesai melakukan pengambilan data:
1. Klik jendela terminal pertama, tekan tombol **Ctrl + C** di keyboard untuk menghentikan program web.
2. Klik jendela terminal kedua, tekan tombol **Ctrl + C** untuk menghentikan perekaman sensor.
3. Tutup kedua jendela terminal hitam tersebut.
4. Cabut kabel USB alat sensor dari laptop secara aman.
