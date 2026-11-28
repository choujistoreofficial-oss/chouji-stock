
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method tidak diizinkan."
    });
  }

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;

  if (!secret || authorization !== `Bearer ${secret}`) {
    return res.status(401).json({
      success: false,
      message: "Akses ditolak."
    });
  }

  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("deposit")
      .update({
        status: "CANCELLED",
        updated_at: now
      })
      .eq("status", "MENUNGGU_PEMBAYARAN")
      .lte("expires_at", now)
      .select("id, transaction_code");

    if (error) {
      console.error("Deposit expire error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal membatalkan transaksi kedaluwarsa."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pemeriksaan transaksi kedaluwarsa selesai.",
      cancelled: data.length,
      transactions: data
    });

  } catch (error) {
    console.error("Expire API error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server."
    });
  }
}
