# ThinkFiller AI ⚡

**ThinkFiller AI** adalah ekstensi browser (Chrome Extension) berbasis AI pintar yang ditenagai oleh Google Gemini API. Ekstensi ini dirancang khusus untuk mempermudah QA/Web Developer melakukan testing form input secara cerdas, cepat, dan kontekstual tanpa perlu mengisi form secara manual satu per satu.

---

## ✨ Fitur Utama

- **Pilihan Profil Pengujian**:
  - 🟢 **Positive Case**: Menghasilkan data simulasi yang realistis, valid, dan logis (menggunakan nama, nomor telepon, alamat, dan format Indonesia yang valid).
  - 🔴 **Negative Case**: Menghasilkan data yang sengaja dibuat tidak valid (salah format email, teks di kolom angka, password terlalu pendek) untuk menguji validasi form.
  - 🎨 **Custom Instructions**: Instruksi khusus dari pengguna (misal: "Isi form sebagai pembeli dari Bandung yang berumur 30 tahun").
- **Smart Cascading Select Dropdown**:
  - **Pre-Fill Polling**: Otomatis mendeteksi select menu yang masih dinonaktifkan (`disabled`) atau kosong, menunggu (polling) hingga 2 detik sampai menu tersebut diaktifkan oleh sistem dependensi form (seperti Negara -> Provinsi -> Kota).
  - **Post-Fill Delay (2 Detik)**: Memberikan jeda waktu 2 detik setelah memilih opsi select dropdown agar *event handler* di website memiliki cukup waktu untuk melakukan request data dan memuat dropdown berikutnya.
  - **Smart Fallback**: Jika data pilihan yang dihasilkan AI tidak cocok dengan opsi yang tersedia (misal karena opsi dropdown baru muncul setelah interaksi), ekstensi akan otomatis memilih **opsi valid pertama** agar rantai dependensi form tidak terputus.
- **Optimasi API & Proteksi Rate-Limit**:
  - **30-Second Caching**: Menyimpan respons API terakhir selama 30 detik untuk pengujian berulang di form yang sama guna menghindari limit kuota API.
  - **Exponential Backoff Retry**: Otomatis mencoba kembali request API jika terkena batas limit (HTTP `429`) dengan waktu jeda bertahap (`2s`, `4s`, `8s`).
  - **Option Truncation**: Membatasi pengiriman opsi dropdown maksimal 30 opsi teratas ke API untuk menghemat penggunaan token prompt.
- **Dukungan Tema Premium**: Mendukung **Light Mode** dan **Dark Mode** yang dapat diganti melalui tombol di header ekstensi.
- **Keyboard Shortcut**: Tekan `Ctrl+Shift+Y` (atau `Cmd+Shift+Y` di Mac) untuk langsung mengisi form secara instan menggunakan profil terakhir yang Anda pilih.

---

## 🛠️ Panduan Instalasi (Chrome / Edge / Opera)

Ekstensi ini menggunakan Manifest V3 dan dapat diinstal dengan langkah berikut:

1. **Unduh Repository**:
   Unduh atau clone repository ini ke komputer Anda.
   ```bash
   git clone https://github.com/slametaji-ui/ThinkFiller.git
   ```
2. **Buka Halaman Ekstensi**:
   Buka Google Chrome atau browser berbasis Chromium lainnya, lalu akses url berikut:
   ```text
   chrome://extensions/
   ```
3. **Aktifkan Developer Mode**:
   Aktifkan tombol **Developer mode** (Mode Pengembang) di sudut kanan atas halaman ekstensi.
4. **Muat Ekstensi**:
   Klik tombol **Load unpacked** (Muat yang belum dikemas) di sudut kiri atas.
5. **Pilih Folder**:
   Pilih folder `thinkFiller` hasil download/clone tadi yang berisi berkas `manifest.json`.
6. **Selesai!** Ekstensi ThinkFiller AI kini telah muncul di toolbar browser Anda.

---

## 🚀 Cara Penggunaan & Konfigurasi

### 1. Dapatkan & Setup API Key Gemini (Gratis)
Ekstensi ini memerlukan API Key Google Gemini. Ikuti langkah ini untuk menyiapkannya:
1. Buka [Google AI Studio](https://aistudio.google.com/) dan masuk menggunakan akun Google Anda.
2. Klik tombol **Get API Key** lalu klik **Create API Key**.
3. Klik ikon ekstensi **ThinkFiller AI** di toolbar browser Anda.
4. Klik bagian **🔧 API Settings** untuk membuka panel konfigurasi.
5. Tempelkan (paste) API Key Anda ke kolom **Gemini API Key**, lalu klik **Save Settings**.
6. Anda juga dapat memilih model AI yang digunakan (default: `Gemini 2.5 Flash` - Cepat & Gratis).

### 2. Mengisi Form Website
1. Navigasi ke halaman website yang memiliki form input yang ingin Anda uji.
2. Klik ikon ekstensi **ThinkFiller AI**.
3. Pilih profil pengujian yang diinginkan (*Positive*, *Negative*, atau *Custom*).
4. Klik tombol **Generate & Fill Form**.
5. Proses AI akan menganalisis form, menghubungi Gemini API, lalu memasukkan data secara otomatis satu per satu. Jeda 2 detik akan diterapkan setiap kali memilih opsi dropdown untuk memicu dependensi form.

---

## 📂 Struktur Berkas Project

- [manifest.json](file:///c:/laragon/www/thinkFiller/manifest.json) - Konfigurasi extension Manifest V3.
- [mock_test.html](file:///c:/laragon/www/thinkFiller/mock_test.html) - Halaman uji coba lokal (QA Sandbox) dengan form dependensi (Negara -> Provinsi -> Kota) untuk memverifikasi fungsionalitas pengisi form.
- [popup/](file:///c:/laragon/www/thinkFiller/popup) - UI dan logika tampilan ekstensi (HTML, CSS, JS).
- [scripts/background.js](file:///c:/laragon/www/thinkFiller/scripts/background.js) - Service worker latar belakang untuk menangani keyboard shortcut command.
- [scripts/content.js](file:///c:/laragon/www/thinkFiller/scripts/content.js) - Content script yang disuntikkan ke halaman aktif untuk membaca form dan mengisi data.
- [utils/gemini-api.js](file:///c:/laragon/www/thinkFiller/utils/gemini-api.js) - Layanan komunikasi dengan Google Gemini API, caching, dan logika retry.

---

## 📄 Lisensi

Proyek ini dilisensikan di bawah lisensi MIT. Silakan kembangkan dan gunakan untuk kebutuhan pengetesan QA Anda!
