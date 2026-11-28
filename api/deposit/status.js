
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method tidak diizinkan."
    });
  }

  try {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Silakan login terlebih dahulu."
      });
    }

    const { data: auth, error: authError } =
      await authClient.auth.getUser(token);

    if (authError || !auth.user) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak valid."
      });
    }

    const transactionCode = req.query?.transaction_code;

    if (
      typeof transactionCode !== "string" ||
      !/^CHJ[A-Z0-9]+$/.test(transactionCode)
    ) {
      return res.status(400).json({
        success: false,
        message: "Kode transaksi tidak valid."
      });
    }

    const { data: deposit, error } = await supabase
      .from("deposit")
      .select(`
        id,
        transaction_code,
        requested_amount,
        received_amount,
        admin_fee,
        credited_amount,
        status,
        created_at,
        expires_at,
        processed_at
      `)
      .eq("transaction_code", transactionCode)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      console.error("Deposit status error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil status transaksi."
      });
    }

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan."
      });
    }

    return res.status(200).json({
      success: true,
      deposit: {
        ...deposit,
        amount_received: deposit.received_amount,
        amount_credited: deposit.credited_amount
      }
    });

  } catch (error) {
    console.error("Deposit status API error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server."
    });
  }
}
