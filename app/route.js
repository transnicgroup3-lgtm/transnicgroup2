import { supabase } from "../../../../lib/supabase";
import { fetchYandexDrivers, fetchYandexDailyEarnings, computeParkCommission } from "../../../../lib/yandexFleet";

function todayChisinauISO() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Chisinau",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Returnează situația curentă din Supabase pentru o zi (fără să cheme Yandex). */
async function loadFromSupabase(date) {
  const { data: drivers, error } = await supabase
    .from("drivers")
    .select("*, daily_earnings(*)")
    .eq("daily_earnings.date", date)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);

  return (drivers || []).map((d) => {
    const earning = (d.daily_earnings && d.daily_earnings[0]) || null;
    return {
      driver_id: d.id,
      yandex_driver_id: d.yandex_driver_id,
      full_name: d.full_name,
      phone_number: d.phone_number,
      car_plate: d.car_plate,
      is_active: d.is_active,
      total_cash: earning ? Number(earning.total_cash) : 0,
      total_card: earning ? Number(earning.total_card) : 0,
      total_gross: earning ? Number(earning.total_gross) : 0,
      yandex_commission: earning ? Number(earning.yandex_commission) : 0,
      park_commission: earning ? Number(earning.park_commission) : 0,
      net_payout: earning ? Number(earning.net_payout) : 0,
      has_data: !!earning,
    };
  });
}

/** GET /api/yandex/sync?date=YYYY-MM-DD — citește direct din Supabase, fără să bată la Yandex. */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") || todayChisinauISO();

  try {
    const rows = await loadFromSupabase(date);
    return Response.json({ date, rows });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

/** POST /api/yandex/sync  body: { date?: "YYYY-MM-DD" } — sincronizează cu Yandex Fleet API. */
export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    // fără body e ok, folosim ziua curentă
  }
  const date = body.date || todayChisinauISO();

  try {
    // 1) Sincronizează lista de șoferi
    const yandexDrivers = await fetchYandexDrivers();
    if (yandexDrivers.length) {
      const { error: upsertDriversError } = await supabase
        .from("drivers")
        .upsert(yandexDrivers, { onConflict: "yandex_driver_id" });
      if (upsertDriversError) throw new Error(`Supabase (drivers): ${upsertDriversError.message}`);
    }

    // 2) Ia harta driver -> id intern (uuid) din Supabase
    const { data: dbDrivers, error: dbDriversError } = await supabase
      .from("drivers")
      .select("id, yandex_driver_id");
    if (dbDriversError) throw new Error(`Supabase (drivers select): ${dbDriversError.message}`);
    const idByYandexId = new Map(dbDrivers.map((d) => [d.yandex_driver_id, d.id]));

    // 3) Ia încasările din Yandex pentru ziua selectată
    const { perDriver, debugSample } = await fetchYandexDailyEarnings(date);

    const earningsRows = [];
    for (const [yandexDriverId, sums] of perDriver.entries()) {
      const driverId = idByYandexId.get(yandexDriverId);
      if (!driverId) continue; // șofer necunoscut în Supabase (nu era în lista de profiluri)

      const totalGross = Math.round((sums.cash + sums.card) * 100) / 100;
      const yandexCommission = Math.round(sums.yandexCommission * 100) / 100;
      const parkCommission = computeParkCommission(totalGross);
      const netPayout = Math.round((totalGross - yandexCommission - parkCommission) * 100) / 100;

      earningsRows.push({
        driver_id: driverId,
        date,
        total_cash: Math.round(sums.cash * 100) / 100,
        total_card: Math.round(sums.card * 100) / 100,
        total_gross: totalGross,
        yandex_commission: yandexCommission,
        park_commission: parkCommission,
        net_payout: netPayout,
      });
    }

    if (earningsRows.length) {
      const { error: upsertEarningsError } = await supabase
        .from("daily_earnings")
        .upsert(earningsRows, { onConflict: "driver_id,date" });
      if (upsertEarningsError) throw new Error(`Supabase (daily_earnings): ${upsertEarningsError.message}`);
    }

    const rows = await loadFromSupabase(date);
    return Response.json({ date, rows, synced: earningsRows.length, debugSample });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
