
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const authClient = createClient(
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
      await authClient.auth.getUser(token);

    if (authError || !auth.user) {
      return res.status(401).json({
        success: false,
        message: "Sesi login tidak valid."
      });
    }

    const { transaction_code } = req.body || {};

    if (
      typeof transaction_code !== "string" ||
      !/^CHJ[A-Z0-9]+$/.test(transaction_code)
    ) {
      return res.status(400).json({
        success: false,
        message: "Kode transaksi tidak valid."
      });
    }

    const { data: deposit, error: findError } = await supabase
      .from("deposit")
      .select("*")
      .eq("transaction_code", transaction_code)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (findError || !deposit) {
      return res.status(404).json({
        success: false,
        message: "Transaksi tidak ditemukan."
      });
    }

    if (deposit.status === "SUCCESS") {
      return res.status(200).json({
        success: true,
        message: "Pembayaran sudah berhasil.",
        status: deposit.status
      });
    }

    if (deposit.status === "CANCELLED") {
      return res.status(400).json({
        success: false,
        message: "Transaksi sudah dibatalkan."
      });
    }

    if (deposit.status === "SEDANG_DIPROSES") {
      return res.status(200).json({
        success: true,
        message: "Pembayaran sedang diperiksa admin.",
        status: deposit.status
      });
    }

    if (new Date(deposit.expires_at).getTime() <= Date.now()) {
      const { error: cancelError } = await supabase
        .from("deposit")
        .update({
          status: "CANCELLED",
          updated_at: new Date().toISOString()
        })
        .eq("id", deposit.id)
        .eq("status", "MENUNGGU_PEMBAYARAN");

      if (cancelError) throw cancelError;

      return res.status(400).json({
        success: false,
        message: "Waktu pembayaran sudah habis.",
        status: "CANCELLED"
      });
    }

    const { data: updated, error: updateError } = await supabase
      .from("deposit")
      .update({
        status: "SEDANG_DIPROSES",
        updated_at: new Date().toISOString()
      })
      .eq("id", deposit.id)
      .eq("status", "MENUNGGU_PEMBAYARAN")
      .select("*")
      .maybeSingle();

    if (updateError) throw updateError;

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Status transaksi berubah. Silakan periksa kembali."
      });
    }

    if (
      process.env.GMAIL_USER &&
      process.env.GMAIL_APP_PASSWORD &&
      process.env.ADMIN_EMAIL
    ) {
      try {
        const transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
          }
        });

        await transporter.sendMail({
          from: process.env.GMAIL_USER,
          to: process.env.ADMIN_EMAIL,
          subject: "Deposit CHOUJI STOCK perlu diperiksa",
          text: [
            "Ada pelanggan yang meminta pemeriksaan pembayaran.",
            "",
            `Kode transaksi: ${updated.transaction_code}`,
            `Nominal diminta: Rp${Number(updated.requested_amount).toLocaleString("id-ID")}`,
            `Biaya admin: Rp${Number(updated.admin_fee).toLocaleString("id-ID")}`,
            `User ID: ${updated.user_id}`,
            "",
            "Silakan periksa dana masuk di DANA dan konfirmasi melalui admin CHOUJI STOCK."
          ].join("\n")
        });
      } catch (mailError) {
        console.error("Gmail notification error:", mailError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Pembayaran dikirim untuk pemeriksaan admin.",
      status: updated.status
    });

  } catch (error) {
    console.error("Deposit check error:", error);

    return res.status(500).json({
      success: false,
      message: "Terjadi kesalahan saat memeriksa pembayaran."
    });
  }
}
