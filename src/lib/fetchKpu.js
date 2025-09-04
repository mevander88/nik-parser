// src/lib/fetchKpu.js
const API_URL = "https://cekdptonline.kpu.go.id/v2";

export default async function fetchKpu(nik, { token = process.env.KPU_TOKEN, timeoutMs = 7000 } = {}) {
  if (!token) return { ok: false, error: "KPU_TOKEN not set" };

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
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://cekdptonline.kpu.go.id",
        "Referer": "https://cekdptonline.kpu.go.id",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (NodeFetch)"
      },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    clearTimeout(timer);

    const json = await resp.json().catch(() => ({}));
    const result = json?.data?.findNikSidalih ?? null;

    if (!resp.ok) return { ok:false, error:`HTTP ${resp.status}` };
    if (!result)   return { ok:false, error:"Not found" };

    const google_maps_url = (result.lat && result.lon) ? `https://maps.google.com?q=${result.lat},${result.lon}` : null;
    return { ok:true, data: { ...result, google_maps_url } };
  } catch (e) {
    clearTimeout(timer);
    return { ok:false, error: e.name === "AbortError" ? "timeout" : (e.message || "fetch error") };
  }
}
