import React, { useState, useEffect } from "react";
import MainLayout from "../../layouts/MainLayout";
import Avatar from "../../components/Avatar";
import { Users, UserCheck, RefreshCw, ShieldCheck } from "lucide-react";

// ─── Toast Component ────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-4 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-md max-w-sm w-full
            transform transition-all duration-500 animate-slide-in
            ${t.type === "success" ? "bg-white/90 border-green-200 text-green-800" :
              t.type === "error"   ? "bg-white/90 border-red-200 text-red-800" :
              t.type === "warning" ? "bg-white/90 border-orange-200 text-orange-800" :
                                     "bg-white/90 border-blue-200 text-blue-800"}`}
        >
          <span className="text-2xl mt-0.5 flex-shrink-0">
            {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warning" ? "⚠️" : "ℹ️"}
          </span>
          <div className="flex-1">
            {t.title && <p className="font-bold text-sm mb-0.5">{t.title}</p>}
            <p className="text-sm leading-relaxed">{t.message}</p>
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-gray-400 hover:text-gray-600 transition text-lg leading-none flex-shrink-0 mt-0.5"
          >×</button>
        </div>
      ))}
    </div>
  );
}

export default function PerizinanDokter() {
  const profile = JSON.parse(localStorage.getItem("user_profile") || "null");
  const userId = profile?.id;

  const [doctors, setDoctors] = useState([]);
  const [consentMap, setConsentMap] = useState({});
  const [isLoadingDoctors, setIsLoadingDoctors] = useState(false);
  const [loadingConsent, setLoadingConsent] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("semua");
  const [currentPageSemua, setCurrentPageSemua] = useState(1);
  const [currentPageDiizinkan, setCurrentPageDiizinkan] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [toasts, setToasts] = useState([]);

  const showToast = (type, title, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  useEffect(() => {
  setCurrentPageSemua(1);
  setCurrentPageDiizinkan(1);
}, [searchQuery]);

  const fetchDoctors = async () => {
    setIsLoadingDoctors(true);
    try {
      const response = await fetch("http://localhost:8000/api/doctors");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mengambil daftar dokter");

    const filteredDoctorList = (data.doctors || []).filter(
      (doc) => doc.id !== userId
    );

    setDoctors(filteredDoctorList);

      // cek consent
      if (userId && data.doctors?.length > 0) {
        await checkAllConsents(filteredDoctorList);
      }
    } catch (err) {
      console.error("Gagal fetch daftar dokter:", err);
    } finally {
      setIsLoadingDoctors(false);
    }
  };

  const checkAllConsents = async (doctorList) => {
    try {
        const res = await fetch(`http://localhost:8000/api/consent/doctors/${userId}`);
        const data = await res.json();
        const consentedDoctorIds = new Set((data.doctors || []).map(d => d.id));
        const map = {};
        doctorList.forEach(doc => {
            map[doc.id] = consentedDoctorIds.has(doc.id);
        });
        setConsentMap(map);
    } catch (err) {
        console.error("Gagal cek consent:", err);
    }
  };

  const handleToggleConsent = async (doctorId) => {
    const currentConsent = consentMap[doctorId] || false;
    setLoadingConsent((prev) => ({ ...prev, [doctorId]: true }));
    try {
        const endpoint = currentConsent ? "/api/consent/revoke" : "/api/consent/grant";
        const res = await fetch(`http://localhost:8000${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ patient_id: userId, doctor_id: doctorId }),
        });
        if (!res.ok) throw new Error("Gagal mengubah izin");
        setConsentMap((prev) => ({ ...prev, [doctorId]: !currentConsent }));
        showToast("success",
            currentConsent ? "Izin Dicabut" : "Izin Diberikan",
            currentConsent ? "Izin berhasil dicabut." : "Izin berhasil diberikan!"
        );
    } catch (err) {
        showToast("error", "Gagal", "Gagal mengubah izin. Coba lagi.");
    } finally {
        setLoadingConsent((prev) => ({ ...prev, [doctorId]: false }));
    }
  };

  const filteredDoctors = doctors.filter((doc) =>
    (doc.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (doc.instansi || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (doc.spesialisasi || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const dokterDiizinkan = filteredDoctors.filter(
    (doc) => consentMap[doc.id] === true
  );

  const totalPageSemua = Math.ceil(filteredDoctors.length / ITEMS_PER_PAGE);
  const totalPageDiizinkan = Math.ceil(dokterDiizinkan.length / ITEMS_PER_PAGE);

  const paginatedSemua = filteredDoctors.slice(
    (currentPageSemua - 1) * ITEMS_PER_PAGE,
    currentPageSemua * ITEMS_PER_PAGE
  );
  const paginatedDiizinkan = dokterDiizinkan.slice(
    (currentPageDiizinkan - 1) * ITEMS_PER_PAGE,
    currentPageDiizinkan * ITEMS_PER_PAGE
  );

  const DoctorCard = ({ doc }) => {
    const hasConsent = consentMap[doc.id] || false;
    const isProcessing = loadingConsent[doc.id] || false;

    return (
      <div className={`flex items-center justify-between px-6 py-4 border-b border-gray-100 last:border-0 transition-all hover:bg-gray-50 ${
        hasConsent ? "bg-green-50/50" : ""
      }`}>
        <div className="flex items-center gap-4">
          <Avatar name={doc.name} fotoProfil={doc.foto_profil} size="md" />
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-gray-800 text-sm">{doc.name || "Dokter"}</p>
              {hasConsent && (
                <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  ✓ Diizinkan
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">{doc.instansi || "Instansi tidak tersedia"}</p>
            {doc.spesialisasi && (
              <p className="text-xs text-gray-400 mt-0.5">🏥 {doc.spesialisasi}</p>
            )}
          </div>
        </div>

        <button
          onClick={() => handleToggleConsent(doc.id)}
          disabled={isProcessing || !userId}
          className={`w-28 py-2 rounded-xl font-semibold text-sm transition-all flex-shrink-0 text-center ${
            isProcessing
              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
              : hasConsent
              ? "bg-red-50 hover:bg-red-100 text-red-600 border border-red-200"
              : "bg-primary-40 hover:bg-primary-50 text-white shadow-sm"
          }`}
        >
          {isProcessing ? "Memproses..." : hasConsent ? "Cabut Izin" : "Beri Izin"}
        </button>
      </div>
    );
  };

  const Pagination = ({ currentPage, totalPages, onPrev, onNext }) => {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-4 pt-5">
      <button
        onClick={onPrev}
        disabled={currentPage === 1}
        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
          currentPage === 1
            ? "text-gray-300 border-gray-100 cursor-not-allowed"
            : "text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        ‹ Sebelumnya
      </button>
      <span className="text-sm text-gray-500 font-medium">
        {currentPage} / {totalPages}
      </span>
      <button
        onClick={onNext}
        disabled={currentPage === totalPages}
        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
          currentPage === totalPages
            ? "text-gray-300 border-gray-100 cursor-not-allowed"
            : "text-gray-600 border-gray-200 hover:bg-gray-50"
        }`}
      >
        Selanjutnya ›
      </button>
    </div>
  );
};

  return (
    <MainLayout>
      <Toast toasts={toasts} removeToast={removeToast} />
      <style>{`
        @keyframes slide-in {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in { animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 mt-16 pb-20 relative">

        <div className="text-center mb-10">
          <h1 className="text-2xl font-bold text-dark-50 mb-2">Perizinan Dokter</h1>
          <p className="text-gray-500">Kelola akses dokter terhadap rekam medis Anda</p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-2xl px-6 py-4 mb-8 flex items-start gap-3">
          <ShieldCheck size={20} className="text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-700">Kontrol Penuh Ada di Tangan Anda</p>
            <p className="text-sm text-blue-600">
              Hanya dokter yang Anda beri izin yang dapat menambahkan catatan medis ke rekam medis Anda.
              Izin disimpan secara aman dan dapat dicabut kapan saja.
            </p>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] shadow-sm p-10 border border-gray-100 overflow-hidden">

          <div className="flex gap-2 px-8 pt-6 border-b border-gray-100">
            <button
              onClick={() => setActiveTab("semua")}
              className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "semua"
                  ? "border-primary-40 text-primary-40"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <Users size={15} /> Semua Dokter
              {!isLoadingDoctors && (
                <span className="ml-1 bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                  {filteredDoctors.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("diizinkan")}
              className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === "diizinkan"
                  ? "border-green-500 text-green-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <UserCheck size={15} /> Dokter Saya
              {dokterDiizinkan.length > 0 && (
                <span className={`ml-1 text-xs px-2 py-0.5 rounded-full font-bold ${
                  activeTab === "diizinkan"
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                }`}>
                  {dokterDiizinkan.length}
                </span>
              )}
            </button>

            <div className="ml-auto flex items-center gap-3 pb-3">
              <input
                type="text"
                placeholder="Cari nama / instansi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-4 pr-4 py-2 bg-gray-50 rounded-full border border-gray-200 focus:outline-none text-sm w-56"
              />
              <button
                onClick={fetchDoctors}
                disabled={isLoadingDoctors}
                className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2 rounded-full text-sm font-medium transition flex items-center gap-2"
              >
                <RefreshCw size={14} className={isLoadingDoctors ? "animate-spin" : ""} />
                  {isLoadingDoctors ? "Memuat..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="p-8">

            {activeTab === "semua" && (
              <>
                {isLoadingDoctors ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-40 mb-4"></div>
                    <p className="text-gray-400">Memuat daftar dokter...</p>
                  </div>
                ) : filteredDoctors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                    <p className="text-4xl mb-3">👨‍⚕️</p>
                    <p className="text-gray-500 font-medium">Belum ada dokter terverifikasi</p>
                    <p className="text-gray-400 text-sm mt-1">Tunggu hingga admin memverifikasi akun dokter</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                      {paginatedSemua.map((doc) => (
                        <DoctorCard key={doc.id} doc={doc} />
                      ))}
                    </div>
                    <Pagination
                      currentPage={currentPageSemua}
                      totalPages={totalPageSemua}
                      onPrev={() => setCurrentPageSemua(p => p - 1)}
                      onNext={() => setCurrentPageSemua(p => p + 1)}
                    />
                  </>
                )}
              </>
            )}

            {activeTab === "diizinkan" && (
              <>
                {isLoadingDoctors ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-400 mb-4"></div>
                    <p className="text-gray-400">Memeriksa izin dokter...</p>
                  </div>
                ) : dokterDiizinkan.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                    <p className="text-4xl mb-3">🔓</p>
                    <p className="text-gray-500 font-medium">Belum ada dokter yang diizinkan</p>
                    <p className="text-gray-400 text-sm mt-1">Beri izin dokter dari tab <strong>Semua Dokter</strong></p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-gray-100 overflow-hidden">
                      {paginatedDiizinkan.map((doc) => (
                        <DoctorCard key={doc.id} doc={doc} />
                      ))}
                    </div>
                    <Pagination
                      currentPage={currentPageDiizinkan}
                      totalPages={totalPageDiizinkan}
                      onPrev={() => setCurrentPageDiizinkan(p => p - 1)}
                      onNext={() => setCurrentPageDiizinkan(p => p + 1)}
                    />
                  </>
                )}
              </>
            )}

          </div>
        </div>
      </div>
    </MainLayout>
  );
}