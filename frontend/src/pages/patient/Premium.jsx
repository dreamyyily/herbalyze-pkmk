import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/MainLayout";
import {
  Crown, Zap, ShieldCheck, Stethoscope, CheckCircle2,
  RefreshCw, Clock, XCircle, Sparkles, ArrowRight, Star
} from "lucide-react";

import qrDana from "../../assets/qr-dana.jpeg";

const API = "http://localhost:8000";
const QUOTA_MAX = 5;

// ── Modal Pembayaran Manual ────────────────────────────────────────────────────────
function ManualPaymentModal({ onClose, onSuccess, userId }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("user_id", userId);
    formData.append("file_bukti", file);

    try {
      const res = await fetch(`${API}/api/premium/upload-proof`, {
        method: "POST",
        body: formData,
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.detail || "Gagal mengunggah bukti");
      alert("Bukti pembayaran berhasil diunggah! Mohon tunggu konfirmasi admin.");
      onSuccess(d.subscription); // ini akan me-refresh status
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-scale-in">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-300 hover:text-gray-500">
          <XCircle size={24} />
        </button>
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-amber-50 text-amber-700 px-3 py-1 rounded-full text-xs font-bold mb-3">
            <Crown size={12} /> PREMIUM — Rp 5.000 / bulan
          </div>
          <h3 className="text-xl font-extrabold text-gray-800">Transfer ke DANA</h3>
          <p className="text-gray-400 text-xs mt-1">Scan QR ini menggunakan aplikasi DANA</p>
        </div>

        {/* QR Code statis */}
        <div className="flex justify-center mb-5">
          <div className="bg-white border-2 border-gray-100 rounded-2xl p-4 shadow-inner">
            <img src={qrDana} alt="QR DANA" className="w-44 h-44 object-contain rounded-lg" />
          </div>
        </div>

        <div className="bg-gray-50 rounded-2xl p-4 mb-5 text-center">
          <p className="text-xs text-gray-400">Total Pembayaran</p>
          <p className="text-3xl font-extrabold text-gray-800">Rp 5.000</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <label className="text-sm font-semibold text-gray-700">Unggah Bukti Transfer</label>
          <input 
            type="file" 
            accept="image/*,application/pdf"
            onChange={(e) => setFile(e.target.files[0])}
            required
            className="text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer"
          />
          <button
            type="submit"
            disabled={loading || !file}
            className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold text-sm hover:shadow-lg transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? (
              <><div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> Mengunggah...</>
            ) : (
              <><ArrowRight size={14} /> Kirim Bukti</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main Premium Page ─────────────────────────────────────────────────────────
export default function Premium() {
  const navigate = useNavigate();
  const profile = JSON.parse(localStorage.getItem("user_profile") || "null");
  const userId = profile?.id;

  const [status, setStatus] = useState(null); // null=loading
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`${API}/api/premium/status/${userId}`);
      const d = await res.json();
      setStatus(d);
    } catch { setStatus({ is_premium: false, exact_match_count: 0, exact_match_quota: 5 }); }
  }, [userId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleUpgrade = () => {
    setShowModal(true);
  };

  const handlePaymentSuccess = async () => {
    setShowModal(false);
    fetchStatus(); // fetch ulang status untuk dapetin pending payment
  };

  const quotaUsed = status?.exact_match_count ?? 0;
  const quotaMax = status?.exact_match_quota ?? QUOTA_MAX;
  const quotaRemaining = Math.max(0, quotaMax - quotaUsed);
  const quotaPct = Math.min(100, (quotaUsed / quotaMax) * 100);

  const expiresAt = status?.expires_at ? new Date(status.expires_at) : null;
  const daysLeft = expiresAt
    ? Math.ceil((expiresAt - Date.now()) / 86400000)
    : 0;

  return (
    <MainLayout>
      {showModal && (
        <ManualPaymentModal
          userId={userId}
          onClose={() => setShowModal(false)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      <div className="absolute top-0 inset-x-0 h-[500px] bg-gradient-to-br from-amber-50/70 via-orange-50/40 to-transparent -z-10" />

      <div className="max-w-4xl mx-auto px-4 pt-16 pb-24">

        {/* Header */}
        <div className="text-center mb-10 animate-fade-in">
          <span className="inline-flex items-center gap-2 bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-bold tracking-wider uppercase mb-4">
            <Crown size={12} /> Herbalyze Premium
          </span>
          <h1 className="text-3xl md:text-4xl font-extrabold text-gray-800 mb-3">
            Upgrade ke Premium
          </h1>
          <p className="text-gray-500 max-w-lg mx-auto">
            Nikmati akses penuh fitur Herbalyze hanya dengan <strong className="text-amber-600">Rp 5.000 / bulan</strong>.
            Bayar via QRIS — DANA, GoPay, OVO, ShopeePay.
          </p>
        </div>

        {/* Status Card */}
        {!status ? (
          <div className="flex justify-center py-16">
            <div className="w-10 h-10 rounded-full border-4 border-gray-100 border-t-amber-400 animate-spin" />
          </div>
        ) : status.is_premium ? (
          /* ── PREMIUM AKTIF ── */
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-8 text-white shadow-2xl shadow-orange-200 mb-8">
            <div className="flex items-start justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Crown size={22} />
                  <span className="font-extrabold text-xl">Premium Aktif</span>
                  <span className="bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    ✓ Terverifikasi
                  </span>
                </div>
                <p className="text-orange-100 text-sm">
                  Berakhir dalam <strong className="text-white">{daysLeft} hari</strong>
                  {expiresAt && (
                    <span className="ml-1 opacity-75">
                      ({expiresAt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })})
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-white/20 rounded-2xl px-5 py-3 text-center">
                <p className="text-orange-100 text-xs">Exact Matching</p>
                <p className="text-2xl font-extrabold">∞</p>
                <p className="text-orange-100 text-xs">Unlimited</p>
              </div>
            </div>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { icon: <Stethoscope size={16} />, label: "Rekam Medis Dokter", desc: "Akses penuh" },
                { icon: <Zap size={16} />, label: "Exact Matching", desc: "Unlimited" },
                { icon: <Sparkles size={16} />, label: "AI Search", desc: "Prioritas" },
              ].map((f) => (
                <div key={f.label} className="bg-white/15 rounded-xl p-3 flex items-center gap-3">
                  <span className="text-white/70">{f.icon}</span>
                  <div>
                    <p className="text-sm font-semibold">{f.label}</p>
                    <p className="text-xs text-orange-100">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── FREE USER ── */
          <>
            {/* Quota Card */}
            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-7 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-extrabold text-gray-800 flex items-center gap-2">
                    <Zap size={18} className="text-amber-500" /> Kuota Exact Matching
                  </h2>
                  <p className="text-sm text-gray-400 mt-0.5">Sisa kuota seumur hidup akun Anda</p>
                </div>
                <div className="text-right">
                  <span className={`text-3xl font-extrabold ${quotaRemaining === 0 ? "text-red-500" : "text-gray-800"}`}>
                    {quotaRemaining}
                  </span>
                  <span className="text-gray-400 text-sm">/{quotaMax}</span>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-3 rounded-full transition-all duration-700 ${
                    quotaPct >= 100 ? "bg-red-400" : quotaPct >= 60 ? "bg-amber-400" : "bg-green-400"
                  }`}
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
              {quotaRemaining === 0 && (
                <p className="mt-3 text-xs text-red-500 font-semibold flex items-center gap-1">
                  <XCircle size={13} /> Kuota habis — upgrade ke Premium untuk unlimited
                </p>
              )}
            </div>
            
            {status.pending_payment && (
              <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 mb-6 flex flex-col sm:flex-row items-center gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Clock size={24} className="text-amber-600 animate-pulse" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h3 className="font-bold text-amber-800">Menunggu Konfirmasi Admin</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Bukti pembayaran Anda sedang diverifikasi. Akun Anda akan segera menjadi Premium setelah admin menyetujuinya.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Feature Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {/* Free Card */}
          <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-gray-700">Free</h3>
              <span className="text-2xl font-extrabold text-gray-800">Rp 0</span>
            </div>
            <ul className="space-y-3">
              {[
                { ok: true,  text: "Rekomendasi Herbal AI (SBERT)" },
                { ok: true,  text: `Exact Matching — ${quotaMax}x seumur hidup` },
                { ok: false, text: "Exact Matching — Unlimited" },
                { ok: false, text: "Rekam Medis Dokter" },
              ].map((f, i) => (
                <li key={i} className={`flex items-center gap-3 text-sm ${f.ok ? "text-gray-700" : "text-gray-300"}`}>
                  {f.ok
                    ? <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                    : <XCircle size={16} className="text-gray-200 flex-shrink-0" />
                  }
                  {f.text}
                </li>
              ))}
            </ul>
          </div>

          {/* Premium Card */}
          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl shadow-xl shadow-orange-200 p-7 relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <Star size={40} className="text-white/10 fill-white/10" />
            </div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-extrabold text-white flex items-center gap-2">
                <Crown size={18} /> Premium
              </h3>
              <span className="text-2xl font-extrabold text-white">Rp 5.000<span className="text-sm font-medium text-orange-100">/bln</span></span>
            </div>
            <ul className="space-y-3 mb-6">
              {[
                "Rekomendasi Herbal AI (SBERT)",
                "Exact Matching — Unlimited",
                "Rekam Medis Dokter — Akses Penuh",
                "Akses 30 hari, renewal kapan saja",
              ].map((f, i) => (
                <li key={i} className="flex items-center gap-3 text-sm text-white">
                  <CheckCircle2 size={16} className="text-green-300 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            {!status?.is_premium && !status?.pending_payment && (
              <button
                id="btn-upgrade-premium"
                onClick={handleUpgrade}
                className="w-full py-4 rounded-2xl bg-white text-amber-600 font-extrabold text-base hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Crown size={16} /> Upgrade Sekarang <ArrowRight size={16} />
              </button>
            )}
            {!status?.is_premium && status?.pending_payment && (
              <button
                disabled
                className="w-full py-4 rounded-2xl bg-white/50 text-amber-100 font-bold text-base flex items-center justify-center gap-2 cursor-not-allowed"
              >
                <Clock size={16} /> Menunggu Persetujuan
              </button>
            )}
          </div>
        </div>

        {/* Cara Bayar */}
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-7">
          <h3 className="font-extrabold text-gray-800 mb-5 flex items-center gap-2">
            <RefreshCw size={18} className="text-primary-40" /> Cara Upgrade Premium
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { step: "1", text: "Klik \"Upgrade Sekarang\"" },
              { step: "2", text: "Scan QR DANA menggunakan aplikasi" },
              { step: "3", text: "Upload screenshot bukti transfer" },
              { step: "4", text: "Tunggu admin memverifikasi pembayaran ✓" },
            ].map((s) => (
              <div key={s.step} className="flex flex-col items-center text-center gap-2">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white font-extrabold flex items-center justify-center shadow-md shadow-orange-200">
                  {s.step}
                </div>
                <p className="text-sm text-gray-600 leading-snug">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 flex items-center gap-2 text-xs text-gray-400 justify-center">
            <ShieldCheck size={12} className="text-green-400" /> Proses verifikasi admin memakan waktu 1x24 jam
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
