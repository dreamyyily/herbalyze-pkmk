import { useEffect, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import MainLayout from "../../layouts/MainLayout";
import SelectField from "../../components/SelectField";
import MultiSelectField from "../../components/MultiSelectField";
import HeroSection from "../../components/HeroSection";
import ResultSection from "../../components/ResultSection";
import { AlertCircle, Crown, Zap, X } from "lucide-react";

export default function Home() {
  const [diagnosisOptions, setDiagnosisOptions] = useState([]);
  const [symptomOptions, setSymptomOptions] = useState([]);

  const [selectedDiagnoses, setSelectedDiagnoses] = useState([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [selectedCondition, setSelectedCondition] = useState([]);
  const [selectedDrug, setSelectedDrug] = useState([]);

  const [errorMessage, setErrorMessage] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // ── Freemium state ──
  const [premiumStatus, setPremiumStatus] = useState(null);  // null=belum load
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [quotaInfo, setQuotaInfo] = useState(null);

  const navigate = useNavigate();
  const location = useLocation(); 
  const [showSuccessToast, setShowSuccessToast] = useState(false); 
  
  const resultRef = useRef(null);

  const specialConditionOptions = ["Tidak ada", "Ibu hamil", "Ibu menyusui"];
  const chemicalDrugOptions = ["Tidak", "Ya"];

  const profile = JSON.parse(localStorage.getItem('user_profile') || 'null');
  const userId = profile?.id;

  useEffect(() => {
    fetchDiagnoses();
    fetchSymptoms();

    // Load premium status
    if (userId) {
      fetch(`http://localhost:8000/api/premium/status/${userId}`)
        .then(r => r.json())
        .then(d => {
          setPremiumStatus(d);
          setQuotaInfo(d);
          // Sync is_premium ke localStorage
          const prof = JSON.parse(localStorage.getItem('user_profile') || 'null');
          if (prof && prof.is_premium !== d.is_premium) {
            prof.is_premium = d.is_premium;
            localStorage.setItem('user_profile', JSON.stringify(prof));
            window.dispatchEvent(new Event('profile-updated'));
          }
        })
        .catch(() => {});
    }

    if (location.state?.profileUpdated) {
      setShowSuccessToast(true);  
      window.history.replaceState({}, document.title);
      setTimeout(() => setShowSuccessToast(false), 4000); 
    } 
  }, [location]);

  const fetchDiagnoses = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/diagnoses");
      if (!res.ok) throw new Error("Gagal mengambil data diagnosis");
      const data = await res.json();
      setDiagnosisOptions(data);
    } catch (err) { console.error("Error Fetch Diagnoses:", err); }
  };

  const fetchSymptoms = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/symptoms");
      if (!res.ok) throw new Error("Gagal mengambil data gejala");
      const data = await res.json();
      setSymptomOptions(data);
    } catch (err) { console.error("Error Fetch Symptoms:", err); }
  };

  const handleConditionChange = (newArray) => {
    const lastClicked = newArray.find((item) => !selectedCondition.includes(item)) 
      || selectedCondition.find((item) => !newArray.includes(item));

    if (!lastClicked) { setSelectedCondition(newArray); return; }

    if (lastClicked === "Tidak ada") {
      setSelectedCondition(["Tidak ada"]);
      return;
    }

    const cleaned = newArray.filter((item) => item !== "Tidak ada");
    setSelectedCondition(cleaned);
  };

  const handleSearch = async () => {

    setErrorMessage(null); 

    if (selectedDiagnoses.length === 0 && selectedSymptoms.length === 0) {
      setErrorMessage({ type: "Peringatan Medis", text: "Mohon pilih minimal satu 'Diagnosis Penyakit' atau 'Gejala Yang Dialami'." });
      return;
    }
    if (selectedCondition.length === 0) {
      setErrorMessage({ type: "Keamanan Pasien", text: "Mohon lengkapi bagian 'Kondisi Khusus'." });
      return;
    }
    if (selectedDrug.length === 0) {
      setErrorMessage({ type: "Keamanan Pasien", text: "Mohon jawab apakah Anda sedang mengonsumsi Obat Kimia." });
      return;
    }

    // ── Cek kuota Exact Match ──────────────────────────────────
    if (userId) {
      try {
        const quotaRes = await fetch("http://localhost:8000/api/premium/record-exact-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        const quotaData = await quotaRes.json();
        setQuotaInfo(quotaData);
        if (!quotaData.allowed) {
          setShowUpgradeModal(true);
          return;
        }
      } catch { /* lanjut jika error */ }
    }

    const prof = JSON.parse(localStorage.getItem('user_profile') || 'null');
    const payload = { 
      user_id: prof?.id || 0, diagnosis: selectedDiagnoses, gejala: selectedSymptoms, kondisi: selectedCondition, obat_kimia: selectedDrug      
    };
    
    setIsLoading(true); setRecommendations(null);

    try {
      const res = await fetch("http://localhost:8000/api/recommend", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const results = await res.json();
      
      setTimeout(() => {
        setRecommendations(results); setIsLoading(false);
        setTimeout(() => { if (resultRef.current) resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 100);
      }, 800);
      
    } catch (err) { console.error("API Error:", err); setIsLoading(false); }
  };

  const handleReset = () => {
    setSelectedDiagnoses([]); setSelectedSymptoms([]); setSelectedCondition([]); setSelectedDrug([]);
    setRecommendations(null); setErrorMessage(null); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <MainLayout>
      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowUpgradeModal(false)} />
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center">
            <button onClick={() => setShowUpgradeModal(false)} className="absolute top-4 right-4 text-gray-300 hover:text-gray-500"><X size={22} /></button>
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Crown size={30} className="text-amber-500" />
            </div>
            <h3 className="text-2xl font-extrabold text-gray-800 mb-2">Kuota Habis!</h3>
            <p className="text-gray-500 text-sm mb-1">
              Anda telah menggunakan <strong>{quotaInfo?.exact_match_count || 5}/{quotaInfo?.exact_match_quota || 5}</strong> kuota Exact Matching gratis.
            </p>
            <p className="text-gray-400 text-xs mb-6">
              Upgrade ke Premium untuk pencarian Exact Match tanpa batas selama 30 hari.
            </p>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
              <div className="text-left">
                <p className="font-extrabold text-gray-800 text-lg">Premium</p>
                <p className="text-xs text-gray-500">Exact Match + Rekam Medis Dokter</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-extrabold text-amber-600">Rp 5.000</p>
                <p className="text-xs text-gray-400">/bulan</p>
              </div>
            </div>
            <button
              onClick={() => { setShowUpgradeModal(false); navigate('/premium'); }}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-extrabold hover:shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <Crown size={16} /> Upgrade Sekarang — Rp 5.000/bln
            </button>
            <button onClick={() => setShowUpgradeModal(false)} className="w-full mt-3 text-gray-400 text-sm hover:text-gray-600 transition">
              Nanti saja
            </button>
          </div>
        </div>
      )}

      <div className="absolute top-0 inset-x-0 h-[600px] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary-10/60 via-primary-10/30 to-transparent -z-10" />

      {showSuccessToast && (
        <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50 animate-[slideDown_0.5s_ease-out]">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl border border-green-100 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <h4 className="text-gray-800 font-bold text-sm">Profil Berhasil Dilengkapi!</h4>
              <p className="text-gray-500 text-xs mt-0.5">Formulir medis sekarang telah dibuka.</p>
            </div>
            <button onClick={() => setShowSuccessToast(false)} className="ml-4 text-gray-400 hover:text-gray-600">&times;</button>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto pt-10 md:pt-14 px-4 pb-24">
        
        <HeroSection />

        {/* Quota Banner — tampil untuk free user */}
        {quotaInfo && !quotaInfo.is_premium && (
          <div
            className={`mt-4 mb-2 flex items-center justify-between gap-4 px-5 py-3 rounded-2xl border text-sm ${
              quotaInfo.quota_remaining === 0
                ? "bg-red-50 border-red-200 text-red-700"
                : quotaInfo.quota_remaining <= 2
                ? "bg-amber-50 border-amber-200 text-amber-800"
                : "bg-blue-50 border-blue-200 text-blue-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <Zap size={15} className="flex-shrink-0" />
              <span>
                Sisa kuota <strong>Cari Berdasarkan Keluhan</strong>:{" "}
                <strong>
                  {quotaInfo.quota_remaining}/{quotaInfo.exact_match_quota}x
                </strong>
                {quotaInfo.quota_remaining === 0 && " — Kuota habis!"}
                {quotaInfo.quota_remaining === 1 && " — Hampir habis!"}
              </span>
            </div>
            <button
              onClick={() => navigate("/premium")}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition"
            >
              <Crown size={12} /> Upgrade
            </button>
          </div>
        )}

        <div className="bg-white rounded-[32px] shadow-[0_20px_50px_rgba(37,99,235,0.07)] border border-primary-10 relative backdrop-blur-sm mt-6">

          <div className="bg-primary-10/40 border-b border-light-40 px-8 py-6 md:px-10 md:py-8 flex items-center justify-between">
            <h2 className="text-xl md:text-2xl font-bold text-dark-50 flex items-center gap-4">
              {/* Ikon diperbarui menjadi Search + Heart/Medical untuk kesan "Cari Berdasarkan Keluhan" */}
              <div className="p-2.5 bg-gradient-to-br from-primary-40 to-primary-60 rounded-xl shadow-lg shadow-primary-20 flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m-3-3h6" />
                </svg>
              </div>
              Cari Berdasarkan Keluhan
            </h2>
          </div>

          <div className="p-8 md:p-10 lg:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-14 gap-y-10">
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-[3px] bg-primary-40 rounded-full"></span><h3 className="text-primary-60 font-bold text-sm uppercase tracking-widest">Kondisi Kesehatan</h3>
                </div>
                <MultiSelectField label="Diagnosis Penyakit" options={diagnosisOptions} value={selectedDiagnoses} onChange={setSelectedDiagnoses} />
                <MultiSelectField label="Gejala Yang Dialami" options={symptomOptions} value={selectedSymptoms} onChange={setSelectedSymptoms} />
              </div>
              <div className="space-y-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="w-8 h-[3px] bg-primary-40 rounded-full"></span><h3 className="text-primary-60 font-bold text-sm uppercase tracking-widest">Profil Keamanan</h3>
                </div>
                <MultiSelectField label="Kondisi Khusus" required options={specialConditionOptions} value={selectedCondition} onChange={handleConditionChange} />
                <div>
                <SelectField label="Konsumsi Obat Kimia" required options={chemicalDrugOptions} value={selectedDrug} onChange={(c) => setSelectedDrug([c])} closeOnSelect={true} />
                <p className="text-xs text-dark-30 flex items-start gap-1.5 -mt-6">
                  <AlertCircle size={12} className="flex-shrink-0 mt-0.5 text-primary-30" />
                  Beri tahu kami jika Anda sedang mengonsumsi obat yang diresepkan dokter.
                </p>
              </div>
              </div>
            </div>

            {errorMessage && (
              <div className="mt-10 p-5 bg-red-50/80 backdrop-blur-sm border border-red-200 rounded-2xl flex items-start gap-4 animate-[fadeIn_0.3s_ease-out] shadow-sm">
                <div className="p-2.5 bg-red-100 rounded-full text-danger-30 flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                </div>
                <div><h4 className="text-base font-bold text-red-800 mb-1">{errorMessage.type}</h4><p className="text-sm text-red-700 leading-relaxed font-medium">{errorMessage.text}</p></div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-center gap-6 mt-14 pt-8 border-t border-light-40">
              <span className="text-dark-30 text-sm font-medium flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-primary-30" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg> Data diproses secara rahasia & aman.
              </span>
              <div className="flex gap-4 w-full sm:w-auto">
                <button onClick={handleReset} disabled={isLoading} className="flex-1 sm:flex-none px-8 py-4 rounded-2xl font-bold text-dark-30 bg-light-20 hover:bg-red-50 hover:text-danger-30 transition-all disabled:opacity-50 disabled:cursor-not-allowed">Reset Data</button>
                <button onClick={handleSearch} disabled={isLoading} className="flex-1 sm:flex-none text-white px-8 py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-3 bg-gradient-to-r from-primary-40 to-primary-60 hover:from-primary-50 hover:to-primary-70 hover:shadow-xl hover:shadow-primary-30/50 active:scale-95">
                  {isLoading ? "Menganalisis..." : "Cari Rekomendasi"}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div ref={resultRef} className="scroll-mt-10"><ResultSection recommendations={recommendations} selectedDrug={selectedDrug} /></div>
      </div>
    </MainLayout>
  );
}