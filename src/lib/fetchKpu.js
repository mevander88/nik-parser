// src/lib/fetchKpu.js
const API_URL = "https://cekdptonline.kpu.go.id/v2";

// Cache in-memory singkat (tidak persisten di serverless, tapi bantu anti-spam)
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

async function withRetry(task, { retries = 1, baseDelay = 500 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await task();
    } catch (e) {
      lastErr = e;
      const msg = e?.message || "";
      if (i === retries || !/(timeout|network|ECONN|5\d\d|HTTP 5)/i.test(msg)) break;
      const jitter = Math.floor(Math.random() * 150);
      await new Promise(r => setTimeout(r, baseDelay * 2 ** i + jitter));
    }
  }
  throw lastErr;
}

export default async function fetchKpu(
  nik,
  { token = process.env.KPU_TOKEN, timeoutMs = 12_000 } = {}
) {
  if (!token) return { ok: false, error: "KPU_TOKEN not set" };

  // cache
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
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
          "Origin": "https://cekdptonline.kpu.go.id",
          "Referer": "https://cekdptonline.kpu.go.id",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        },
        body: JSON.stringify(body),
        signal: ac.signal
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const json = await resp.json().catch(() => ({}));
      const result = json?.data?.findNikSidalih ?? null;

      if (!result) return { ok: false, error: "Not found" };

      const google_maps_url =
        result.lat && result.lon ? `https://maps.google.com?q=${result.lat},${result.lon}` : null;

      return { ok: true, data: { ...result, google_maps_url } };
    };

    const out = await withRetry(exec, { retries: 1, baseDelay: 500 });
    setCache(cacheKey, out);
    return out;
  } catch (e) {
    const err = e?.name === "AbortError" ? "timeout" : (e?.message || "fetch error");
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}
