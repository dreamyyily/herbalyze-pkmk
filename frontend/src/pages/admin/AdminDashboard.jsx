import React, { useEffect, useState, useRef } from "react";
import MainLayout from "../../layouts/MainLayout";
import { sortByDate } from "../../utils/sort";
import { formatTanggal } from "../../utils/formatTanggal";
import { AlertTriangle, ChevronUp, ChevronDown, FileText, Crown, UserPlus } from "lucide-react";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("premium"); // "premium" | "doctor"

  const [pendingPremiums, setPendingPremiums] = useState([]);
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("desc"); 

  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [selectedPremium, setSelectedPremium] = useState(null);

  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  
  const [actionResult, setActionResult] = useState({
    isOpen: false,
    type: 'success', 
    title: '',
    message: ''
  });
  
  const toastTimer = useRef(null);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [resPremiums, resDoctors] = await Promise.all([
        fetch("http://localhost:8000/api/admin/pending_premiums"),
        fetch("http://localhost:8000/api/admin/pending_doctors")
      ]);
      const dataPremiums = await resPremiums.json();
      const dataDoctors = await resDoctors.json();
      
      setPendingPremiums(dataPremiums);
      setPendingDoctors(dataDoctors);
    } catch (error) {
      console.error("Gagal mengambil data admin:", error);
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type, title, message) => {
    setActionResult({ isOpen: true, type, title, message });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setActionResult(prev => ({ ...prev, isOpen: false }));
    }, 4000);
  };

  // --- LOGIKA PREMIUM ---
  const sortedPremiums = sortByDate(pendingPremiums, "created_at", sortOrder);

  const executeApprovePremium = async () => {
    if (!selectedPremium) return;
    setIsPremiumModalOpen(false);
    try {
        const response = await fetch("http://localhost:8000/api/admin/approve_premium", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription_id: selectedPremium.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Gagal approve");
        showToast('success', 'Berhasil', `Akun ${selectedPremium.user_name} berhasil di-upgrade ke Premium.`);
        fetchAllData();
    } catch (error) {
        showToast('danger', 'Gagal', error.message);
    } finally {
        setSelectedPremium(null);
    }
  };

  const executeRejectPremium = async () => {
    if (!selectedPremium) return;
    try {
      const response = await fetch("http://localhost:8000/api/admin/reject_premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription_id: selectedPremium.id }),
      });
      if (!response.ok) throw new Error("Gagal menolak pengajuan");
      setIsPremiumModalOpen(false); 
      showToast('danger', 'Ditolak', `Pengajuan premium ${selectedPremium.user_name} telah ditolak.`);
      fetchAllData();
    } catch (error) {
      showToast('danger', 'Error', error.message);
    } finally {
      setSelectedPremium(null);
    }
  };

  // --- LOGIKA DOCTOR ---
  const sortedDoctors = sortByDate(pendingDoctors, "created_at", sortOrder);

  const executeApproveDoctor = async () => {
    if (!selectedDoctor) return;
    setIsDoctorModalOpen(false);
    try {
        const response = await fetch("http://localhost:8000/api/admin/approve_doctor", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: selectedDoctor.id }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Gagal approve");
        showToast('success', 'Berhasil', `${selectedDoctor.name} berhasil diverifikasi sebagai dokter.`);
        fetchAllData();
    } catch (error) {
        showToast('danger', 'Gagal', error.message);
    } finally {
        setSelectedDoctor(null);
    }
  };

  const executeRejectDoctor = async () => {
    if (!selectedDoctor) return;
    try {
      const response = await fetch("http://localhost:8000/api/admin/reject_doctor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedDoctor.id }),
      });
      if (!response.ok) throw new Error("Gagal menolak pengajuan");
      setIsDoctorModalOpen(false); 
      showToast('danger', 'Ditolak', `Pengajuan dokter ${selectedDoctor.name} telah ditolak.`);
      fetchAllData();
    } catch (error) {
      showToast('danger', 'Error', error.message);
    } finally {
      setSelectedDoctor(null);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto px-4 mt-16 pb-12 relative">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-dark-50">Dashboard Administrator</h1>
          <p className="text-dark-30 mt-2 text-sm">Kelola pengajuan Premium dan verifikasi akun Dokter.</p>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setActiveTab("premium")}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === "premium" 
                ? "bg-amber-100 text-amber-700 shadow-sm border border-amber-200" 
                : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-100"
            }`}
          >
            <Crown size={18} />
            Upgrade Premium
            {pendingPremiums.length > 0 && (
              <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">
                {pendingPremiums.length}
              </span>
            )}
          </button>

          <button 
            onClick={() => setActiveTab("doctor")}
            className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-bold transition-all ${
              activeTab === "doctor" 
                ? "bg-blue-100 text-blue-700 shadow-sm border border-blue-200" 
                : "bg-white text-gray-500 hover:bg-gray-50 border border-gray-100"
            }`}
          >
            <UserPlus size={18} />
            Verifikasi Dokter
            {pendingDoctors.length > 0 && (
              <span className="ml-2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full">
                {pendingDoctors.length}
              </span>
            )}
          </button>
        </div>

        {/* Tabel Antrean */}
        <div className="bg-white rounded-3xl shadow-xl border border-light-40 overflow-hidden relative z-10">
          <div className="p-8 border-b border-light-40 flex items-center justify-between">
            <h2 className="text-xl font-bold">
              {activeTab === "premium" ? "Antrean Upgrade Premium" : "Antrean Verifikasi Dokter"}
            </h2>
            {activeTab === "premium" ? (
              <span className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full text-xs font-bold">
                Total: {pendingPremiums.length}
              </span>
            ) : (
              <span className="bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-xs font-bold">
                Total: {pendingDoctors.length}
              </span>
            )}
          </div>
          <div className="p-8 overflow-x-auto">
            {loading ? <p className="text-center py-10">Memuat data...</p> : (
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-primary-20 text-dark-30 text-xs uppercase font-bold">
                    <th
                      onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                      className="py-4 px-4 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-2">
                        Tanggal Pengajuan

                        <div className="flex flex-col leading-none ml-1">
                          <ChevronUp
                            size={14}
                            className={`transition ${
                              sortOrder === "asc" ? "text-blue-600" : "text-gray-300"
                            }`}
                          />
                          <ChevronDown
                            size={14}
                            className={`-mt-1 transition ${
                              sortOrder === "desc" ? "text-blue-600" : "text-gray-300"
                            }`}
                          />
                        </div>
                      </div>
                    </th>
                    <th className="py-4 px-4">Nama Akun</th>
                    <th className="py-4 px-4">Jenis Pengajuan</th>
                    <th className="py-4 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTab === "premium" && sortedPremiums.map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50 transition">
                      <td className="py-4 px-4 text-sm font-medium">
                        {formatTanggal(item.created_at)}
                      </td>
                      <td className="py-4 px-4 font-medium text-sm">
                        {item.user_name || "Anonim"}
                      </td>
                      <td className="py-4 px-4">
                          <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-full">
                            Upgrade Premium
                          </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedPremium(item);
                            setIsPremiumModalOpen(true);        
                          }}
                          className="text-amber-600 hover:text-amber-700 font-medium underline underline-offset-4 transition text-sm"
                        >
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  ))}

                  {activeTab === "doctor" && sortedDoctors.map((doc, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50 transition">
                      <td className="py-4 px-4 text-sm font-medium">
                        {formatTanggal(doc.created_at)}
                      </td>
                      <td className="py-4 px-4 font-medium text-sm">
                        {doc.name || "Anonim"}
                      </td>
                      <td className="py-4 px-4">
                        {doc.nomor_str ? (
                          <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">
                            Dokter Baru
                          </span>
                        ) : (
                          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-full">
                            Ganti Instansi
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <button
                          onClick={() => {
                            setSelectedDoctor(doc);
                            setIsDoctorModalOpen(true);        
                          }}
                          className="text-blue-600 hover:text-blue-700 font-medium underline underline-offset-4 transition text-sm"
                        >
                          Lihat Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Toast Notification */}
        {actionResult.isOpen && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[100] animate-fade-in pointer-events-none">
            <div className={`px-6 py-4 rounded-2xl bg-white border-l-8 shadow-2xl flex items-center gap-4 ${actionResult.type === 'success' ? 'border-l-green-500' : 'border-l-red-500'}`}>
              <h4 className="font-bold text-gray-800 text-sm">{actionResult.title}: <span className="font-normal text-gray-500">{actionResult.message}</span></h4>
            </div>
          </div>
        )}

        {/* ==================== MODAL PREMIUM ==================== */}
        {isPremiumModalOpen && selectedPremium && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-50/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">Review Upgrade Premium</h3>
                <button
                  onClick={() => setIsPremiumModalOpen(false)}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-400">Nama Pengguna</p>
                  <p className="font-semibold text-lg">{selectedPremium.user_name}</p>
                  <p className="text-sm text-gray-500">{selectedPremium.user_email}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">Tanggal Pengajuan</p>
                  <p className="font-semibold">{formatTanggal(selectedPremium.created_at)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-2">Bukti Transfer</p>
                  {selectedPremium.bukti_transfer_url ? (
                    <div className="border rounded-xl p-2 bg-gray-50 flex justify-center">
                      <img 
                        src={selectedPremium.bukti_transfer_url} 
                        alt="Bukti Transfer" 
                        className="max-h-64 object-contain rounded-lg shadow-sm"
                      />
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Tidak ada bukti transfer</p>
                  )}
                  {selectedPremium.bukti_transfer_url && (
                    <a
                      href={selectedPremium.bukti_transfer_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-2 text-blue-600 hover:text-blue-700 underline text-sm"
                    >
                      <FileText size={14} /> Buka Gambar Ukuran Penuh
                    </a>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-red-400 my-6">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <span>Pastikan transfer senilai Rp 5.000 sudah masuk ke DANA Anda sebelum menyetujui.</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={executeRejectPremium}
                  className="flex-1 py-3.5 border border-red-300 text-red-600 font-medium rounded-2xl hover:bg-red-50 transition"
                >
                  Tolak
                </button>
                <button
                  onClick={executeApprovePremium}
                  className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-bold rounded-2xl hover:shadow-lg transition"
                >
                  Setujui Premium
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== MODAL DOCTOR ==================== */}
        {isDoctorModalOpen && selectedDoctor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-dark-50/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-800">Review Pengajuan Dokter</h3>
                <button
                  onClick={() => setIsDoctorModalOpen(false)}
                  className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <p className="text-xs text-gray-400">Nama</p>
                  <p className="font-semibold text-lg">{selectedDoctor.name}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-400">Jenis Pengajuan</p>
                  <p className="font-semibold">
                    {selectedDoctor.instansi_lama ? "Perubahan Instansi" : "Pendaftaran Dokter Baru"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-400 mb-1">Instansi</p>
                  {selectedDoctor.instansi_lama ? (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <p className="text-xs text-gray-500 line-through">{selectedDoctor.instansi_lama}</p>
                      <p className="text-center text-gray-400 my-1">↓</p>
                      <p className="font-bold text-blue-700">{selectedDoctor.instansi_baru}</p>
                    </div>
                  ) : (
                    <p className="font-semibold">{selectedDoctor.nama_instansi || "-"}</p>
                  )}
                </div>

                <div>
                  <p className="text-xs text-gray-400">Tanggal Pengajuan</p>
                  <p className="font-semibold">{formatTanggal(selectedDoctor.created_at)}</p>
                </div>

                {selectedDoctor.nomor_str && (
                  <div>
                    <p className="text-xs text-gray-400">Nomor STR</p>
                    <p className="font-semibold font-mono">{selectedDoctor.nomor_str}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-2">Dokumen Pendukung</p>
                  <div className="space-y-2">
                    {selectedDoctor.dokumen_str_url ? (
                      <a
                        href={selectedDoctor.dokumen_str_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-700 underline text-sm"
                      >
                        <FileText size={14} /> Lihat Dokumen STR
                      </a>
                    ) : (
                      <p className="text-gray-400 text-sm">Dokumen STR tidak tersedia</p>
                    )}
                    {selectedDoctor.dokumen_sip_url ? (
                      <a
                        href={selectedDoctor.dokumen_sip_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-green-600 hover:text-green-700 underline text-sm"
                      >
                        <FileText size={14} /> Lihat Dokumen SIP
                      </a>
                    ) : (
                      <p className="text-gray-400 text-sm">Dokumen SIP tidak tersedia</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-red-400 my-6">
                <AlertTriangle size={16} className="text-red-400" />
                <span>Pastikan semua data sudah benar sebelum mengambil keputusan</span>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={executeRejectDoctor}
                  className="flex-1 py-3.5 border border-red-300 text-red-600 font-medium rounded-2xl hover:bg-red-50 transition"
                >
                  Tolak Pengajuan
                </button>
                <button
                  onClick={executeApproveDoctor}
                  className="flex-1 py-3.5 bg-primary-50 text-white font-bold rounded-2xl hover:bg-primary-60 transition"
                >
                  Setujui Pengajuan
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}