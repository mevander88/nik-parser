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

// ==== REGION SPOOF HELPERS (tanpa proxy) ====

// Kumpulan IP publik Indonesia (acak beberapa blok umum). Boleh tambah sendiri.
const INDO_IP_POOL = [
  // Telkomsel / Indihome / XL / Biznet / MyRepublic (contoh publik)
  "36.91.102.77", "36.91.123.10", "36.68.1.20", "36.84.56.200",
  "103.23.200.10", "103.247.8.15", "114.124.1.33", "103.13.32.40",
  "112.215.200.9", "139.0.24.18", "152.118.24.10", "103.47.132.55"
];
const pickIndoIp = () => INDO_IP_POOL[Math.floor(Math.random() * INDO_IP_POOL.length)];

// Dua variasi UA (desktop & mobile) untuk fallback
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";
const UA_MOBILE =
  "Mozilla/5.0 (Linux; Android 12; M2102J20SG) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36";

function buildHeaders({ useOriginHeaders = false, spoofRegion = false, mobileUA = false }) {
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
    "User-Agent": mobileUA ? UA_MOBILE : UA_DESKTOP,
    // Kadang detektor memeriksa sec-ch-*; tambahkan agar terlihat seperti browser beneran
    "sec-ch-ua": "\"Chromium\";v=\"121\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"121\"",
    "sec-ch-ua-mobile": mobileUA ? "?1" : "?0",
    "sec-ch-ua-platform": mobileUA ? "\"Android\"" : "\"Windows\"",
  };

  if (useOriginHeaders) {
    headers["Origin"] = "https://cekdptonline.kpu.go.id";
    headers["Referer"] = "https://cekdptonline.kpu.go.id/";
  }

  if (spoofRegion) {
    const ip = pickIndoIp();
    // Header yang kadang dipakai aplikasi (naif) untuk infer lokasi
    headers["X-Forwarded-For"] = ip;
    headers["X-Real-IP"] = ip;
    headers["Forwarded"] = `for=${ip};proto=https`;
    // Beberapa stack (terutama di balik Cloudflare) melihat ini
    headers["CF-IPCountry"] = "ID";
    // Tambahan kecil lain
    headers["X-Geo-Country"] = "ID";
  }

  return headers;
}

async function tryFetch({ body, signal, headerMode = "normal" }) {
  const headers =
    headerMode === "normal"
      ? buildHeaders({ useOriginHeaders: false, spoofRegion: false, mobileUA: false })
    : headerMode === "origin"
      ? buildHeaders({ useOriginHeaders: true, spoofRegion: false, mobileUA: false })
    : headerMode === "spoof1"
      ? buildHeaders({ useOriginHeaders: true, spoofRegion: true, mobileUA: false })
      : buildHeaders({ useOriginHeaders: true, spoofRegion: true, mobileUA: true }); // "spoof2"

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
 * Ambil data dari KPU dengan header minimal, retry, timeout, dan spoof region (tanpa proxy)
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
    // Attempt 1: NORMAL (tanpa Origin/Referer)
    try {
      const out = await tryFetch({ body, signal: ac.signal, headerMode: "normal" });
      setCache(cacheKey, out);
      return out;
    } catch (e1) {
      const msg1 = String(e1?.message || "");
      // Attempt 2: +Origin/Referer
      if (/HTTP 403|HTTP 405|HTML response|Invalid JSON|Failed to fetch/i.test(msg1)) {
        await wait(200 + Math.floor(Math.random() * 200));
        try {
          const out2 = await tryFetch({ body, signal: ac.signal, headerMode: "origin" });
          setCache(cacheKey, out2);
          return out2;
        } catch (e2) {
          const msg2 = String(e2?.message || "");
          // Attempt 3: Spoof region (desktop UA)
          if (/HTTP 403|HTTP 405|HTML response|Invalid JSON/i.test(msg2)) {
            await wait(250 + Math.floor(Math.random() * 250));
            try {
              const out3 = await tryFetch({ body, signal: ac.signal, headerMode: "spoof1" });
              setCache(cacheKey, out3);
              return out3;
            } catch (e3) {
              const msg3 = String(e3?.message || "");
              // Attempt 4: Spoof region + Mobile UA (beberapa WAF beda policy untuk mobile)
              if (/HTTP 403|HTTP 405|HTML response|Invalid JSON/i.test(msg3)) {
                await wait(300 + Math.floor(Math.random() * 300));
                const out4 = await tryFetch({ body, signal: ac.signal, headerMode: "spoof2" });
                setCache(cacheKey, out4);
                return out4;
              }
              throw e3;
            }
          }
          throw e2;
        }
      }
      throw e1;
    }
  } catch (e) {
    const err = e?.name === "AbortError" ? "timeout" : (e?.message || "fetch failed");
    return { ok: false, error: err };
  } finally {
    clearTimeout(timer);
  }
}
