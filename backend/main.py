import json
from fastapi import FastAPI, Depends, HTTPException, Form, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import func, text
from pydantic import BaseModel
import bcrypt
from typing import Optional
from fastapi.responses import JSONResponse, FileResponse
import os
import traceback
import re
import time
import shutil
from pathlib import Path

from db import get_db, Base, engine
from models import (
    User, HerbalDiagnosis, HerbalSymptom, HerbalSpecialCondition,
    SearchHistory, MedicalRecordDraft, MedicalRecord, DoctorPatientConsent,
    PremiumSubscription
)
from fastapi.encoders import jsonable_encoder
from datetime import datetime, timedelta
from dotenv import load_dotenv
import json as _json_lib
import httpx
import base64

load_dotenv()

# ==============================================================================
# UPLOAD DIRECTORY (menggantikan IPFS)
# ==============================================================================

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

_CONFIG_DIR = os.path.join(os.path.dirname(__file__), "config")

# ==============================================================================
# Load NLP config
# ==============================================================================

def _load_json_config(filename: str, key: str) -> list:
    try:
        path = os.path.join(_CONFIG_DIR, filename)
        with open(path, "r", encoding="utf-8") as f:
            return _json_lib.load(f).get(key, [])
    except Exception as e:
        print(f"⚠️ Gagal load config '{filename}': {e}")
        return []

NLP_STOPWORDS        = set(_load_json_config("stopwords.json",  "stopwords"))
NLP_NEGATION_WORDS   = set(_load_json_config("negation.json",   "negation_words"))
NLP_NEGATION_PHRASES = list(_load_json_config("negation.json",  "negation_phrases"))

print(f"✅ Stopwords loaded        : {len(NLP_STOPWORDS)} kata")
print(f"✅ Negation words loaded   : {NLP_NEGATION_WORDS}")
print(f"✅ Negation phrases loaded : {NLP_NEGATION_PHRASES}")

def _get_active_mode() -> str:
    try:
        path = os.path.join(_CONFIG_DIR, "active_mode.json")
        if not os.path.exists(path):
            print(f"[WARN] active_mode.json tidak ditemukan. Default: hybrid_rag")
            return "hybrid_rag"
        with open(path, "r", encoding="utf-8") as f:
            data = _json_lib.load(f)
            mode = data.get("mode", "hybrid_rag")
            print(f"[DEBUG] Mode aktif: {mode.upper()}")
            return mode
    except Exception as e:
        print(f"[WARN] Gagal baca active_mode.json: {e}. Default: hybrid_rag")
        return "hybrid_rag"

ACTIVE_MODE = _get_active_mode()
print(f"✅ Mode aktif: {ACTIVE_MODE.upper()}")

# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

def normalize_text_key(value: str) -> str:
    if value is None:
        return ""
    v = str(value).strip().lower().replace("\u2019", "'")
    return re.sub(r"[^a-z0-9]+", "", v)


def get_user_allergies(user_id: int, db: Session) -> set:
    if not user_id:
        return set()
    try:
        db.expire_all()
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.alergi_herbal:
            return set()
        allergies = user.alergi_herbal
        if isinstance(allergies, str):
            allergies = json.loads(allergies)
        result = set()
        for a in allergies:
            if a and a.lower() != "tidak ada":
                for line in str(a).replace("\r", "").split("\n"):
                    clean = line.split("(")[0].strip().lower()
                    if clean:
                        result.add(clean)
        return result
    except Exception as e:
        print(f"⚠️ Gagal ambil alergi user: {e}")
        return set()


def filter_allergies(herbs: list, allergies: set) -> list:
    if not herbs:
        return []
    if not allergies:
        return herbs
    clean_allergies = {str(a).split("(")[0].strip().lower() for a in allergies}
    filtered = []
    for herb in herbs:
        raw_name = herb.get("name", "")
        name_variants = [
            line.split("(")[0].strip().lower()
            for line in raw_name.replace("\r", "").split("\n")
            if line.strip()
        ]
        is_allergic = any(variant in clean_allergies for variant in name_variants)
        if is_allergic:
            matched = [v for v in name_variants if v in clean_allergies]
            print(f"   🚫 [ALERGI] '{raw_name.splitlines()[0]}' DIELIMINASI → cocok dengan '{matched[0]}'")
        else:
            filtered.append(herb)
    return filtered


def is_child_under_five(user_id: int, db: Session) -> bool:
    if not user_id:
        return False
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user or not user.tanggal_lahir:
            return False
        tgl = (
            datetime.strptime(user.tanggal_lahir, "%Y-%m-%d").date()
            if isinstance(user.tanggal_lahir, str)
            else user.tanggal_lahir
        )
        return (datetime.utcnow().date() - tgl).days / 365.25 < 5
    except Exception as e:
        print(f"⚠️ Gagal cek usia user: {e}")
        return False


def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode('utf-8'), salt).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ==============================================================================
# RBS FILTER FUNCTIONS
# ==============================================================================

