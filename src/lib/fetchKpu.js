// src/lib/fetchKpu.js
// Node 20 (Vercel) pakai undici sebagai fetch; kita aktifkan keep-alive & retry.
import { Agent } from "undici";

const API_URL = "https://cekdptonline.kpu.go.id/v2";

// Keep-alive agent supaya koneksi lebih stabil di serverless
const agent = new Agent({
  connect: { timeout: 10_000 },
  keepAliveTimeout: 15_000,
  keepAliveMaxTimeout: 30_000,
  pipelining: 0
});

// Cache sederhana (in-memory) untuk menahan spam NIK yang sama beberapa menit
// (Serverless bisa di-cold start; cache tidak dijamin persisten, tapi membantu)
const CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 menit

function setCache(key, value) {
  CACHE.set(key, { value, exp: Date.now() + CACHE_TTL_MS });
}
function getCache(key) {
  const item = CACHE.get(key);
  if (!item) return null;
  if (Date.now() > item.exp) {
    CACHE.delete(key);
    return null;
  }
  return item.value;
}

// helper retry dengan jitter
async function withRetry(task, { retries = 2, baseDelay = 400 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await task();
    } catch (e) {
      lastErr = e;
      // hanya retry untuk error jaringan/timeout/5xx
      const msg = e?.message || "";
      if (attempt === retries || !/(timeout|fetch|network|ECONN|5\d\d|HTTP 5)/i.test(msg)) {
        break;
      }
      const jitter = Math.floor(Math.random() * 150);
      const delay = baseDelay * Math.pow(2, attempt) + jitter;
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export default async function fetchKpu(
  nik,
  { token = process.env.KPU_TOKEN, timeoutMs = 12_000 } = {}
) {
  if (!token) return { ok: false, error: "KPU_TOKEN not set" };

  // Cek cache dulu
  const cacheKey = `kpu:${nik}`;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  const body = {
    query: `
      {
        findNikSidalih (
          nik:"${nik}",
          wilayah_id:0,
          token:"${token}"
        ){
          nama, nik, nkk, provinsi, kabupaten, kecamatan, kelurahan,
          tps, alamat, lat, lon, metode
        }
      }
    `
  };

  try {
    const exec = async () => {
      const resp = await fetch(API_URL, {
        method: "POST",
        headers: {
          // header yang wajar untuk request GraphQL dari server
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          // Origin/Referer diset domain resmi mereka; beberapa server cek ini
          "Origin": "https://cekdptonline.kpu.go.id",
          "Referer": "https://cekdptonline.kpu.go.id",
          // User-Agent “normal” (bukan default Node) agar tidak dicurigai
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          // optional: minta gzip (undici/fetch handle otomatis)
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive"
        },
        body: JSON.stringify(body),
        signal: ac.signal,
        // penting di undici/Node20 untuk keep-alive
        dispatcher: agent
      });

      // Manual mapping beberapa status umum
      if (!resp.ok) {
        // 403/429 → kemungkinan rate limit/blocked; jangan spam, biarkan caller lihat pesan
        throw new Error(`HTTP ${resp.status}`);
      }

      const json = await resp.json().catch(() => ({}));
      const result = json?.data?.findNikSidalih ?? null;
      if (!result) return { ok: false, error: "Not found" };

      const google_maps_url =
        result.lat && result.lon ? `https://maps.google.com?q=${result.lat},${result.lon}` : null;

      return { ok: true, data: { ...result, google_maps_url } };
    };

    // jalankan dengan retry ringan
    const out = await withRetry(exec, { retries: 1, baseDelay: 500 });
    // simpan cache
    setCache(cacheKey, out);
    return out;
  } catch (e) {
    const err = e?.name === "AbortError" ? "timeout" : (e?.message || "fetch error");
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}
