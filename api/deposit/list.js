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
      await supabaseAuth.auth.getUser(token);

    if (authError || !auth.user) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak valid."
      });
    }

    const { data: adminRecord, error: adminError } =
      await supabaseAdmin
        .from("admin_users")
        .select("user_id")
        .eq("user_id", auth.user.id)
        .maybeSingle();

    if (adminError || !adminRecord) {
      return res.status(403).json({
        success: false,
        message: "Akses khusus admin."
      });
    }

    const { data, error } = await supabaseAdmin
      .from("deposit")
      .select(`
        id,
        transaction_code,
        user_id,
        requested_amount,
        received_amount,
        admin_fee,
        credited_amount,
        status,
        created_at,
        expires_at,
        processed_at
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Deposit list error:", error);

      return res.status(500).json({
        success: false,
        message: "Gagal mengambil daftar deposit."
      });
    }

    return res.status(200).json({
      success: true,
      total: data.length,
      deposits: data
    });

  } catch (error) {
    console.error("Deposit list API error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server."
    });
  }
}
