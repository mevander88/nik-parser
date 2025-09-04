// src/lib/fetchKpu.js
const API_URL = "https://cekdptonline.kpu.go.id/v2";

// cache sederhana 5 menit (tidak persisten di serverless)
const CACHE = new Map();
const TTL = 5 * 60 * 1000;
const setCache = (k, v) => CACHE.set(k, { v, exp: Date.now() + TTL });
const getCache = (k) => {
  const it = CACHE.get(k);
  if (!it) return null;
  if (Date.now() > it.exp) { CACHE.delete(k); return null; }
  return it.v;
};

// sleep helper
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function tryFetch({ body, signal, useOriginHeaders = false }) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    // User-Agent “normal”
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };
  if (useOriginHeaders) {
    headers["Origin"] = "https://cekdptonline.kpu.go.id";
    headers["Referer"] = "https://cekdptonline.kpu.go.id";
  }

  const resp = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });

  // kalau response bukan 2xx → lempar error dengan sedikit konteks (max 300 chars)
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    const snippet = text.slice(0, 300).replace(/\s+/g, " ");
    throw new Error(`HTTP ${resp.status}${snippet ? `: ${snippet}` : ""}`);
  }

  // kadang balik HTML (diblock) — deteksi cepat
  const raw = await resp.text();
  if (raw.trim().startsWith("<")) {
    throw new Error("HTML response (possibly blocked)");
  }

  // parse JSON aman
  let json;
  try { json = JSON.parse(raw); }
  catch { throw new Error("Invalid JSON from server"); }

  const result = json?.data?.findNikSidalih ?? null;
  if (!result) return { ok: false, error: "Not found" };

  const google_maps_url =
    result.lat && result.lon ? `https://maps.google.com?q=${result.lat},${result.lon}` : null;

  return { ok: true, data: { ...result, google_maps_url } };
}

/**
 * Ambil data dari KPU dengan header minimal, retry, dan timeout
 * @param {string} nik
 * @param {{token?: string, timeoutMs?: number}} [opt]
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export default async function fetchKpu(
  nik,
  { token = process.env.KPU_TOKEN, timeoutMs = 12_000 } = {}
) {
  if (!token) return { ok: false, error: "KPU_TOKEN not set" };

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
    `,
  };

  try {
    // Attempt 1: TANPA Origin/Referer
    try {
      const out = await tryFetch({ body, signal: ac.signal, useOriginHeaders: false });
      setCache(cacheKey, out);
      return out;
    } catch (e1) {
      // Jika 403/405/HTML, coba sekali lagi DENGAN Origin/Referer
      const msg = String(e1?.message || "");
      if (/HTTP 403|HTTP 405|HTML response/i.test(msg)) {
        await wait(300 + Math.floor(Math.random() * 200)); // jitter kecil
        const out2 = await tryFetch({ body, signal: ac.signal, useOriginHeaders: true });
        setCache(cacheKey, out2);
        return out2;
      }
      throw e1; // error lain: lempar ke luar
    }
  } catch (e) {
    const err = e?.name === "AbortError" ? "timeout" : (e?.message || "fetch failed");
    // NB: jangan log token; kalau mau logging: console.error("[KPU]", err);
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}
