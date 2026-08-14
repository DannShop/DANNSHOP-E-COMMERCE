<?php
/**
 * Relay IP tetap untuk panggilan API provider (Digiflazz DAN OkeConnect).
 *
 * NAMA FILE-nya sengaja tetap `digiflazz-relay.php` walau sekarang melayani lebih
 * dari satu provider: URL-nya sudah terpasang di PROVIDER_RELAY_URL pada Vercel dan
 * sudah jalan di produksi. Mengganti nama berarti menambah satu langkah manual yang
 * kalau terlupa akan membuat SELURUH jalur transaksi gagal - risiko yang tidak
 * sebanding dengan sekadar nama yang lebih rapi.
 *
 * MASALAH YANG DISELESAIKAN
 * Digiflazz menolak request dari IP yang tidak terdaftar di whitelist mereka
 * (rc 45: "IP Anda tidak kami kenali"), dan OkeConnect mewajibkan hal yang sama.
 * Aplikasi berjalan di Vercel, yang TIDAK punya IP keluar tetap - tiap invocation
 * bisa keluar dari IP AWS mana saja, jadi whitelist satu IP hari ini pasti gagal
 * lagi besok.
 *
 * File ini dipasang di shared hosting, yang IP-nya TETAP. Alurnya jadi:
 *
 *     Vercel (IP acak) --> relay ini (IP TETAP) --> api.digiflazz.com
 *                                ^ cukup IP INI yang didaftarkan di Digiflazz
 *
 * CARA PASANG - ada panduan lengkapnya di docs/08-IP-TETAP-DIGIFLAZZ.md.
 * Ringkasnya: upload file ini ke public_html, ganti nilai RELAY_SECRET di bawah
 * dengan string acak panjang, lalu isi PROVIDER_RELAY_URL & PROVIDER_RELAY_SECRET
 * di environment variable Vercel.
 *
 * KENAPA PHP, bukan Node: shared hosting mana pun pasti punya PHP + cURL, tanpa
 * perlu plan khusus, tanpa perlu proses yang harus dijaga tetap hidup.
 */

// ============================================================================
// KONFIGURASI - cuma bagian ini yang perlu diubah.
// ============================================================================

// WAJIB DIGANTI. Harus sama persis dengan PROVIDER_RELAY_SECRET di Vercel.
// Bikin nilainya dengan: openssl rand -hex 32
const RELAY_SECRET = 'GANTI-DENGAN-STRING-ACAK-PANJANG';

// Host yang boleh dituju. Dikunci supaya file ini TIDAK bisa dipakai sebagai open
// proxy ke alamat sembarangan kalau URL-nya sampai bocor - tanpa ini, siapa pun
// yang tahu secret-nya bisa memakai hosting kamu untuk menyerang situs lain, dan
// yang tercatat sebagai penyerang adalah IP kamu.
//
// h2h.okeconnect.com ada di sini karena OkeConnect juga mewajibkan IP terdaftar.
// CATATAN: price list OkeConnect (okeconnect.com/harga/json) TIDAK lewat relay -
// endpoint itu tidak butuh whitelist IP sama sekali, jadi sengaja tidak diizinkan
// di sini supaya permukaan relay tetap sesempit mungkin.
const ALLOWED_HOSTS = ['api.digiflazz.com', 'h2h.okeconnect.com'];

// Path API yang boleh diteruskan. Daftar tertutup, bukan pola.
const ALLOWED_PATHS = ['/v1/transaction', '/v1/price-list', '/v1/cek-saldo', '/trx', '/trx/balance'];

// Timeout ke Digiflazz. Sengaja lebih pendek dari timeout aplikasi (15 detik + 5
// detik kelonggaran) supaya saat provider menggantung, relay yang menyerah lebih
// dulu dan sempat mengembalikan pesan error yang jelas - bukan aplikasi yang
// kehabisan waktu menunggu relay dan kehilangan sebabnya.
const RELAY_TIMEOUT = 15;

// ============================================================================
// Di bawah ini tidak perlu diubah.
// ============================================================================

header('Content-Type: application/json');
// Relay ini cuma dipanggil server-ke-server; tidak ada browser yang perlu
// membacanya, jadi tidak ada header CORS yang diberikan dengan sengaja.

function reply(int $httpStatus, array $payload): void {
    http_response_code($httpStatus);
    echo json_encode($payload);
    exit;
}