def get_safe_herbs_global(herb_names, conditions, db: Session):
    if not herb_names:
        return [], []
    if not conditions:
        return list(herb_names), []

    name_to_main = {h: str(h).strip().split("\n")[0].strip() for h in herb_names}

    herb_main_to_latin_key = {}
    latin_rows = db.execute(text("""
        SELECT herbal_name, latin_name FROM herbal_diagnoses WHERE herbal_name = ANY(:names)
        UNION
        SELECT herbal_name, latin_name FROM herbal_symptoms  WHERE herbal_name = ANY(:names)
    """), {"names": list(herb_names)}).fetchall()
    for herb_n, latin_n in latin_rows:
        main = str(herb_n).strip().split("\n")[0].strip()
        herb_main_to_latin_key[normalize_text_key(main)] = normalize_text_key(latin_n or "")

    unsafe_rows = db.execute(text("""
        SELECT herbal_name, latin_name, special_condition, description, reference
        FROM herbal_special_conditions
        WHERE LOWER(TRIM(special_condition)) = ANY(:conds_lower)
    """), {"conds_lower": [c.strip().lower() for c in list(conditions)]}).fetchall()

    unsafe_by_herb_key  = {}
    unsafe_by_latin_key = {}
    for herb_n, latin_n, cond, desc, ref in unsafe_rows:
        for lookup, key in [
            (unsafe_by_herb_key,  normalize_text_key(herb_n)),
            (unsafe_by_latin_key, normalize_text_key(latin_n or ""))
        ]:
            if not key:
                continue
            if key not in lookup:
                lookup[key] = {"conditions": set(), "descriptions": [], "references": []}
            lookup[key]["conditions"].add(cond)
            if desc and desc.strip() not in lookup[key]["descriptions"]:
                lookup[key]["descriptions"].append(desc.strip())
            if ref and ref.strip() not in lookup[key]["references"]:
                lookup[key]["references"].append(ref.strip())

    safe_herbs        = []
    unsafe_herbs_list = []

    for full_name in herb_names:
        main      = name_to_main[full_name]
        main_key  = normalize_text_key(main)
        latin_key = herb_main_to_latin_key.get(main_key, "")

        matched_herb  = unsafe_by_herb_key.get(main_key)
        matched_latin = unsafe_by_latin_key.get(latin_key) if latin_key else None
        match = matched_herb or matched_latin

        if match:
            conditions_set, descriptions, references = set(), [], []
            for m in [matched_herb, matched_latin]:
                if not m:
                    continue
                conditions_set |= m["conditions"]
                for d in m["descriptions"]:
                    if d not in descriptions: descriptions.append(d)
                for r in m["references"]:
                    if r not in references: references.append(r)

            alasan     = ", ".join(sorted(conditions_set))
            desc_final = " ".join(descriptions) if descriptions else "Analisis medis menunjukkan adanya risiko efek samping."
            ref_final  = ", ".join(references)  if references  else "Pedoman Keamanan Herbal"

            print(f"      🛑 {main} → DIELIMINASI (berbahaya bagi: {alasan})")
            unsafe_herbs_list.append({
                "name":        main,
                "full_name":   full_name.strip(),
                "reason":      f"Berbahaya bagi: {alasan}",
                "description": desc_final,
                "reference":   ref_final
            })
        else:
            safe_herbs.append(full_name)

    return safe_herbs, unsafe_herbs_list


def get_details_global(herb_names, db: Session):
    if not herb_names:
        return []
    result = db.execute(text("""
        SELECT herbal_name, latin_name, image_url, preparation, part_used, part_image_url, source_label, source
        FROM herbal_diagnoses WHERE herbal_name = ANY(:names)
        UNION
        SELECT herbal_name, latin_name, image_url, preparation, part_used, part_image_url, source_label, source
        FROM herbal_symptoms WHERE herbal_name = ANY(:names)
    """), {"names": list(herb_names)}).fetchall()
    res, seen = [], set()
    for r in result:
        if r[0] not in seen:
            res.append({
                "name": r[0], "latin": r[1], "image": r[2], "preparation": r[3],
                "part": r[4], "part_image": r[5], "source_label": r[6], "source_link": r[7]
            })
            seen.add(r[0])
    return res


def apply_all_filters_global(herb_names_set, label, conditions, allergies, db: Session):
    count_raw = len(herb_names_set)
    print(f"\n   📋 [FILTER '{label}'] Total herbal ditemukan: {count_raw}")
    print(f"   {'─'*50}")

    if conditions:
        print(f"   🔎 Filter Kondisi Khusus ({', '.join(conditions)}):")
    safe_names, unsafe_rbs = get_safe_herbs_global(herb_names_set, conditions, db)
    count_rbs = count_raw - len(safe_names)
    if count_rbs == 0:
        print(f"      ✅ Tidak ada yang dieliminasi kondisi khusus")

    details_before = get_details_global(safe_names, db)
    names_before   = {h['name'].splitlines()[0] for h in details_before}
    if allergies:
        print(f"   🔎 Filter Alergi ({', '.join(allergies)}):")
    details_final  = filter_allergies(details_before, allergies)
    names_after    = {h['name'].splitlines()[0] for h in details_final}
    elim_allergy   = names_before - names_after

    unsafe_allergy = []
    for h in details_before:
        h_main = h['name'].splitlines()[0]
        if h_main in elim_allergy:
            unsafe_allergy.append({
                "name":        h_main,
                "full_name":   h['name'],
                "reason":      "Terdeteksi riwayat alergi pada profil Anda",
                "description": "Tanaman ini masuk dalam daftar alergi Anda. Mengonsumsinya dapat memicu reaksi alergi.",
                "reference":   "Profil kesehatan pengguna"
            })

    if not elim_allergy and allergies:
        print(f"      ✅ Tidak ada yang dieliminasi karena alergi")

    all_unsafe = unsafe_rbs + unsafe_allergy

    print(f"   {'─'*50}")
    print(f"   📊 [RINGKASAN '{label}']")
    print(f"      Total awal            : {count_raw} herbal")
    if count_rbs > 0:
        print(f"      🛑 Eliminasi kondisi  : {count_rbs} herbal → {', '.join(u['name'] for u in unsafe_rbs)}")
    else:
        print(f"      🛑 Eliminasi kondisi  : 0 herbal")
    if elim_allergy:
        print(f"      🚫 Eliminasi alergi   : {len(elim_allergy)} herbal → {', '.join(sorted(elim_allergy))}")
    else:
        print(f"      🚫 Eliminasi alergi   : 0 herbal")
    lolos = sorted([h['name'].splitlines()[0] for h in details_final])
    print(f"      ✅ Lolos & ditampilkan: {len(details_final)} herbal")
    if lolos:
        print(f"         → {', '.join(lolos)}")

    return details_final, all_unsafe

# ==============================================================================
# APP SETUP
# ==============================================================================

Base.metadata.create_all(bind=engine)
app = FastAPI()

@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.detail})

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173",
                   "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==============================================================================
# PYDANTIC MODELS
# ==============================================================================

class RegisterRequest(BaseModel):
    name: str
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class SetupAdminRequest(BaseModel):
    email: str
    password: str
    name: Optional[str] = "Admin Herbalyze"

class UpdateProfileRequest(BaseModel):
    user_id: int
    nik: Optional[str] = None
    nama: Optional[str] = None
    tempat_lahir: Optional[str] = None
    tanggal_lahir: Optional[str] = None
    nomor_hp: Optional[str] = None
    jenis_kelamin: Optional[str] = None
    alergi_herbal: Optional[list] = None
    foto_profil: Optional[str] = None

class HybridRequest(BaseModel):
    user_id: int
    query_text: str
    kondisi: list[str]
    obat_kimia: list[str]

class SubmitDraftRequest(BaseModel):
    patient_id: int
    doctor_id: int
    doctor_name: Optional[str] = None
    doctor_instansi: Optional[str] = None
    record_data: dict

