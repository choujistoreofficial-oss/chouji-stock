
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
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

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

    const {
      id_pesanan,
      product_id,
      nama_pesanan,
      detail_tambahan
    } = req.body || {};

    if (
      typeof id_pesanan !== "string" ||
      !/^[A-Za-z0-9_-]{6,80}$/.test(id_pesanan)
    ) {
      return res.status(400).json({
        success: false,
        message: "ID pesanan tidak valid."
      });
    }

    const productId = Number(product_id);

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Produk tidak valid."
      });
    }

    const customerName =
      typeof nama_pesanan === "string"
        ? nama_pesanan.trim().slice(0, 100)
        : "";

    const extraDetail =
      typeof detail_tambahan === "string"
        ? detail_tambahan.trim().slice(0, 500)
        : null;

    const { data, error } = await supabaseAdmin.rpc(
      "buat_pesanan_dengan_hold",
      {
        p_id_pesanan: id_pesanan,
        p_product_id: productId,
        p_user_id: auth.user.id,
        p_nama_pesanan: customerName || "Player",
        p_detail_tambahan: extraDetail
      }
    );

    if (error) {
      console.error("Order create error:", error);

      return res.status(400).json({
        success: false,
        message: error.message || "Gagal membuat pesanan."
      });
    }

    return res.status(201).json({
      success: true,
      message: "Pesanan berhasil dibuat. Saldo ditahan sementara.",
      order: data
    });

  } catch (error) {
    console.error("Order API error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan pada server."
    });
  }
}