/**
 * IP keluar hosting ini, dilihat dari luar - angka yang harus didaftarkan ke
 * whitelist Digiflazz.
 *
 * Dipakai layanan echo IP publik karena PHP TIDAK PUNYA cara mengetahui alamat
 * NAT-nya sendiri: $_SERVER['SERVER_ADDR'] itu alamat yang MENERIMA request web,
 * dan di shared hosting alamat itu sering berbeda dari alamat yang dipakai saat
 * server melakukan koneksi keluar. Mendaftarkan alamat yang salah bikin gejalanya
 * persis sama dengan belum mendaftar sama sekali - membingungkan dan makan waktu.
 *
 * Dicoba beberapa layanan berurutan supaya satu layanan yang sedang down tidak
 * membuat langkah ini buntu. Hanya dipakai di mode ping (diagnostik), tidak pernah
 * di jalur transaksi, dan tidak mengirim data apa pun selain permintaan kosong.
 */
function detect_outbound_ip(): ?string {
    if (!function_exists('curl_init')) {
        return null;
    }
    foreach (['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com'] as $service) {
        $ch = curl_init($service);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
            CURLOPT_CONNECTTIMEOUT => 3,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_FOLLOWLOCATION => false,
        ]);
        $out = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($out !== false && $status === 200) {
            $ip = trim($out);
            // Divalidasi sebagai IP betulan: layanan yang error kadang membalas
            // halaman HTML dengan status 200, dan angka itu akan dipakai orang
            // untuk mendaftar whitelist.
            if (filter_var($ip, FILTER_VALIDATE_IP)) {
                return $ip;
            }
        }
    }
    return null;
}

// --- Sanity check konfigurasi -------------------------------------------------
// Dijalankan paling awal, sebelum ping maupun forward: relay yang secret-nya belum
// diganti tidak boleh melayani apa pun, dan operator harus tahu sebabnya alih-alih
// dibingungkan pesan "secret tidak cocok". Dicek lewat awalan + panjang, BUKAN
// dibandingkan dengan salinan literal placeholder-nya — menyalin literal itu dua
// kali membuat siapa pun yang mengganti salah satunya saja lolos diam-diam.
if (str_starts_with(RELAY_SECRET, 'GANTI-') || strlen(RELAY_SECRET) < 24) {
    reply(500, ['ok' => false, 'error' => 'RELAY_SECRET di file relay belum diganti dengan string acak yang cukup panjang (minimal 24 karakter).']);
}

// --- Mode cek kesehatan -------------------------------------------------------
// GET ?ping=1 dengan secret yang benar. Dipakai untuk memastikan relay hidup dan
// cURL-nya berfungsi SEBELUM mengarahkan transaksi sungguhan ke sini.
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET' && isset($_GET['ping'])) {
    $secret = $_SERVER['HTTP_X_RELAY_SECRET'] ?? '';
    if (!is_string($secret) || !hash_equals(RELAY_SECRET, $secret)) {
        reply(403, ['ok' => false, 'error' => 'Secret tidak cocok.']);
    }
    reply(200, [
        'ok' => true,
        'relay' => 'provider-relay (digiflazz + okeconnect)',
        'php' => PHP_VERSION,
        'curl' => function_exists('curl_init'),
        // INI angka yang dipakai untuk whitelist: IP yang dilihat dunia luar saat
        // hosting ini melakukan panggilan KELUAR. Sengaja tidak memakai SERVER_ADDR
        // (alamat web-nya) karena banyak shared hosting keluar lewat NAT dengan
        // alamat yang berbeda - mendaftarkan SERVER_ADDR akan tampak benar tapi
        // tetap ditolak Digiflazz.
        'ip_keluar' => detect_outbound_ip(),
        // Disertakan hanya sebagai pembanding. Kalau berbeda dari ip_keluar, yang
        // benar SELALU ip_keluar.
        'server_addr' => $_SERVER['SERVER_ADDR'] ?? null,
    ]);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    reply(405, ['ok' => false, 'error' => 'Hanya menerima POST.']);
}

// --- Otentikasi ---------------------------------------------------------------
$secret = $_SERVER['HTTP_X_RELAY_SECRET'] ?? '';
// hash_equals: perbandingan waktu-tetap. Perbandingan biasa (===) berhenti di
// karakter pertama yang beda, dan selisih waktunya cukup untuk menebak secret
// karakter demi karakter lewat pengukuran berulang.
if (!is_string($secret) || !hash_equals(RELAY_SECRET, $secret)) {
    reply(403, ['ok' => false, 'error' => 'Secret tidak cocok.']);
}

