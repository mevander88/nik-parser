// src/controllers/CekNik.js
import wilayah from "../data/wilayah.json" with { type: "json" };
import { successResponse, validationError, notFoundResponse } from "../utils/responseHandler.js";
import fetchKpu from "../lib/fetchKpu.js";

export default async function cekNik(req, res) {
  const nik = String(req.params?.nik ?? req.query?.nik ?? "").trim();

  if (nik.length !== 16) {
    return validationError(res, "Format NIK harus 16 digit");
  }

  const kodeProv = nik.substring(0, 2);
  const kodeKab  = nik.substring(0, 4);
  const kodeKec  = nik.substring(0, 6);

  const prov   = wilayah.provinsi?.[kodeProv];
  const kab    = wilayah.kabkot?.[kodeKab];
  const kecRaw = wilayah.kecamatan?.[kodeKec];

  if (!prov || !kab || !kecRaw) {
    return notFoundResponse(res, "Kode wilayah NIK tidak ditemukan");
  }

  const thisYY = new Date().getFullYear().toString().slice(-2);
  const yy    = nik.substring(10, 12);
  const ddRaw = parseInt(nik.substring(6, 8), 10);
  const mm    = nik.substring(8, 10);

  const [KEC, KODEPOS = ""] = String(kecRaw).toUpperCase().split(" -- ");
  const kelamin = ddRaw > 40 ? "PEREMPUAN" : "LAKI-LAKI";
  const dd = String(ddRaw > 40 ? ddRaw - 40 : ddRaw).padStart(2, "0");

  let yyyy = `19${yy}`;
  if (yy < thisYY) yyyy = `20${yy}`;

  const zodiak = (d, m) => {
    const L = +d, B = +m;
    if ((B===1 && L>=20) || (B===2 && L<19)) return "Aquarius";
    if ((B===2 && L>=19) || (B===3 && L<21)) return "Pisces";
    if ((B===3 && L>=21) || (B===4 && L<20)) return "Aries";
    if ((B===4 && L>=20) || (B===5 && L<21)) return "Taurus";
    if ((B===5 && L>=21) || (B===6 && L<22)) return "Gemini";
    if ((B===6 && L>=21) || (B===7 && L<23)) return "Cancer";
    if ((B===7 && L>=23) || (B===8 && L<23)) return "Leo";
    if ((B===8 && L>=23) || (B===9 && L<23)) return "Virgo";
    if ((B===9 && L>=23) || (B===10 && L<24)) return "Libra";
    if ((B===10 && L>=24) || (B===11 && L<23)) return "Scorpio";
    if ((B===11 && L>=23) || (B===12 && L<22)) return "Sagitarius";
    return "Capricorn";
  };

  const usiaDanUltah = (d, m, y) => {
    const now = new Date();
    const birth = new Date(+y, +m - 1, +d);
    let th = now.getFullYear() - birth.getFullYear();
    let bl = now.getMonth() - birth.getMonth();
    let hr = now.getDate() - birth.getDate();
    if (hr < 0) { hr += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); bl--; }
    if (bl < 0) { bl += 12; th--; }
    const next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
    if (next < now) next.setFullYear(now.getFullYear() + 1);
    const diff = next - now;
    const ub = Math.floor(diff / 2592e6);
    const uh = Math.floor((diff % 2592e6) / 864e5);
    return { usia: `${th} Tahun ${bl} Bulan ${hr} Hari`, ultah: `${ub} Bulan ${uh} Hari` };
  };

  const pasaranStr = (d, m, y) => {
    const base = new Date(1970, 0, 2);
    const lahir = new Date(+y, +m - 1, +d);
    const V = (lahir - base + 864e5) / 432e6;
    const idx = Math.round(10 * (V - Math.floor(V))) / 2;
    const pas = ["Wage","Kliwon","Legi","Pahing","Pon"][idx] ?? "";
    const hari = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"][lahir.getDay()];
    const bln  = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","Nopember","Desember"][+m - 1];
    return `${hari} ${pas}, ${+d} ${bln} ${y}`;
  };

  const { usia, ultah } = usiaDanUltah(dd, mm, yyyy);

  // --- KPU: normalisasi supaya selalu object ---
  let kpuRaw;
  try {
    kpuRaw = await fetchKpu(nik); // { ok:true, data:{...} } atau {ok:false,...}
  } catch (e) {
    kpuRaw = { ok: false, error: e?.message || "fetch error" };
  }
  const kpu = (kpuRaw && typeof kpuRaw === "object" && "ok" in kpuRaw) ? kpuRaw : { ok: false, error: "unavailable" };

  // Build payload — ambil nama dari KPU (sesuai permintaanmu)
  const payload = {
    nik,
    nama: kpu.ok ? (kpu.data?.nama ?? null) : null,   // << ambil dari KPU
    kelamin,
    lahir: `${dd}/${mm}/${yyyy}`,
    provinsi: prov,            // pakai mapping lokal (KPU kamu kadang null)
    kotakab: kab,              // pakai mapping lokal
    kecamatan: KEC,            // pakai mapping lokal
    uniqcode: nik.substring(12, 16),
    tambahan: {
      kodepos: KODEPOS,
      pasaran: pasaranStr(dd, mm, yyyy),
      usia,
      ultah: `${ultah} Lagi`,
      zodiak: zodiak(dd, mm)
    },
    // simpan data KPU raw (tanpa token), termasuk url gmaps
    kpu: kpu.ok ? {
      ok: true,
      data: {
        nik: kpu.data?.nik ?? null,
        nkk: kpu.data?.nkk ?? null,
        provinsi: kpu.data?.provinsi ?? null,
        kabupaten: kpu.data?.kabupaten ?? null,
        kecamatan: kpu.data?.kecamatan ?? null,
        kelurahan: kpu.data?.kelurahan ?? null,
        tps: kpu.data?.tps ?? null,
        alamat: kpu.data?.alamat ?? null,
        lat: kpu.data?.lat ?? null,
        lon: kpu.data?.lon ?? null,
        metode: kpu.data?.metode ?? null,
        google_maps_url: kpu.data?.google_maps_url ?? null,
      }
    } : { ok: false, error: kpu.error }
  };

  return successResponse(res, 200, "NIK valid", payload);
}
