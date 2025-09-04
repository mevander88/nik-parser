// src/lib/fetchKpu.js
const API_URL = "https://cekdptonline.kpu.go.id/v2";

// Cache in-memory (serverless tidak persisten, tapi mengurangi spam antar-cold start)
const CACHE = new Map();
const TTL = 5 * 60 * 1000; // 5 menit

function setCache(key, value) {
  CACHE.set(key, { value, exp: Date.now() + TTL });
}
function getCache(key) {
  const it = CACHE.get(key);
  if (!it) return null;
  if (Date.now() > it.exp) { CACHE.delete(key); return null; }
  return it.value;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// buat satu attempt fetch (tanpa/ dengan Origin/Referer), pure Promise
function attemptFetch({ body, timeoutMs, useOriginHeaders }) {
  const ac = new AbortController();

  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
  };
  if (useOriginHeaders) {
    headers["Origin"] = "https://cekdptonline.kpu.go.id";
    headers["Referer"] = "https://cekdptonline.kpu.go.id";
  }

  const fetchPromise =
    fetch(API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ac.signal
    })
    .then(resp => {
      if (!resp.ok) {
        // Ambil sedikit isi untuk konteks
        return resp.text().catch(() => "").then(text => {
          const snippet = (text || "").slice(0, 300).replace(/\s+/g, " ");
          const err = new Error(`HTTP ${resp.status}${snippet ? `: ${snippet}` : ""}`);
          throw err;
        });
      }
      // Baca sebagai text dulu supaya bisa deteksi HTML block
      return resp.text();
    })
    .then(raw => {
      if (typeof raw === "string" && raw.trim().startsWith("<")) {
        throw new Error("HTML response (possibly blocked)");
      }
      let json;
      try { json = typeof raw === "string" ? JSON.parse(raw) : raw; }
      catch { throw new Error("Invalid JSON from server"); }

      const result = json?.data?.findNikSidalih ?? null;
      if (!result) return { ok: false, error: "Not found" };

      const google_maps_url =
        result.lat && result.lon ? `https://maps.google.com?q=${result.lat},${result.lon}` : null;

      return { ok: true, data: { ...result, google_maps_url } };
    });

  // Hard timeout dengan Promise.race
  const timeoutPromise = new Promise((_, reject) => {
    const t = setTimeout(() => {
      try { ac.abort(); } catch {}
      reject(new Error("timeout"));
    }, timeoutMs);
    // cleanup ketika fetch selesai
    fetchPromise.finally(() => clearTimeout(t));
  });

  return Promise.race([fetchPromise, timeoutPromise]);
}

/**
 * Ambil data dari KPU (Promise-style, tanpa async/await)
 * - Coba TANPA Origin/Referer dulu
 * - Jika 403/405/HTML → retry sekali DENGAN Origin/Referer
 * - Punya hard-timeout per attempt
 *
 * @param {string} nik
 * @param {{token?: string, timeoutMs?: number}} [opt]
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export default function fetchKpu(
  nik,
  { token = process.env.KPU_TOKEN, timeoutMs = (process.env.VERCEL ? 2200 : 8000) } = {}
) {
  if (!token) return Promise.resolve({ ok: false, error: "KPU_TOKEN not set" });

  const cacheKey = `kpu:${nik}`;
  const cached = getCache(cacheKey);
  if (cached) return Promise.resolve(cached);

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

  // Attempt 1: tanpa Origin/Referer
  return attemptFetch({ body, timeoutMs, useOriginHeaders: false })
    .then(out => {
      setCache(cacheKey, out);
      return out;
    })
    .catch(e1 => {
      const msg = String(e1 && e1.message || "");
      // Hanya retry kalau indikasi diblok/di-restrict
      if (/^timeout$|HTML response|HTTP 403|HTTP 405/i.test(msg)) {
        // jitter pendek sebelum retry
        return sleep(200 + Math.floor(Math.random() * 200))
          .then(() => attemptFetch({ body, timeoutMs, useOriginHeaders: true }))
          .then(out2 => {
            setCache(cacheKey, out2);
            return out2;
          })
          .catch(e2 => {
            const err = (e2 && e2.name === "AbortError") ? "timeout" : (e2 && e2.message) || "fetch failed";
            return { ok: false, error: err };
          });
      }
      // error lain: langsung propagate hasil gagal standar
      const err = (e1 && e1.name === "AbortError") ? "timeout" : (e1 && e1.message) || "fetch failed";
      return { ok: false, error: err };
    });
}