// --- Validasi permintaan ------------------------------------------------------
$raw = file_get_contents('php://input');
$req = json_decode($raw, true);
if (!is_array($req) || !isset($req['url']) || !is_string($req['url'])) {
    reply(400, ['ok' => false, 'error' => 'Body harus JSON berisi {url, ...}.']);
}

// Metode ke PROVIDER (bukan metode ke relay ini - relay selalu dipanggil via POST).
// Default 'POST' supaya pemanggil lama yang tidak mengirim field ini tetap jalan
// persis seperti sebelumnya.
$method = strtoupper((string)($req['method'] ?? 'POST'));
if ($method !== 'POST' && $method !== 'GET') {
    reply(400, ['ok' => false, 'error' => 'method hanya boleh POST atau GET.']);
}

if ($method === 'POST') {
    if (!isset($req['body']) || !is_array($req['body'])) {
        reply(400, ['ok' => false, 'error' => 'POST butuh {url, body}.']);
    }
} else {
    if (!isset($req['query']) || !is_array($req['query'])) {
        reply(400, ['ok' => false, 'error' => 'GET butuh {url, query}.']);
    }
    // Nilai query harus skalar. Array bersarang akan diserialisasi http_build_query
    // jadi bentuk (mis. `a[0]=x`) yang tidak pernah dimaksudkan pemanggil - lebih
    // baik ditolak terang-terangan daripada diteruskan dalam bentuk yang salah.
    foreach ($req['query'] as $k => $v) {
        if (!is_string($k) || (!is_string($v) && !is_int($v) && !is_float($v) && !is_bool($v))) {
            reply(400, ['ok' => false, 'error' => 'Nilai query harus skalar.']);
        }
    }
}

$parts = parse_url($req['url']);
if ($parts === false || ($parts['scheme'] ?? '') !== 'https') {
    reply(400, ['ok' => false, 'error' => 'URL tujuan harus https.']);
}
if (!in_array($parts['host'] ?? '', ALLOWED_HOSTS, true)) {
    reply(403, ['ok' => false, 'error' => 'Host tujuan tidak diizinkan.']);
}
if (!in_array($parts['path'] ?? '', ALLOWED_PATHS, true)) {
    reply(403, ['ok' => false, 'error' => 'Path tujuan tidak diizinkan.']);
}
// URL disusun ULANG dari bagian yang sudah divalidasi, bukan memakai string
// aslinya - supaya trik seperti query string atau fragment tambahan tidak ikut
// terbawa ke provider. Untuk GET, query dibangun dari field `query` yang terpisah
// (dan sudah divalidasi skalar di atas), BUKAN dari query string di dalam $req['url'] -
// jadi sifat "URL selalu dibangun ulang oleh relay" tetap terjaga.
$target = 'https://' . $parts['host'] . $parts['path'];
if ($method === 'GET' && !empty($req['query'])) {
    $target .= '?' . http_build_query($req['query']);
}

if (!function_exists('curl_init')) {
    reply(500, ['ok' => false, 'error' => 'Ekstensi cURL tidak aktif di hosting ini.']);
}

// --- Teruskan ke provider -----------------------------------------------------
$ch = curl_init($target);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => RELAY_TIMEOUT,
    CURLOPT_CONNECTTIMEOUT => 10,
    // Verifikasi sertifikat TIDAK pernah dimatikan: relay ini membawa kredensial
    // yang bernilai uang. Kalau hosting punya bundle CA usang sehingga verifikasi
    // gagal, perbaiki CA-nya - jangan matikan pemeriksaannya.
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    // Provider tidak pernah melakukan redirect; mengikutinya cuma membuka jalan
    // ke tujuan yang tidak tervalidasi.
    CURLOPT_FOLLOWLOCATION => false,
]);

// Body hanya untuk POST. GET sudah membawa semuanya di query string $target.
if ($method === 'POST') {
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($req['body']),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    ]);
}

$body = curl_exec($ch);
$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$err = curl_error($ch);
curl_close($ch);

if ($body === false) {
    reply(502, ['ok' => false, 'error' => 'Gagal menghubungi provider: ' . $err]);
}

// Status DAN body diteruskan apa adanya, tanpa ditafsirkan. Digiflazz membalas
// HTTP 200 untuk penolakan dan kadang membalas non-JSON; penilaiannya dilakukan
// di aplikasi (classifyDigiflazzResponse), supaya cuma ada SATU tempat yang
// memutuskan arti sebuah respons.
reply(200, ['ok' => true, 'status' => $status, 'body' => $body]);