class ConsentRequest(BaseModel):
    patient_id: int
    doctor_id: int

class ApproveDoctorRequest(BaseModel):
    user_id: int

class RejectDoctorRequest(BaseModel):
    user_id: int

class ResetRoleRequest(BaseModel):
    user_id: int

class CancelInstansiUpdateRequest(BaseModel):
    user_id: int

class DeleteAccountRequest(BaseModel):
    user_id: int

# ==============================================================================
# ENDPOINTS — AUTH & ADMIN
# ==============================================================================

@app.get("/")
def home():
    return {"message": "Welcome to Herbalyze API"}


@app.post("/api/setup-admin")
def setup_admin(req: SetupAdminRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.role == "Admin").first():
        raise HTTPException(status_code=403, detail="Admin sudah ada.")
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email sudah terdaftar.")
    new_admin = User(
        name=req.name,
        email=req.email,
        password_hash=get_password_hash(req.password),
        role="Admin",
        is_profile_complete=True
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    return {"message": "Admin berhasil dibuat.", "user": new_admin.to_dict()}


@app.post("/api/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == req.email).first():
        raise HTTPException(status_code=400, detail="Email sudah terdaftar")
    new_user = User(
        name=req.name,
        email=req.email,
        password_hash=get_password_hash(req.password),
        role='Patient'
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Registrasi berhasil", "user": new_user.to_dict()}


@app.post("/api/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email atau password salah")
    return {"message": "Login berhasil", "user": user.to_dict()}

# ==============================================================================
# ENDPOINTS — PROFILE
# ==============================================================================

@app.get("/api/profile/{user_id}")
def get_profile(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    return jsonable_encoder(user)


@app.put("/api/profile/update")
def update_profile(req: UpdateProfileRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if req.nik:
        existing_nik = db.query(User).filter(
            User.nik == req.nik, User.id != req.user_id
        ).first()
        if existing_nik:
            raise HTTPException(status_code=400, detail="NIK sudah terdaftar pengguna lain.")
    if req.nik is not None:           user.nik = req.nik
    if req.nama is not None:          user.name = req.nama
    if req.tempat_lahir is not None:  user.tempat_lahir = req.tempat_lahir
    if req.tanggal_lahir is not None: user.tanggal_lahir = req.tanggal_lahir
    if req.nomor_hp is not None:      user.nomor_hp = req.nomor_hp
    if req.jenis_kelamin is not None: user.jenis_kelamin = req.jenis_kelamin
    if req.alergi_herbal is not None: user.alergi_herbal = req.alergi_herbal
    if req.foto_profil is not None:   user.foto_profil = req.foto_profil
    if user.nik and user.name and user.tanggal_lahir and user.alergi_herbal:
        user.is_profile_complete = True
    db.commit()
    db.refresh(user)
    return {"message": "Profil berhasil diperbarui", "user": user.to_dict()}


@app.delete("/api/account/delete")
def delete_account(req: DeleteAccountRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Akun tidak ditemukan")
    db.execute(text("DELETE FROM search_history WHERE user_id = :uid"), {"uid": req.user_id})
    db.delete(user)
    db.commit()
    return {"message": "Akun berhasil dihapus"}

# ==============================================================================
# ENDPOINTS — DOCTOR & ADMIN
# ==============================================================================

@app.get("/api/doctors")
def get_doctors(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.role == "Doctor").order_by(User.name).all()
    return {"doctors": [
        {
            "id": u.id,
            "name": u.name,
            "email": u.email,
            "instansi": u.nama_instansi,
            "foto_profil": u.foto_profil
        } for u in users
    ]}


@app.post("/api/request_doctor")
async def request_doctor(
    user_id: int = Form(...),
    nomor_str: str = Form(...),
    nama_instansi: str = Form(...),
    file_str: UploadFile = File(...),
    file_sip: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    allowed = ["application/pdf", "image/jpeg", "image/png", "application/octet-stream"]
    for f in [file_str, file_sip]:
        if f.content_type not in allowed:
            raise HTTPException(status_code=400, detail=f"Format file {f.filename} tidak didukung")

    # Simpan file ke lokal
    str_path = UPLOAD_DIR / f"str_{user_id}_{file_str.filename}"
    sip_path = UPLOAD_DIR / f"sip_{user_id}_{file_sip.filename}"
    with open(str_path, "wb") as buf:
        shutil.copyfileobj(file_str.file, buf)
    with open(sip_path, "wb") as buf:
        shutil.copyfileobj(file_sip.file, buf)

    user.dokumen_str_path = str(str_path)
    user.dokumen_sip_path = str(sip_path)
    user.role             = "Pending_Doctor"
    user.nomor_str        = nomor_str
    user.nama_instansi    = nama_instansi
    user.created_at       = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {"message": "Permintaan dokter berhasil diajukan.", "user": user.to_dict()}


@app.post("/api/doctor/update_instansi")
async def update_instansi(
    user_id: int = Form(...),
    nama_instansi: str = Form(...),
    file_sip: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if user.role != "Doctor":
        raise HTTPException(status_code=400, detail="Hanya dokter terverifikasi yang dapat mengubah instansi")

    allowed = ["application/pdf", "image/jpeg", "image/png", "application/octet-stream"]
    if file_sip.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Format file SIP tidak didukung")

    sip_path = UPLOAD_DIR / f"sip_{user_id}_{file_sip.filename}"
    with open(sip_path, "wb") as buf:
        shutil.copyfileobj(file_sip.file, buf)

    user.instansi_lama  = user.nama_instansi
    user.instansi_baru  = nama_instansi.strip()
    user.dokumen_sip_path = str(sip_path)
    user.role           = "Pending_Doctor"
    user.nomor_str      = None
    user.created_at     = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return {"message": "Perubahan instansi berhasil diajukan.", "user": user.to_dict()}


@app.get("/api/uploads/{filename}")
def serve_upload(filename: str):
    """Endpoint untuk melayani file dokumen STR/SIP yang diupload."""
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File tidak ditemukan")
    return FileResponse(str(file_path))


@app.get("/api/admin/pending_doctors")
def get_pending_doctors(db: Session = Depends(get_db)):
    users = db.query(User).filter(User.role == "Pending_Doctor").all()
    result = []
    for u in users:
        d = u.to_dict()
        d["nomor_str"]    = u.nomor_str
        d["nama_instansi"] = u.nama_instansi
        d["instansi_lama"] = u.instansi_lama
        d["instansi_baru"] = u.instansi_baru
        # URL akses dokumen via endpoint lokal
        d["dokumen_str_url"] = (
            f"http://localhost:8000/api/uploads/{Path(u.dokumen_str_path).name}"
            if u.dokumen_str_path else None
        )
        d["dokumen_sip_url"] = (
            f"http://localhost:8000/api/uploads/{Path(u.dokumen_sip_path).name}"
            if u.dokumen_sip_path else None
        )
        d["created_at"] = u.created_at.isoformat() if u.created_at else None
        result.append(d)
    return result


@app.post("/api/admin/approve_doctor")
def approve_doctor(req: ApproveDoctorRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if user.role != "Pending_Doctor":
        raise HTTPException(status_code=400, detail="User bukan Pending Doctor")
    user.role         = "Doctor"
    user.instansi_lama = None
    if user.instansi_baru:
        user.nama_instansi = user.instansi_baru
        user.instansi_baru = None
    db.commit()
    db.refresh(user)
    return {"message": "Dokter berhasil diverifikasi.", "user": user.to_dict()}


@app.post("/api/admin/reject_doctor")
def reject_doctor(req: RejectDoctorRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if user.role != "Pending_Doctor":
        raise HTTPException(status_code=400, detail="User bukan Pending Doctor")
    user.dokumen_str_path = None
    if user.nomor_str:
        # Pendaftaran dokter baru → tolak → jadi Rejected_Doctor
        user.nomor_str     = None
        user.nama_instansi = None
        user.role          = "Rejected_Doctor"
    else:
        # Perubahan instansi → tolak → kembali jadi Doctor biasa
        user.role = "Doctor"
    db.commit()
    db.refresh(user)
    return {"message": f"Pengajuan {user.name} berhasil ditolak."}


@app.post("/api/reset_role")
def reset_role(req: ResetRoleRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    user.role = "Patient"
    db.commit()
    db.refresh(user)
    return {"message": "Status direset menjadi Pasien", "user": user.to_dict()}


@app.post("/api/doctor/cancel_instansi_update")
def cancel_instansi_update(req: CancelInstansiUpdateRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")
    if not user.instansi_baru:
        raise HTTPException(status_code=400, detail="Tidak ada pengajuan instansi yang dapat dibatalkan")
    if user.nomor_str:
        raise HTTPException(status_code=400, detail="Pengajuan ini bukan perubahan instansi")
    user.instansi_baru    = None
    user.instansi_lama    = None
    user.dokumen_sip_path = None
    if user.role == 'Pending_Doctor':
        user.role = 'Doctor'
    db.commit()
    db.refresh(user)
    return {"message": "Pengajuan perubahan instansi dibatalkan.", "user": user.to_dict()}


@app.get("/api/patients/by-ids")
def get_patients_by_ids(patient_ids: str, db: Session = Depends(get_db)):
    """Ambil profil pasien berdasarkan list ID (comma-separated)."""
    try:
        ids = [int(i) for i in patient_ids.split(",") if i.strip().isdigit()]
    except Exception:
        return {"patients": []}
    if not ids:
        return {"patients": []}
    users = db.query(User).filter(User.id.in_(ids)).all()
    return {"patients": [
        {"id": u.id, "name": u.name, "email": u.email, "foto_profil": u.foto_profil}
        for u in users
    ]}

# ==============================================================================
# ENDPOINTS — CONSENT
# ==============================================================================

@app.post("/api/consent/grant")
def grant_consent(req: ConsentRequest, db: Session = Depends(get_db)):
    existing = db.query(DoctorPatientConsent).filter_by(
        patient_id=req.patient_id, doctor_id=req.doctor_id
    ).first()
    if existing:
        existing.is_active = True
        db.commit()
        return {"message": "Izin diberikan"}
    db.add(DoctorPatientConsent(
        patient_id=req.patient_id, doctor_id=req.doctor_id, is_active=True
    ))
    db.commit()
    return {"message": "Izin diberikan"}


@app.post("/api/consent/revoke")
def revoke_consent(req: ConsentRequest, db: Session = Depends(get_db)):
    consent = db.query(DoctorPatientConsent).filter_by(
        patient_id=req.patient_id, doctor_id=req.doctor_id
    ).first()
    if not consent:
        raise HTTPException(status_code=404, detail="Consent tidak ditemukan")
    consent.is_active = False
    db.commit()
    return {"message": "Izin dicabut"}


@app.get("/api/consent/patients/{doctor_id}")
def get_consented_patients(doctor_id: int, db: Session = Depends(get_db)):
    consents = db.query(DoctorPatientConsent).filter_by(
        doctor_id=doctor_id, is_active=True
    ).all()
    patient_ids = [c.patient_id for c in consents]
    patients    = db.query(User).filter(User.id.in_(patient_ids)).all()
    return {"patients": [
        {"id": u.id, "name": u.name, "email": u.email, "foto_profil": u.foto_profil}
        for u in patients
    ]}


@app.get("/api/consent/check")
def check_consent(patient_id: int, doctor_id: int, db: Session = Depends(get_db)):
    consent = db.query(DoctorPatientConsent).filter_by(
        patient_id=patient_id, doctor_id=doctor_id, is_active=True
    ).first()
    return {"has_consent": consent is not None}


@app.get("/api/consent/doctors/{patient_id}")
def get_consented_doctors(patient_id: int, db: Session = Depends(get_db)):
    """Daftar dokter yang sudah diberi izin oleh pasien."""
    consents    = db.query(DoctorPatientConsent).filter_by(
        patient_id=patient_id, is_active=True
    ).all()
    doctor_ids  = [c.doctor_id for c in consents]
    doctors     = db.query(User).filter(User.id.in_(doctor_ids)).all()
    return {"doctors": [
        {"id": u.id, "name": u.name, "instansi": u.nama_instansi, "foto_profil": u.foto_profil}
        for u in doctors
    ]}

# ==============================================================================
# ENDPOINTS — HERBAL DATA
# ==============================================================================

@app.get("/api/diagnoses")
def get_diagnoses(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT DISTINCT diagnosis FROM herbal_diagnoses ORDER BY diagnosis;")).fetchall()
    return sorted(set(row[0].strip().title() for row in result if row[0] and row[0].strip()))


@app.get("/api/symptoms")
def get_symptoms(db: Session = Depends(get_db)):
    result = db.execute(text("SELECT DISTINCT symptom FROM herbal_symptoms ORDER BY symptom;")).fetchall()
    return sorted(set(row[0].strip().title() for row in result if row[0] and row[0].strip()))


@app.get("/api/special-conditions")
def get_special_conditions(
    herbal_name: Optional[str] = None,
    latin_name: Optional[str] = None,
    condition: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(HerbalSpecialCondition)
    if herbal_name: query = query.filter(HerbalSpecialCondition.herbal_name.ilike(f'%{herbal_name}%'))
    if latin_name:  query = query.filter(HerbalSpecialCondition.latin_name.ilike(f'%{latin_name}%'))
    if condition:   query = query.filter(HerbalSpecialCondition.special_condition.ilike(f'%{condition}%'))
    return [
        {
            'id': h.index, 'herbal_name': h.herbal_name, 'latin_name': h.latin_name,
            'special_condition': h.special_condition, 'description': h.description, 'reference': h.reference
        }
        for h in query.all()
    ]


@app.get("/api/herbs")
def get_herbs(db: Session = Depends(get_db)):
    result = db.execute(text(
        "SELECT herbal_name FROM herbal_diagnoses UNION SELECT herbal_name FROM herbal_symptoms;"
    )).fetchall()
    filtered = []
    for row in result:
        if row[0]:
            names = [n.strip() for n in row[0].split("\n") if n.strip()]
            filtered.append(
                f"{names[0]} ({', '.join(names[1:])})" if len(names) > 1 else names[0]
            )
    return sorted(filtered)

# ==============================================================================
# ENDPOINTS — REKOMENDASI (SQL Exact Match)
# ==============================================================================

@app.post("/api/recommend")
async def recommend_herbal(request: Request, db: Session = Depends(get_db)):
    try:
        data       = await request.json()
        user_id    = data.get('user_id')       # int atau None (guest)
        sel_diag   = data.get('diagnosis', [])
        sel_symp   = data.get('gejala', [])
        raw_cond   = data.get('kondisi', [])
        obat_kimia = data.get('obat_kimia', [])

        print(f"\n{'='*70}")
        print(f"🚀 [RECOMMEND] user_id={user_id} | diag={sel_diag} | symp={sel_symp}")
        print(f"{'='*70}")

        condition_mapping = {
            "Ibu hamil": "Hamil",
            "Ibu menyusui": "Menyusui",
            "Anak di bawah lima tahun": "anak di bawah 5 tahun"
        }
        sel_cond = [condition_mapping.get(c, c) for c in raw_cond if c != "Tidak ada"]

        if user_id and is_child_under_five(user_id, db):
            if "anak di bawah 5 tahun" not in sel_cond:
                sel_cond.append("anak di bawah 5 tahun")

        user_allergies = get_user_allergies(user_id, db) if user_id else set()

        grouped_results = []
        all_diags = db.execute(text("SELECT diagnosis, herbal_name FROM herbal_diagnoses")).fetchall()
        all_symps = db.execute(text("SELECT symptom,   herbal_name FROM herbal_symptoms")).fetchall()

        for d in sel_diag:
            found = {r[1] for r in all_diags if r[0] and r[0].strip().lower() == d.strip().lower()}
            if not found:
                continue
            details_final, all_unsafe = apply_all_filters_global(found, d, sel_cond, user_allergies, db)
            if details_final or all_unsafe:
                grouped_results.append({
                    "group_type": "Diagnosis", "group_name": d,
                    "herbs": details_final, "unsafe_herbs": all_unsafe
                })

        for s in sel_symp:
            found = {r[1] for r in all_symps if r[0] and r[0].strip().lower() == s.strip().lower()}
            if not found:
                continue
            details_final, all_unsafe = apply_all_filters_global(found, s, sel_cond, user_allergies, db)
            if details_final or all_unsafe:
                grouped_results.append({
                    "group_type": "Gejala", "group_name": s,
                    "herbs": details_final, "unsafe_herbs": all_unsafe
                })

        if grouped_results and user_id:
            try:
                new_history = SearchHistory(
                    user_id=user_id,
                    diagnoses=sel_diag, symptoms=sel_symp,
                    special_conditions=raw_cond, chemical_drugs=obat_kimia,
                    recommendations=grouped_results
                )
                db.add(new_history)
                db.commit()
                db.refresh(new_history)
                print(f"✅ [HISTORY] Tersimpan ID: {new_history.id}")
            except Exception as e:
                db.rollback()
                print(f"❌ [HISTORY] Gagal simpan: {e}")

        return grouped_results

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# ENDPOINTS — REKOMENDASI HYBRID (SQL + SBERT)
# ==============================================================================

@app.post("/api/recommend_hybrid")
async def recommend_hybrid(req: HybridRequest, db: Session = Depends(get_db)):
    start_total = time.time()
    print(f"\n{'='*70}")
    print(f"🚀 [HYBRID] user_id={req.user_id} | query='{req.query_text}'")
    print(f"{'='*70}")

    try:
        query_clean = req.query_text.strip().lower()
        if not query_clean:
            raise HTTPException(status_code=400, detail="Teks keluhan kosong")

        condition_mapping = {
            "Ibu hamil": "Hamil",
            "Ibu menyusui": "Menyusui",
            "Anak di bawah lima tahun": "anak di bawah 5 tahun"
        }
        sel_cond = [condition_mapping.get(c, c) for c in req.kondisi if c != "Tidak ada"]

        if is_child_under_five(req.user_id, db):
            if "anak di bawah 5 tahun" not in sel_cond:
                sel_cond.append("anak di bawah 5 tahun")

        user_allergies = get_user_allergies(req.user_id, db)

        def save_history(result_group):
            try:
                db.add(SearchHistory(
                    user_id=req.user_id,
                    diagnoses=[f"Analisis: {req.query_text[:50]}..."],
                    symptoms=[],
                    special_conditions=req.kondisi,
                    chemical_drugs=req.obat_kimia,
                    recommendations=result_group
                ))
                db.commit()
                print(f"💾 [HISTORY] Tersimpan untuk user_id: {req.user_id}")
            except Exception as e:
                db.rollback()
                print(f"⚠️ [HISTORY] Gagal simpan: {e}")

        # ── NLP CHUNKING ──
        delimiters = (
            r'[.,;/!]|\bdan juga\b|\bdan\b|\bserta\b|\bjuga\b|\bmaupun\b'
            r'|\bdisertai\b|\bbersama\b|\bplus\b|\bditambah\b|\bselain itu\b'
            r'|\blainnya\b|\btermasuk\b|\bseperti\b|\btetapi\b'
        )
        raw_chunks    = re.split(delimiters, query_clean)
        clean_chunks  = []
        skipped_chunks = []

        for chunk in raw_chunks:
            temp = chunk.strip()
            if not temp:
                continue
            words = re.sub(r'[^\w\s]', '', temp).split()

            if any(phrase in temp for phrase in NLP_NEGATION_PHRASES):
                skipped_chunks.append(temp)
                continue

            negation_positions = [i for i, w in enumerate(words) if w in NLP_NEGATION_WORDS]
            if negation_positions:
                NEGATION_SCOPE  = 3
                negated_indices = set()
                for neg_idx in negation_positions:
                    negated_indices.add(neg_idx)
                    for offset in range(1, NEGATION_SCOPE + 1):
                        if neg_idx + offset < len(words):
                            negated_indices.add(neg_idx + offset)

                positive_words = [w for i, w in enumerate(words) if i not in negated_indices]
                negated_words  = [w for i, w in enumerate(words) if i in negated_indices]
                if negated_words:
                    skipped_chunks.append(" ".join(negated_words))

                filtered = [w for w in positive_words if w not in NLP_STOPWORDS]
                result   = " ".join(filtered).strip()
                if len(result) > 2:
                    clean_chunks.append(result)
            else:
                filtered = [w for w in words if w not in NLP_STOPWORDS]
                result   = " ".join(filtered).strip()
                if len(result) > 2:
                    clean_chunks.append(result)

        print(f"   Chunks diproses : {clean_chunks}")
        if skipped_chunks:
            print(f"   Chunks diabaikan: {skipped_chunks}")

        grouped_data = {}
        chunks_to_ai = []

        # ── LAPIS 1: SQL EXACT MATCH ──
        if ACTIVE_MODE == "hybrid_rag":
            start_l1 = time.time()
            for chunk in clean_chunks:
                diag_db = db.execute(text(
                    "SELECT herbal_name FROM herbal_diagnoses WHERE TRIM(diagnosis) ILIKE TRIM(:q)"
                ), {"q": chunk}).fetchall()
                symp_db = db.execute(text(
                    "SELECT herbal_name FROM herbal_symptoms WHERE TRIM(symptom) ILIKE TRIM(:q)"
                ), {"q": chunk}).fetchall()

                if diag_db or symp_db:
                    baku_name = chunk.strip().capitalize()
                    db_res    = diag_db if diag_db else symp_db
                    herbs_list, unsafe_list = apply_all_filters_global(
                        {row[0] for row in db_res}, baku_name, sel_cond, user_allergies, db
                    )
                    if herbs_list or unsafe_list:
                        if baku_name not in grouped_data:
                            grouped_data[baku_name] = {
                                "group_type": "Diagnosis" if diag_db else "Gejala",
                                "group_name": baku_name,
                                "herbs": herbs_list,
                                "unsafe_herbs": unsafe_list,
                                "detected_from_list": [chunk]
                            }
                        else:
                            if chunk not in grouped_data[baku_name]["detected_from_list"]:
                                grouped_data[baku_name]["detected_from_list"].append(chunk)
                            existing_safe   = {h["name"] for h in grouped_data[baku_name]["herbs"]}
                            existing_unsafe = {u["name"] for u in grouped_data[baku_name]["unsafe_herbs"]}
                            for herb in herbs_list:
                                if herb["name"] not in existing_safe:
                                    grouped_data[baku_name]["herbs"].append(herb)
                            for u in unsafe_list:
                                if u["name"] not in existing_unsafe:
                                    grouped_data[baku_name]["unsafe_herbs"].append(u)
                else:
                    chunks_to_ai.append(chunk)
            print(f"⏱️  Lapis 1: {(time.time() - start_l1)*1000:.2f} ms")
        else:
            chunks_to_ai = clean_chunks

        # ── LAPIS 2: SBERT ──
        if chunks_to_ai:
            start_l2 = time.time()
            from sentence_transformers import SentenceTransformer
            import chromadb
            model_ai      = SentenceTransformer('intfloat/multilingual-e5-small')
            chroma_client = chromadb.PersistentClient(path="./chroma_db")
            collection    = chroma_client.get_collection(name="med_labels")

            for chunk in chunks_to_ai:
                cv = model_ai.encode([f"query: {chunk}"]).tolist()
                sr = collection.query(query_embeddings=cv, n_results=1)

                if sr['distances'][0]:
                    similarity = (1 - sr['distances'][0][0]) * 100
                    label_baku = sr['metadatas'][0][0]['baku'].strip()
                    baku_cap   = label_baku.capitalize()
                    print(f"   🤖 SBERT: '{chunk}' → '{label_baku}' ({similarity:.2f}%)")

                    if similarity >= 88.0:
                        is_diag = db.execute(text(
                            "SELECT 1 FROM herbal_diagnoses WHERE TRIM(diagnosis) ILIKE TRIM(:q)"
                        ), {"q": label_baku}).first()
                        ai_db = db.execute(text("""
                            SELECT herbal_name FROM herbal_diagnoses WHERE TRIM(diagnosis) ILIKE TRIM(:q)
                            UNION
                            SELECT herbal_name FROM herbal_symptoms  WHERE TRIM(symptom)   ILIKE TRIM(:q)
                        """), {"q": label_baku}).fetchall()

                        herbs_ai_list, unsafe_ai_list = apply_all_filters_global(
                            {r[0] for r in ai_db}, baku_cap, sel_cond, user_allergies, db
                        )

                        if herbs_ai_list or unsafe_ai_list:
                            if baku_cap not in grouped_data:
                                grouped_data[baku_cap] = {
                                    "group_type": "Diagnosis" if is_diag else "Gejala",
                                    "group_name": baku_cap,
                                    "herbs": herbs_ai_list,
                                    "unsafe_herbs": unsafe_ai_list,
                                    "detected_from_list": [chunk]
                                }
                            else:
                                if chunk not in grouped_data[baku_cap]["detected_from_list"]:
                                    grouped_data[baku_cap]["detected_from_list"].append(chunk)
                                existing_safe   = {h["name"] for h in grouped_data[baku_cap]["herbs"]}
                                existing_unsafe = {u["name"] for u in grouped_data[baku_cap]["unsafe_herbs"]}
                                for herb in herbs_ai_list:
                                    if herb["name"] not in existing_safe:
                                        grouped_data[baku_cap]["herbs"].append(herb)
                                for u in unsafe_ai_list:
                                    if u["name"] not in existing_unsafe:
                                        grouped_data[baku_cap]["unsafe_herbs"].append(u)

            print(f"⏱️  Lapis 2: {(time.time() - start_l2)*1000:.2f} ms")

        # ── FINAL CONSOLIDATION ──
        final_result_groups = []
        for name, data in grouped_data.items():
            sources = data["detected_from_list"]
            h_list  = [f'"{s}"' for s in sources]
            h_text  = (", ".join(h_list[:-1]) + f' dan {h_list[-1]}') if len(h_list) > 1 else h_list[0]
            final_result_groups.append({
                "group_type":   data["group_type"],
                "group_name":   name,
                "header_info":  f"Berdasarkan keluhan: {h_text}",
                "mapping_info": f'Berdasarkan keluhan {h_text}, sistem mengenali sebagai "{name}"',
                "herbs":        data["herbs"],
                "unsafe_herbs": data.get("unsafe_herbs", []),
            })

        print(f"✨ [SELESAI] {len(final_result_groups)} kategori | {(time.time()-start_total)*1000:.2f} ms")

        if final_result_groups:
            save_history(final_result_groups)
        return final_result_groups

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# ENDPOINTS — HISTORY
# ==============================================================================

@app.get("/api/history/{user_id}")
def get_user_history(user_id: int, db: Session = Depends(get_db)):
    try:
        records = db.query(SearchHistory).filter(
            SearchHistory.user_id == user_id,
            SearchHistory.is_deleted == False
        ).order_by(SearchHistory.created_at.desc()).all()
        return [{
            "id":               r.id,
            "diagnoses":        r.diagnoses,
            "symptoms":         r.symptoms,
            "special_conditions": r.special_conditions,
            "chemical_drugs":   r.chemical_drugs,
            "recommendations":  r.recommendations,
            "created_at":       r.created_at.strftime("%Y-%m-%dT%H:%M:%S") + "Z" if r.created_at else None,
        } for r in records]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/history/{history_id}")
def delete_history(history_id: int, user_id: int, db: Session = Depends(get_db)):
    try:
        record = db.query(SearchHistory).filter(
            SearchHistory.id == history_id,
            SearchHistory.user_id == user_id
        ).first()
        if not record:
            raise HTTPException(status_code=404, detail="Riwayat tidak ditemukan")
        record.is_deleted = True
        db.commit()
        return {"message": "Riwayat berhasil dihapus"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# ==============================================================================
# ENDPOINTS — MEDICAL RECORD
# ==============================================================================

@app.post("/api/medical-record/draft")
def submit_draft(req: SubmitDraftRequest, db: Session = Depends(get_db)):
    consent = db.query(DoctorPatientConsent).filter_by(
        patient_id=req.patient_id, doctor_id=req.doctor_id, is_active=True
    ).first()
    if not consent:
        raise HTTPException(status_code=403, detail="Pasien belum memberi izin")

    existing = db.query(MedicalRecordDraft).filter_by(
        patient_id=req.patient_id, doctor_id=req.doctor_id, status="PENDING"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sudah ada draft menunggu persetujuan")

    draft = MedicalRecordDraft(
        patient_id=req.patient_id,
        doctor_id=req.doctor_id,
        doctor_name=req.doctor_name,
        doctor_instansi=req.doctor_instansi,
        record_data=req.record_data,
        status="PENDING"
    )
    db.add(draft)
    db.commit()
    db.refresh(draft)
    return {"message": "Draft berhasil disimpan", "draft": draft.to_dict()}


@app.get("/api/medical-record/draft/pending/{patient_id}")
def get_pending_drafts(patient_id: int, db: Session = Depends(get_db)):
    drafts = db.query(MedicalRecordDraft).filter_by(
        patient_id=patient_id, status="PENDING"
    ).order_by(MedicalRecordDraft.created_at.desc()).all()
    return {"count": len(drafts), "drafts": [d.to_dict() for d in drafts]}


@app.post("/api/medical-record/draft/{draft_id}/approve")
def approve_draft(draft_id: int, db: Session = Depends(get_db)):
    draft = db.query(MedicalRecordDraft).filter_by(id=draft_id, status="PENDING").first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan")

    rd = draft.record_data
    record = MedicalRecord(
        patient_id=draft.patient_id,
        doctor_id=draft.doctor_id,
        doctor_name=draft.doctor_name,
        doctor_instansi=draft.doctor_instansi,
        diagnosis=rd.get("diagnosis"),
        gejala=rd.get("gejala"),
        obat=rd.get("obat"),
        kondisi_khusus=rd.get("kondisiKhusus"),
        catatan_tambahan=rd.get("catatanTambahan"),
    )
    db.add(record)
    db.delete(draft)
    db.commit()
    db.refresh(record)
    return {"message": "Rekam medis berhasil disimpan", "record": record.to_dict()}


@app.post("/api/medical-record/draft/{draft_id}/reject")
def reject_draft(draft_id: int, db: Session = Depends(get_db)):
    draft = db.query(MedicalRecordDraft).filter_by(id=draft_id, status="PENDING").first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft tidak ditemukan")
    db.delete(draft)
    db.commit()
    return {"message": "Draft ditolak dan dihapus"}


@app.get("/api/medical-record/patient/{patient_id}")
def get_patient_records(patient_id: int, db: Session = Depends(get_db)):
    records = db.query(MedicalRecord).filter_by(
        patient_id=patient_id
    ).order_by(MedicalRecord.created_at.desc()).all()
    return {"records": [r.to_dict() for r in records]}


@app.get("/api/medical-record/doctor/{doctor_id}")
def get_doctor_records(doctor_id: int, db: Session = Depends(get_db)):
    records = db.query(MedicalRecord).filter_by(
        doctor_id=doctor_id
    ).order_by(MedicalRecord.created_at.desc()).all()
    return {"records": [r.to_dict() for r in records]}


# ==============================================================================
# ENDPOINTS — PREMIUM SUBSCRIPTION (XENDIT QRIS)
# ==============================================================================

XENDIT_SECRET_KEY = os.getenv("XENDIT_SECRET_KEY", "")
FREE_EXACT_MATCH_QUOTA = 5   # kuota lifetime untuk free user


def _xendit_auth_header() -> str:
    """Basic auth header untuk Xendit API (secret_key:)"""
    token = base64.b64encode(f"{XENDIT_SECRET_KEY}:".encode()).decode()
    return f"Basic {token}"


def _check_premium_active(user_id: int, db: Session) -> bool:
    """Cek apakah user memiliki langganan premium yang aktif."""
    now = datetime.utcnow()
    sub = db.query(PremiumSubscription).filter(
        PremiumSubscription.user_id == user_id,
        PremiumSubscription.status == "PAID",
        PremiumSubscription.expires_at > now
    ).order_by(PremiumSubscription.expires_at.desc()).first()
    return sub is not None


class CreateQrisRequest(BaseModel):
    user_id: int


@app.post("/api/premium/upload-proof")
async def upload_proof(
    user_id: int = Form(...),
    file_bukti: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    if _check_premium_active(user_id, db):
        raise HTTPException(status_code=400, detail="Anda sudah memiliki langganan premium aktif.")

    # Hapus PENDING invoice lama agar tidak menumpuk
    db.query(PremiumSubscription).filter(
        PremiumSubscription.user_id == user_id,
        PremiumSubscription.status == "PENDING"
    ).delete(synchronize_session=False)

    allowed = ["application/pdf", "image/jpeg", "image/png", "application/octet-stream"]
    if file_bukti.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Format file tidak didukung")

    bukti_path = UPLOAD_DIR / f"bukti_{user_id}_{int(datetime.utcnow().timestamp())}_{file_bukti.filename}"
    with open(bukti_path, "wb") as buf:
        shutil.copyfileobj(file_bukti.file, buf)

    sub = PremiumSubscription(
        user_id=user_id,
        amount=5000.0,
        status="PENDING",
        bukti_transfer_path=str(bukti_path)
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return {"message": "Bukti transfer berhasil diunggah", "subscription": sub.to_dict()}


@app.get("/api/admin/pending_premiums")
def get_pending_premiums(db: Session = Depends(get_db)):
    subs = db.query(PremiumSubscription).filter(PremiumSubscription.status == "PENDING").all()
    result = []
    for s in subs:
        user = db.query(User).filter(User.id == s.user_id).first()
        if not user: continue
        d = s.to_dict()
        d["user_name"] = user.name
        d["user_email"] = user.email
        d["created_at"] = s.created_at.isoformat() if s.created_at else None
        result.append(d)
    return result

class ApprovePremiumRequest(BaseModel):
    subscription_id: int

@app.post("/api/admin/approve_premium")
def approve_premium(req: ApprovePremiumRequest, db: Session = Depends(get_db)):
    sub = db.query(PremiumSubscription).filter(
        PremiumSubscription.id == req.subscription_id, 
        PremiumSubscription.status == "PENDING"
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan")
    now = datetime.utcnow()
    sub.status = "PAID"
    sub.started_at = now
    sub.expires_at = now + timedelta(days=30)
    db.commit()
    db.refresh(sub)
    return {"message": "Premium berhasil disetujui", "subscription": sub.to_dict()}

@app.post("/api/admin/reject_premium")
def reject_premium(req: ApprovePremiumRequest, db: Session = Depends(get_db)):
    sub = db.query(PremiumSubscription).filter(
        PremiumSubscription.id == req.subscription_id, 
        PremiumSubscription.status == "PENDING"
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Pengajuan tidak ditemukan")
    sub.status = "FAILED"
    db.commit()
    return {"message": "Pengajuan ditolak"}


@app.get("/api/premium/status/{user_id}")
def get_premium_status(user_id: int, db: Session = Depends(get_db)):
    """Polling oleh frontend untuk cek status premium user."""
    now = datetime.utcnow()

    # Ekspirasi otomatis subscription yang kadaluarsa
    db.query(PremiumSubscription).filter(
        PremiumSubscription.user_id == user_id,
        PremiumSubscription.status == "PAID",
        PremiumSubscription.expires_at <= now
    ).update({"status": "EXPIRED"}, synchronize_session=False)
    db.commit()

    # Ambil langganan aktif terbaru
    active_sub = db.query(PremiumSubscription).filter(
        PremiumSubscription.user_id == user_id,
        PremiumSubscription.status == "PAID",
        PremiumSubscription.expires_at > now
    ).order_by(PremiumSubscription.expires_at.desc()).first()

    # Ambil user untuk exact_match_count
    user = db.query(User).filter(User.id == user_id).first()
    exact_count = user.exact_match_count if user else 0

    if active_sub:
        return {
            "is_premium": True,
            "expires_at": active_sub.expires_at.isoformat(),
            "started_at": active_sub.started_at.isoformat(),
            "exact_match_count": exact_count,
            "exact_match_quota": FREE_EXACT_MATCH_QUOTA,
        }

    # Cek apakah ada PENDING (menunggu bayar)
    pending_sub = db.query(PremiumSubscription).filter(
        PremiumSubscription.user_id == user_id,
        PremiumSubscription.status == "PENDING"
    ).order_by(PremiumSubscription.created_at.desc()).first()

    return {
        "is_premium": False,
        "expires_at": None,
        "started_at": None,
        "pending_payment": pending_sub.to_dict() if pending_sub else None,
        "exact_match_count": exact_count,
        "exact_match_quota": FREE_EXACT_MATCH_QUOTA,
    }




class RecordExactMatchRequest(BaseModel):
    user_id: int


@app.post("/api/premium/record-exact-match")
def record_exact_match(req: RecordExactMatchRequest, db: Session = Depends(get_db)):
    """
    Catat penggunaan exact match oleh user.
    Mengembalikan quota sisa dan apakah masih boleh melakukan exact match.
    """
    user = db.query(User).filter(User.id == req.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User tidak ditemukan")

    # Cek apakah premium aktif → unlimited
    if _check_premium_active(req.user_id, db):
        return {
            "allowed": True,
            "is_premium": True,
            "exact_match_count": user.exact_match_count or 0,
            "quota_remaining": -1,   # -1 = unlimited
        }

    # Free user → cek quota
    current_count = user.exact_match_count or 0
    if current_count >= FREE_EXACT_MATCH_QUOTA:
        return {
            "allowed": False,
            "is_premium": False,
            "exact_match_count": current_count,
            "quota_remaining": 0,
        }

    user.exact_match_count = current_count + 1
    db.commit()
    remaining = FREE_EXACT_MATCH_QUOTA - user.exact_match_count
    return {
        "allowed": True,
        "is_premium": False,
        "exact_match_count": user.exact_match_count,
        "quota_remaining": remaining,
    }