
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
      await supabaseAuth.auth.getUser(token);

    if (authError || !auth.user) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak valid."
      });
    }

    // Pastikan pengguna benar-benar admin.
    const { data: isAdmin, error: adminError } = await supabaseAdmin
      .rpc("is_admin", {}, { head: false });

    // Periksa keanggotaan admin berdasarkan ID akun yang login.
    const { data: adminRecord, error: adminCheckError } =
      await supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();

    if (adminCheckError || !adminRecord) {
      return res.status(403).json({
        success: false,
        message: "Akses khusus admin."
      });
    }

    const { deposit_id, received_amount } = req.body || {};

    if (
      typeof deposit_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deposit_id)
    ) {
      return res.status(400).json({
        success: false,
        message: "ID transaksi tidak valid."
      });
    }

    const amount = Number(received_amount);

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 50 ||
      amount > 10000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Nominal uang masuk tidak valid."
      });
    }

    const { data, error } = await supabaseAdmin.rpc(
      "konfirmasi_deposit",
      {
        p_deposit_id: deposit_id,
        p_received_amount: amount
      }
    );

    if (error) {
      console.error("Deposit confirmation error:", error);

      return res.status(400).json({
        success: false,
        message: error.message || "Gagal mengonfirmasi deposit."
      });
    }

    return res.status(200).json({
      success: true,
      message: data.already_processed
        ? "Transaksi sudah pernah dikonfirmasi."
        : "Deposit berhasil dikonfirmasi dan saldo ditambahkan.",
      result: data
    });

  } catch (error) {
    console.error("Confirm API error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server."
    });
  }
}
