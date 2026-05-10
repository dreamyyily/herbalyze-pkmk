import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASSWORD = os.getenv('DB_PASSWORD', '12345') 
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5433') # The .env uses 5433
DB_NAME = os.getenv('DB_NAME', 'herbalyze_pkmk') 

SQLALCHEMY_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)

try:
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE premium_subscriptions ADD COLUMN bukti_transfer_path VARCHAR(500);"))
        conn.commit()
    print("Column added successfully!")
except Exception as e:
    print("Error:", e)
