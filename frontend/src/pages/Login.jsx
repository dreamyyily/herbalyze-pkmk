import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Toast Component ────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-start gap-4 px-5 py-4 rounded-2xl shadow-2xl border backdrop-blur-md max-w-sm w-full
            transform transition-all duration-500 animate-slide-in
            ${
              t.type === "success"
                ? "bg-white/90 border-green-200 text-green-800"
                : t.type === "error"
                  ? "bg-white/90 border-red-200 text-red-800"
                  : t.type === "warning"
                    ? "bg-white/90 border-orange-200 text-orange-800"
                    : "bg-white/90 border-blue-200 text-blue-800"
            }`}
        >
          <span className="text-2xl mt-0.5 flex-shrink-0">
            {t.type === "success"
              ? "✅"
              : t.type === "error"
                ? "❌"
                : t.type === "warning"
                  ? "⚠️"
                  : "ℹ️"}
          </span>
          <div className="flex-1">
            {t.title && <p className="font-bold text-sm mb-0.5">{t.title}</p>}
            <p className="text-sm leading-relaxed">{t.message}</p>
          </div>
          <button
            onClick={() => removeToast(t.id)}
            className="text-gray-400 hover:text-gray-600 transition text-lg leading-none flex-shrink-0 mt-0.5"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

const Login = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [loginData, setLoginData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();

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

  const handleChange = (e) => {
    setLoginData({ ...loginData, [e.target.name]: e.target.value });
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch("http://localhost:8000/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal masuk");

      localStorage.clear();

      localStorage.setItem("user_profile", JSON.stringify(data.user));

      if (data.user.role === "Admin") {
        navigate("/admin");
      } else {
        navigate("/home")
        }
      } catch (error) {
        showToast("error", "Login Gagal", error.message);
      } finally {
        setIsLoading(false);
      }
    };

  return (
    <div className="min-h-screen flex flex-col md:flex-row font-sans relative">
      <Toast toasts={toasts} removeToast={removeToast} />
      <style>{`
              @keyframes slide-in {
                0% { transform: translateX(100%); opacity: 0; }
                100% { transform: translateX(0); opacity: 1; }
              }
              .animate-slide-in { animation: slide-in 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
            `}</style>

      <div className="w-full md:w-1/2 flex flex-col justify-center items-center p-8 bg-white relative z-10">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-primary-40 tracking-tight">
              Herbalyze
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Selamat datang kembali! Silakan masuk ke akun Anda.
            </p>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleEmailLogin}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="email-address" className="sr-only">
                  Alamat Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="appearance-none rounded-t-md relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-40 focus:border-primary-40 focus:z-10 sm:text-sm"
                  placeholder="Alamat email"
                  value={loginData.email}
                  onChange={handleChange}
                />
              </div>
              <div className="relative">
                <label htmlFor="password" className="sr-only">
                  Kata Sandi
                </label>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  className="appearance-none rounded-b-md relative block w-full px-3 py-3 pr-11 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-primary-40 focus:border-primary-40 focus:z-10 sm:text-sm"
                  placeholder="Kata sandi"
                  value={loginData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 transition-colors focus:outline-none z-20"
                  tabIndex={-1}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-bold rounded-md text-white bg-primary-40 hover:bg-primary-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-40 transition-all"
              >
                {isLoading ? "Memproses..." : "Masuk"}
              </button>
            </div>
          </form>

          <div className="text-center mt-4">
            <p className="text-sm text-gray-600">
              Belum punya akun?{" "}
              <span
                onClick={() => navigate("/register")}
                className="font-medium text-primary-40 hover:text-primary-50 cursor-pointer"
              >
                Daftar di sini
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Sisi Kanan: Visual */}
      <div className="hidden md:flex md:w-1/2 bg-gradient-to-b from-green-200 via-green-400 to-green-800 relative overflow-hidden flex-col justify-center items-center">
        <div className="relative z-10 text-center max-w-lg px-8">
          <div className="mb-8 transform hover:scale-105 transition duration-500">
            <div className="w-40 h-40 bg-white/30 backdrop-blur-md rounded-full mx-auto flex items-center justify-center shadow-2xl border border-white/40">
              <span className="text-6xl filter drop-shadow-lg">🌿</span>
            </div>
          </div>
          <h2 className="text-4xl font-extrabold text-white mb-4 drop-shadow-lg">
            Herbalyze
          </h2>
          <p className="text-white text-lg font-medium bg-white/20 p-5 rounded-xl backdrop-blur-sm shadow-lg leading-relaxed">
            "Kesehatanmu. Alami. Terlindungi."
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
