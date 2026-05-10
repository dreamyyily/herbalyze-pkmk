from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DateTime, ForeignKey, Float
from datetime import datetime
from db import Base

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    email = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(256), nullable=True)
    is_profile_complete = Column(Boolean, default=False)
    role = Column(String(50), default='Patient')
    nik = Column(String(20), nullable=True)
    tempat_lahir = Column(String(100), nullable=True)
    tanggal_lahir = Column(String(20), nullable=True)
    nomor_hp = Column(String(20), nullable=True)
    jenis_kelamin = Column(String(20), nullable=True)
    alergi_herbal = Column(JSON, default=list, nullable=True)
    foto_profil = Column(Text, nullable=True)
    nomor_str = Column(String(100), nullable=True)
    nama_instansi = Column(String(255), nullable=True)
    instansi_lama = Column(String, nullable=True)
    instansi_baru = Column(String, nullable=True)
    dokumen_str_path = Column(String(500), nullable=True)
    dokumen_sip_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Freemium fields
    exact_match_count = Column(Integer, default=0, nullable=False)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'is_profile_complete': self.is_profile_complete,
            'role': self.role,
            'nik': self.nik,
            'tempat_lahir': self.tempat_lahir,
            'tanggal_lahir': self.tanggal_lahir,
            'nomor_hp': self.nomor_hp,
            'jenis_kelamin': self.jenis_kelamin,
            'alergi_herbal': self.alergi_herbal or [],
            'foto_profil': self.foto_profil,
            'nama_instansi': self.nama_instansi,
            'instansi_lama': self.instansi_lama,
            'instansi_baru': self.instansi_baru,
            'nomor_str': self.nomor_str,
            'exact_match_count': self.exact_match_count or 0,
        }


class HerbalDiagnosis(Base):
    __tablename__ = 'herbal_diagnoses'
    index = Column(Integer, primary_key=True, index=True)
    diagnosis = Column(String(255))
    herbal_name = Column(Text)
    latin_name = Column(String(255))
    image_url = Column(Text)
    part_used = Column(String(255))
    part_image_url = Column(Text)
    preparation = Column(Text)
    source_label = Column(String(255))
    source = Column(Text)


class HerbalSymptom(Base):
    __tablename__ = 'herbal_symptoms'
    index = Column(Integer, primary_key=True, index=True)
    symptom = Column(String(255))
    herbal_name = Column(Text)
    latin_name = Column(String(255))
    image_url = Column(Text)
    part_used = Column(String(255))
    part_image_url = Column(Text)
    preparation = Column(Text)
    source_label = Column(String(255))
    source = Column(Text)


class HerbalSpecialCondition(Base):
    __tablename__ = 'herbal_special_conditions'
    index = Column(Integer, primary_key=True)
    herbal_name = Column(String(255))
    latin_name = Column(String(255))
    special_condition = Column(String(255))
    description = Column(Text)
    reference = Column(Text)


class SearchHistory(Base):
    __tablename__ = 'search_history'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True) 
    diagnoses = Column(JSON, default=list)
    symptoms = Column(JSON, default=list)
    special_conditions = Column(JSON, default=list)
    chemical_drugs = Column(JSON, default=list)
    recommendations = Column(JSON, nullable=True)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f"<SearchHistory user_id={self.user_id} - {self.created_at}>"  


class MedicalRecordDraft(Base):
    __tablename__ = 'medical_record_drafts'
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)  
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)            
    doctor_name = Column(String(255), nullable=True)
    doctor_instansi = Column(String(255), nullable=True)
    record_data = Column(JSON, nullable=False)
    status = Column(String(20), default="PENDING", nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,     
            "doctor_name": self.doctor_name,
            "doctor_instansi": self.doctor_instansi,
            "record_data": self.record_data,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MedicalRecord(Base):
    __tablename__ = 'medical_records'
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)  
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False)          
    doctor_name = Column(String(255), nullable=True)
    doctor_instansi = Column(String(255), nullable=True)
    diagnosis = Column(Text, nullable=True)
    gejala = Column(Text, nullable=True)
    obat = Column(Text, nullable=True)
    kondisi_khusus = Column(String(100), nullable=True)
    catatan_tambahan = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "doctor_name": self.doctor_name,
            "doctor_instansi": self.doctor_instansi,
            "diagnosis": self.diagnosis,
            "gejala": self.gejala,
            "obat": self.obat,
            "kondisi_khusus": self.kondisi_khusus,
            "catatan_tambahan": self.catatan_tambahan,  
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DoctorPatientConsent(Base):
    __tablename__ = 'doctor_patient_consents'
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True) 
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)                            

    def to_dict(self):
        return {
            "id": self.id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PremiumSubscription(Base):
    __tablename__ = 'premium_subscriptions'
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    xendit_invoice_id = Column(String(255), nullable=True, unique=True)
    qr_string = Column(Text, nullable=True)          # QR code string dari Xendit
    qr_image_url = Column(Text, nullable=True)        # URL gambar QR dari Xendit
    amount = Column(Float, default=5000.0)
    status = Column(String(30), default='PENDING')   # PENDING | PAID | EXPIRED | FAILED
    bukti_transfer_path = Column(String(500), nullable=True) # Bukti transfer
    started_at = Column(DateTime, nullable=True)      # Saat pembayaran terverifikasi
    expires_at = Column(DateTime, nullable=True)      # started_at + 30 hari
    created_at = Column(DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id': self.id,
            'user_id': self.user_id,
            'xendit_invoice_id': self.xendit_invoice_id,
            'qr_string': self.qr_string,
            'qr_image_url': self.qr_image_url,
            'amount': self.amount,
            'status': self.status,
            'bukti_transfer_url': f"http://localhost:8000/api/uploads/{__import__('pathlib').Path(self.bukti_transfer_path).name}" if self.bukti_transfer_path else None,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }