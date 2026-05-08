import React, { useState, useEffect, useRef, useCallback } from "react";
import MainLayout from "../../layouts/MainLayout";
import Avatar from "../../components/Avatar";

function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className={`pointer-events-auto flex items-start gap-3 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-sm max-w-sm w-full transform transition-all duration-500 animate-slide-in
          ${t.type === "success" ? "bg-white border-green-200 text-green-800"
            : t.type === "error" ? "bg-white border-red-200 text-red-800"
            : t.type === "warning" ? "bg-white border-orange-200 text-orange-800"
            : "bg-white border-blue-200 text-blue-800"}`}>
          <span className="text-2xl mt-0.5 flex-shrink-0">
            {t.type === "success" ? "✅" : t.type === "error" ? "❌" : t.type === "warning" ? "⚠️" : "ℹ️"}
          </span>
          <div className="flex-1">
            {t.title && <p className="font-bold text-sm mb-0.5">{t.title}</p>}
            <p className="text-sm leading-relaxed">{t.message}</p>
          </div>
          <button onClick={() => removeToast(t.id)} className="text-gray-300 hover:text-gray-500 text-lg leading-none flex-shrink-0 mt-0.5">×</button>
        </div>
      ))}
    </div>
  );
}

export default function RekamMedis() {
  const profile = JSON.parse(localStorage.getItem("user_profile") || "null");
  const doctorId = profile?.id;

  const [doctorProfile, setDoctorProfile] = useState({});
  const [activeTab, setActiveTab] = useState("pasien");
  const [currentPagePatients, setCurrentPagePatients] = useState(1);
  const [currentPageRecords, setCurrentPageRecords] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const specialConditionOptions = ["Tidak ada", "Ibu hamil", "Ibu menyusui"];

  const [consentedPatients, setConsentedPatients] = useState([]);
  const [isFetchingPatients, setIsFetchingPatients] = useState(false);
  const [records, setRecords] = useState([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [toasts, setToasts] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState("");
  const [formData, setFormData] = useState({
    diagnosis: "", gejala: "", obat: "", kondisiKhusus: "", catatanTambahan: "",
  });

  const showToast = useCallback((type, title, message) => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    if (!doctorId) return;
    // Load profil dokter
    fetch(`http://127.0.0.1:8000/api/profile/${doctorId}`)
      .then(res => res.json())
      .then(data => setDoctorProfile({ name: data.name, nama_instansi: data.nama_instansi }))
      .catch(err => console.error("Gagal load profil dokter:", err));

    fetchConsentedPatients();
    fetchRecords();
  }, [doctorId]);

  useEffect(() => {
    setCurrentPageRecords(1);
  }, [searchQuery]);

  const fetchConsentedPatients = async () => {
    if (!doctorId) return;
    setIsFetchingPatients(true);
    try {
      const res = await fetch(`http://localhost:8000/api/consent/patients/${doctorId}`);
      const data = await res.json();
      setConsentedPatients(data.patients || []);
    } catch (err) {
      console.error("Gagal fetch pasien ber-consent:", err);
    } finally {
      setIsFetchingPatients(false);
    }
  };

  const fetchRecords = async () => {
    if (!doctorId) return;
    setIsFetching(true);
    try {
      const res = await fetch(`http://localhost:8000/api/medical-record/doctor/${doctorId}`);
      const data = await res.json();
      setRecords(data.records || []);
    } catch (err) {
      console.error("Gagal fetch rekam medis:", err);
    } finally {
      setIsFetching(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddFromPatient = (patientId) => {
    setSelectedPatientId(patientId);
    setFormData({ diagnosis: "", gejala: "", obat: "", kondisiKhusus: "", catatanTambahan: "" });
    setIsFormOpen(true);
    setActiveTab("rekam");
  };

  const handleSubmitDraft = async () => {
    if (!selectedPatientId || !formData.diagnosis || !formData.gejala || !formData.obat || !formData.kondisiKhusus) {
      showToast("error", "Validasi Gagal", "Harap lengkapi semua field yang bertanda bintang (*)");
      return;
    }

    const isConsented = consentedPatients.some(p => p.id === parseInt(selectedPatientId));
    if (!isConsented) {
      showToast("error", "Izin Ditolak", "Pasien belum memberikan izin kepada Anda.");
      return;
    }

    try {
      setIsLoading(true);
      const payload = {
        patient_id: parseInt(selectedPatientId),
        doctor_id: doctorId,
        doctor_name: doctorProfile.name || "Dokter Anonim",
        doctor_instansi: doctorProfile.nama_instansi || "Rumah Sakit",
        record_data: {
          diagnosis: formData.diagnosis,
          gejala: formData.gejala,
          obat: formData.obat,
          kondisiKhusus: formData.kondisiKhusus,
          catatanTambahan: formData.catatanTambahan,
        },
      };

      const res = await fetch("http://localhost:8000/api/medical-record/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast("error", "Gagal Submit", data.error || data.detail || "Terjadi kesalahan.");
        return;
      }

      showToast("success", "Draft Tersimpan!", "Rekam medis berhasil dikirim ke pasien untuk diverifikasi.");
      setIsFormOpen(false);
      setFormData({ diagnosis: "", gejala: "", obat: "", kondisiKhusus: "", catatanTambahan: "" });
      setSelectedPatientId("");
      fetchRecords();
      fetchConsentedPatients();
    } catch (error) {
      showToast("error", "Server Error", "Gagal menyimpan draft. Cek koneksi server.");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredRecords = records.filter(r =>
    (r.diagnosis || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.doctor_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.obat || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const patientsTotalPages = Math.ceil(consentedPatients.length / ITEMS_PER_PAGE);
  const paginatedPatients = consentedPatients.slice(
    (currentPagePatients - 1) * ITEMS_PER_PAGE,
    currentPagePatients * ITEMS_PER_PAGE
  );

  const recordsTotalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
  const paginatedRecords = filteredRecords.slice(
    (currentPageRecords - 1) * ITEMS_PER_PAGE,
    currentPageRecords * ITEMS_PER_PAGE
  );

  const formatTanggal = (date) =>
    new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <MainLayout>
      <Toast toasts={toasts} removeToast={removeToast} />
      <style>{`
        @keyframes slide-in-right { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        .animate-slide-in { animation: slide-in-right 0.4s cubic-bezier(.21,1.02,.73,1) both; }
      `}</style>

      <div className="max-w-6xl mx-auto px-4 mt-16 pb-20">
        {!isFormOpen && !selectedRecord && (
          <div className="text-center mb-10">
            <h1 className="text-2xl font-bold text-dark-50 mb-2">Rekam Medis Pasien</h1>
            <p className="text-gray-500">Kelola rekam medis pasien yang telah memberikan izin</p>
          </div>
        )}

        <div className="bg-white rounded-[2rem] shadow-sm p-10 border border-gray-100">

          {/* ── DETAIL RECORD ── */}
          {selectedRecord && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-dark-50">Detail Catatan Medis</h2>
                <button onClick={() => setSelectedRecord(null)} className="text-blue-500 font-medium hover:underline">← Kembali</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1 uppercase">Dokter</p>
                  <p className="font-semibold text-gray-800">{selectedRecord.doctor_name || "-"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1 uppercase">Tanggal</p>
                  <p className="font-semibold text-gray-800">{formatTanggal(selectedRecord.created_at)}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-5 border border-green-100 col-span-full">
                  <p className="text-xs text-green-500 mb-1 uppercase font-semibold">Diagnosis</p>
                  <p className="text-gray-800">{selectedRecord.diagnosis || "-"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100 col-span-full">
                  <p className="text-xs text-gray-400 mb-1 uppercase">Gejala</p>
                  <p className="text-gray-800">{selectedRecord.gejala || "-"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1 uppercase">Resep Obat</p>
                  <p className="font-semibold text-gray-800">{selectedRecord.obat || "-"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <p className="text-xs text-gray-400 mb-1 uppercase">Kondisi Khusus</p>
                  <p className="font-semibold text-gray-800">{selectedRecord.kondisi_khusus || "-"}</p>
                </div>
                {selectedRecord.catatan_tambahan && (
                  <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-100 col-span-full">
                    <p className="text-xs text-yellow-600 mb-1 uppercase">Catatan Tambahan</p>
                    <p className="text-gray-800">{selectedRecord.catatan_tambahan}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── FORM TAMBAH ── */}
          {isFormOpen && (
            <div className="animate-fade-in">
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-xl font-bold text-dark-50">Tambah Rekam Medis Baru</h2>
                <button className="text-blue-500 font-medium hover:underline" onClick={() => { setIsFormOpen(false); setSelectedPatientId(""); }}>Batalkan</button>
              </div>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Pilih Pasien <span className="text-red-500">*</span></label>
                  {consentedPatients.length > 0 ? (
                    <div className="relative">
                      <select
                        value={selectedPatientId}
                        onChange={(e) => setSelectedPatientId(e.target.value)}
                        className="w-full p-4 bg-transparent border border-gray-200 rounded-xl focus:border-primary-40 focus:ring-1 focus:ring-primary-40 outline-none transition appearance-none"
                      >
                        <option value="" disabled>-- Pilih pasien yang sudah memberi izin --</option>
                        {consentedPatients.map((p) => (
                          <option key={p.id} value={p.id}>{p.name || `Pasien #${p.id}`}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700">
                      ⚠️ Belum ada pasien yang memberikan izin.
                    </div>
                  )}
                </div>

                {["diagnosis", "gejala", "obat"].map((field) => (
                  <div key={field}>
                    <label className="block text-sm font-semibold text-gray-700 mb-2 capitalize">
                      {field === "obat" ? "Resep Obat" : field.charAt(0).toUpperCase() + field.slice(1)} <span className="text-red-500">*</span>
                    </label>
                    <textarea name={field} value={formData[field]} onChange={handleInputChange}
                      className="w-full p-4 bg-transparent border border-gray-200 rounded-xl focus:border-primary-40 focus:ring-1 focus:ring-primary-40 outline-none transition min-h-[100px]" />
                  </div>
                ))}

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Kondisi Khusus <span className="text-red-500">*</span></label>
                  <select name="kondisiKhusus" value={formData.kondisiKhusus} onChange={handleInputChange}
                    className="w-full p-4 bg-transparent border border-gray-200 rounded-xl focus:border-primary-40 outline-none appearance-none">
                    <option value="" disabled>Pilih Kondisi Khusus</option>
                    {specialConditionOptions.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Catatan Tambahan <span className="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded ml-1">Opsional</span></label>
                  <textarea name="catatanTambahan" value={formData.catatanTambahan} onChange={handleInputChange}
                    className="w-full p-4 bg-transparent border border-gray-200 rounded-xl focus:border-primary-40 outline-none transition min-h-[100px]" />
                </div>
              </div>

              <div className="mt-8 flex justify-end">
                <button onClick={handleSubmitDraft}
                  disabled={isLoading || !selectedPatientId || consentedPatients.length === 0}
                  className={`${isLoading || !selectedPatientId || consentedPatients.length === 0 ? "bg-gray-300 cursor-not-allowed" : "bg-primary-40 hover:bg-primary-50"} text-white px-10 py-4 rounded-xl font-bold text-lg shadow-lg transition-all transform active:scale-95`}>
                  {isLoading ? "⏳ Menyimpan Draft..." : "📋 Kirim ke Pasien untuk Diverifikasi"}
                </button>
              </div>
            </div>
          )}

          {/* ── TAB UTAMA ── */}
          {!isFormOpen && !selectedRecord && (
            <>
              <div className="flex gap-2 mb-8 border-b border-gray-100">
                <button onClick={() => setActiveTab("pasien")}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors ${activeTab === "pasien" ? "border-primary-40 text-primary-40" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  👥 Pasien Saya
                  {consentedPatients.length > 0 && <span className="ml-2 bg-primary-40 text-white text-xs px-2 py-0.5 rounded-full">{consentedPatients.length}</span>}
                </button>
                <button onClick={() => setActiveTab("rekam")}
                  className={`pb-3 px-4 font-semibold text-sm border-b-2 transition-colors ${activeTab === "rekam" ? "border-primary-40 text-primary-40" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                  📋 Riwayat Rekam Medis
                  {records.length > 0 && <span className="ml-1 bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">{records.length}</span>}
                </button>
              </div>

              {/* TAB PASIEN */}
              {activeTab === "pasien" && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-sm text-gray-500">Pasien yang telah memberikan izin</p>
                    <button onClick={fetchConsentedPatients} disabled={isFetchingPatients}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-full text-sm font-medium transition">
                      {isFetchingPatients ? "Memuat..." : "🔄 Refresh"}
                    </button>
                  </div>

                  {isFetchingPatients ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-40 mb-4"></div>
                      <p className="text-gray-400">Memuat daftar pasien...</p>
                    </div>
                  ) : consentedPatients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                      <p className="text-4xl mb-3">🙋</p>
                      <p className="text-gray-500 font-medium">Belum ada pasien yang memberi izin</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {paginatedPatients.map((patient) => (
                        <div key={patient.id} className="border border-green-100 bg-green-50 rounded-2xl p-6">
                          <div className="flex items-center gap-3 mb-4">
                            <Avatar name={patient.name} fotoProfil={patient.foto_profil} size="md" />
                            <div>
                              <p className="font-semibold text-gray-800">{patient.name || "Pasien"}</p>
                              <p className="text-xs text-gray-400">{patient.email || ""}</p>
                            </div>
                            <span className="ml-auto bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-full">✓ Diizinkan</span>
                          </div>
                          <button onClick={() => handleAddFromPatient(patient.id)}
                            className="w-full py-2.5 rounded-xl bg-primary-40 hover:bg-primary-50 text-white font-semibold text-sm transition">
                            + Tambah Rekam Medis
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB REKAM MEDIS */}
              {activeTab === "rekam" && (
                <div>
                  <div className="flex justify-between items-center mb-6">
                    <p className="text-sm text-gray-500">Semua rekam medis yang telah Anda tambahkan</p>
                    <div className="flex items-center gap-4">
                      <input type="text" placeholder="Cari diagnosis..." value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-4 pr-4 py-2.5 bg-gray-50 rounded-full border border-gray-200 focus:outline-none text-sm w-64" />
                      <button onClick={fetchRecords} disabled={isFetching}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-full text-sm font-medium transition">
                        {isFetching ? "⏳ Memuat..." : "🔄 Refresh"}
                      </button>
                    </div>
                  </div>

                  {isFetching ? (
                    <div className="flex flex-col items-center justify-center py-20">
                      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-40 mb-4"></div>
                      <p className="text-gray-400">Memuat data rekam medis...</p>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                      <p className="text-4xl mb-3">📋</p>
                      <p className="text-gray-500 font-medium">Belum ada rekam medis</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-100 rounded-xl">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50 text-gray-500 font-semibold">
                            <th className="text-left py-3 px-4">Tanggal</th>
                            <th className="text-left py-3 px-4">Diagnosis</th>
                            <th className="text-left py-3 px-4">Resep Obat</th>
                            <th className="text-left py-3 px-4">Kondisi</th>
                            <th className="text-left py-3 px-4">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedRecords.map((record) => (
                            <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                              <td className="py-4 px-4 text-gray-600">{formatTanggal(record.created_at)}</td>
                              <td className="py-4 px-4 text-gray-600 max-w-[200px] truncate">{record.diagnosis || "-"}</td>
                              <td className="py-4 px-4 text-gray-600 max-w-[150px] truncate">{record.obat || "-"}</td>
                              <td className="py-4 px-4">
                                <span className="bg-green-100 text-green-700 text-xs font-semibold px-3 py-1 rounded-full">
                                  {record.kondisi_khusus || "Normal"}
                                </span>
                              </td>
                              <td className="py-4 px-4">
                                <button onClick={() => setSelectedRecord(record)} className="text-primary-40 hover:underline font-medium text-sm">Lihat Detail</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </MainLayout>
  );
}