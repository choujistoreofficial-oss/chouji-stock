
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const supabaseAuth = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method tidak diizinkan." });
  }

  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ success: false, message: "Silakan login terlebih dahulu." });
    }

    const { data: authData, error: authError } =
      await supabaseAuth.auth.getUser(token);

    if (authError || !authData.user) {
      return res.status(401).json({ success: false, message: "Sesi login tidak valid." });
    }

    const amount = Number(req.body?.amount);

    if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 10000000) {
      return res.status(400).json({
        success: false,
        message: "Nominal deposit minimal Rp1.000 dan maksimal Rp10.000.000."
      });
    }

    const transactionCode =
      "CHJ" + Date.now().toString(36).toUpperCase() +
      crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();

    const { data, error } = await supabaseAdmin
      .from("deposit")
      .insert({
        transaction_code: transactionCode,
        user_id: authData.user.id,
        requested_amount: amount,
        admin_fee: 50,
        status: "MENUNGGU_PEMBAYARAN"
      })
      .select("id, transaction_code, requested_amount, admin_fee, status, created_at, expires_at")
      .single();

    if (error) {
      console.error("Deposit create error:", error);
      return res.status(500).json({
        success: false,
        message: "Gagal membuat transaksi deposit."
      });
    }

    return res.status(201).json({
      success: true,
      message: "Transaksi deposit berhasil dibuat.",
      deposit: data
    });
  } catch (error) {
    console.error("Deposit API error:", error);
    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server."
    });
  }
}
