import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Product Quality Inspection & Defect Tracking System"
    VERSION: str = "2.0.0"
    API_PREFIX: str = "/api"
    SECRET_KEY: str = "buildathon2_super_secret_quality_assurance_jwt_key_2026"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours
    
    # Storage & DB
    BASE_DIR: str = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    DATABASE_URL: str = f"sqlite:///{os.path.join(BASE_DIR, 'quality_system.db')}"
    UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads")
    EVAL_DATASET_DIR: str = os.path.join(BASE_DIR, "eval_dataset")

    class Config:
        case_sensitive = True

settings = Settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
os.makedirs(settings.EVAL_DATASET_DIR, exist_ok=True)
