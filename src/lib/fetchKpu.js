// src/lib/fetchKpu.js
import axios from "axios";

const API_URL = "https://cekdptonline.kpu.go.id/v2";

// Cache in-memory (serverless tidak persisten antar-cold start)
const CACHE = new Map();
const TTL = 5 * 60 * 1000; // 5 menit

const setCache = (k, v) => CACHE.set(k, { v, exp: Date.now() + TTL });
const getCache = (k) => {
  const it = CACHE.get(k);
  if (!it) return null;
  if (Date.now() > it.exp) { CACHE.delete(k); return null; }
  return it.v;
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/**
 * Satu attempt panggilan ke KPU pakai axios
 * @param {{ body: any, perAttemptTimeout: number, useOriginHeaders: boolean }}
 * @returns {Promise<{ok:boolean, data?:any, error?:string}>}
 */
function attemptAxios({ body, perAttemptTimeout, useOriginHeaders }) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  };
  if (useOriginHeaders) {
    headers["Origin"] = "https://cekdptonline.kpu.go.id";
    headers["Referer"] = "https://cekdptonline.kpu.go.id";
  }

  // axios timeout = keseluruhan request (ms)
  const req = axios.post(API_URL, body, {
    headers,
    timeout: perAttemptTimeout,
    // Lempar error untuk non-2xx
    validateStatus: (s) => s >= 200 && s < 300,
    responseType: "text", // baca mentah dulu biar bisa deteksi HTML block
    transitional: { clarifyTimeoutError: true },
  });

  // Hard-timeout ekstra via Promise.race (jaga-jaga)
  const hardCap = new Promise((_, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), perAttemptTimeout + 100);
    req.finally(() => clearTimeout(t));
  });

  return Promise.race([req, hardCap])
    .then(resp => {
      const raw = typeof resp.data === "string" ? resp.data : JSON.stringify(resp.data || {});
      if (raw.trim().startsWith("<")) {
        const err = new Error("HTML response (possibly blocked)");
        err.code = "HTML_BLOCK";
        throw err;
      }
      let json;
      try { json = typeof resp.data === "string" ? JSON.parse(resp.data) : resp.data; }
      catch { throw new Error("Invalid JSON from server"); }

      const result = json?.data?.findNikSidalih ?? null;
      if (!result) return { ok: false, error: "Not found" };

      const google_maps_url = (result.lat && result.lon)
        ? `https://maps.google.com?q=${result.lat},${result.lon}`
        : null;

      return { ok: true, data: { ...result, google_maps_url } };
    })
    .catch(err => {
      // Logging ringkas (tanpa token)
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const snippet = (typeof err.response?.data === "string" ? err.response.data : JSON.stringify(err.response?.data || ""))
          .slice(0, 300).replace(/\s+/g, " ");
        console.warn("[fetchKpu][axios]", {
          status,
          code: err.code,
          message: err.message,
          snippet
        });
        return { ok: false, error: status ? `HTTP ${status}${snippet ? `: ${snippet}` : ""}` : (err.code || err.message || "fetch failed") };
      } else {
        console.warn("[fetchKpu][error]", { message: err?.message || String(err) });
        return { ok: false, error: err?.message || "fetch failed" };
      }
    });
}

/**
 * Ambil data KPU (Axios) dengan retry + hard-timeout + cache (ESM)
 * @param {string} nik
 * @param {{ token?: string, timeoutMs?: number }} [opt]
 * @returns {Promise<{ok:boolean, data?:any, error?:string}>}
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
  return attemptAxios({ body, perAttemptTimeout: timeoutMs - 100, useOriginHeaders: false })
    .then(out => {
      setCache(cacheKey, out);
      return out;
    })
    .catch(e1 => {
      const m = String(e1?.error || e1?.message || "");
      // Retry hanya kalau indikasi diblok/timeout
      if (/^timeout$|HTML response|HTML_BLOCK|HTTP 403|HTTP 405/i.test(m)) {
        return sleep(200 + Math.floor(Math.random() * 200))
          .then(() => attemptAxios({ body, perAttemptTimeout: timeoutMs - 100, useOriginHeaders: true }))
          .then(out2 => {
            setCache(cacheKey, out2);
            return out2;
          })
          .catch(e2 => {
            const errMsg = e2?.error || e2?.message || "fetch failed";
            return { ok: false, error: errMsg };
          });
      }
      const errMsg = e1?.error || e1?.message || "fetch failed";
      return { ok: false, error: errMsg };
    });
}
