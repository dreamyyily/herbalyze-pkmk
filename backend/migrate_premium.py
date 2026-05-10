import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "12345")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5433")
DB_NAME = os.getenv("DB_NAME", "herbalyze_pkmk")

DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)

def run():
    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE users ADD COLUMN exact_match_count INTEGER DEFAULT 0 NOT NULL;"))
            print("Added exact_match_count to users")
        except Exception as e:
            print(f"Failed to add column (might already exist): {e}")
        conn.commit()

if __name__ == "__main__":
    from models import Base
    Base.metadata.create_all(bind=engine)
    run()
    print("Migration done")
