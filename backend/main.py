#!/usr/bin/env python3
"""Za-Biometrie Backend Service - Facial recognition API using DeepFace."""
import os, json, logging, base64
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import numpy as np
from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.services.storage import Storage
from appwrite.id import ID
from appwrite.query import Query

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID", "biometrie_db")
BIOMETRICS_COLLECTION_ID = os.getenv("APPWRITE_BIOMETRICS_COLLECTION_ID", "biometric_profiles")
AUDIT_COLLECTION_ID = os.getenv("APPWRITE_AUDIT_COLLECTION_ID", "audit_logs")
STORAGE_BUCKET_ID = os.getenv("APPWRITE_STORAGE_BUCKET_ID", "face_images")
VERIFICATION_THRESHOLD = float(os.getenv("VERIFICATION_THRESHOLD", "0.6"))

client = Client()
client.set_endpoint(APPWRITE_ENDPOINT)
client.set_project(APPWRITE_PROJECT_ID)
client.set_key(APPWRITE_API_KEY)
databases = Databases(client)

class EnrollmentRequest(BaseModel):
    user_id: str
    username: str
    embedding: list[float]
    image_data: Optional[str] = None

class VerificationRequest(BaseModel):
    user_id: str
    embedding: list[float]
    session_id: Optional[str] = None

def euclidean_distance(a, b):
    if len(a) != len(b): raise ValueError("Embedding length mismatch")
    return float(np.sqrt(np.sum((np.array(a) - np.array(b)) ** 2)))

def cosine_similarity(a, b):
    a_arr, b_arr = np.array(a), np.array(b)
    norm_a, norm_b = np.linalg.norm(a_arr), np.linalg.norm(b_arr)
    if norm_a == 0 or norm_b == 0: return 0.0
    return float(np.dot(a_arr, b_arr) / (norm_a * norm_b))

def create_audit_log(user_id, event_type, details, ip_address="", user_agent=""):
    try:
        databases.create_document(
            database_id=APPWRITE_DATABASE_ID, collection_id=AUDIT_COLLECTION_ID,
            document_id=ID.unique(),
            data={"user_id": user_id, "event_type": event_type, "details": details,
                  "timestamp": datetime.now(timezone.utc).isoformat(),
                  "ip_address": ip_address or "unknown", "user_agent": user_agent or "unknown"})
    except Exception as e:
        logger.error(f"Audit log failed: {e}")

def get_ip(req: Request):
    return req.client.host if req.client else "unknown"

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Za-Biometrie backend starting...")
    yield
    logger.info("Za-Biometrie backend shutting down...")

app = FastAPI(title="Za-Biometrie API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "za-biometrie-backend", "version": "1.0.0"}

@app.post("/api/enroll")
async def enroll_face(request: EnrollmentRequest, req: Request):
    try:
        logger.info(f"Enrollment for user: {request.user_id}")
        if len(request.embedding) not in [128, 512]:
            raise HTTPException(status_code=400, detail=f"Invalid embedding length: {len(request.embedding)}")

        existing = databases.list_documents(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
            queries=[Query.equal("user_id", request.user_id)])
        if existing.get("documents"):
            profile_id = existing["documents"][0]["$id"]
            databases.update_document(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
                document_id=profile_id,
                data={"face_embedding": json.dumps(request.embedding), "enrollment_date": datetime.now(timezone.utc).isoformat(),
                      "last_verification": datetime.now(timezone.utc).isoformat(), "status": "active"})
            create_audit_log(request.user_id, "biometric_re_enrollment", f"Face re-enrolled for {request.username}", get_ip(req), req.headers.get("user-agent", ""))
            return {"success": True, "message": "Face re-enrollment successful!", "profile_id": profile_id}

        profile = databases.create_document(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
            document_id=ID.unique(),
            data={"user_id": request.user_id, "username": request.username, "face_embedding": json.dumps(request.embedding),
                  "enrollment_date": datetime.now(timezone.utc).isoformat(), "last_verification": datetime.now(timezone.utc).isoformat(), "status": "active"})

        if request.image_data:
            try:
                storage = Storage(client)
                image_bytes = base64.b64decode(request.image_data.split(",")[1] if "," in request.image_data else request.image_data)
                storage.create_file(bucket_id=STORAGE_BUCKET_ID, file_id=f"face_{request.user_id}",
                    file=(f"face_{request.user_id}.jpg", image_bytes, "image/jpeg"), permissions=[f"user:{request.user_id}"])
            except Exception as e:
                logger.warning(f"Image upload failed: {e}")

        create_audit_log(request.user_id, "biometric_enrollment", f"Face enrolled for {request.username}", get_ip(req), req.headers.get("user-agent", ""))
        return {"success": True, "message": "Face enrollment successful!", "profile_id": profile["$id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Enrollment error: {e}")
        raise HTTPException(status_code=500, detail=f"Enrollment failed: {str(e)}")

@app.post("/api/verify")
async def verify_face(request: VerificationRequest, req: Request):
    try:
        logger.info(f"Verification for user: {request.user_id}")
        profile_response = databases.list_documents(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
            queries=[Query.equal("user_id", request.user_id)])
        if not profile_response.get("documents"):
            create_audit_log(request.user_id, "biometric_verification_failed", "No profile found", get_ip(req))
            raise HTTPException(status_code=404, detail="No biometric profile found. Please enroll first.")

        profile = profile_response["documents"][0]
        stored_embedding = json.loads(profile["face_embedding"])
        euclidean = euclidean_distance(request.embedding, stored_embedding)
        cosine = cosine_similarity(request.embedding, stored_embedding)
        logger.info(f"Scores - Euclidean: {euclidean:.4f}, Cosine: {cosine:.4f}")
        is_match = euclidean < VERIFICATION_THRESHOLD and cosine > 0.5

        if is_match:
            databases.update_document(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
                document_id=profile["$id"], data={"last_verification": datetime.now(timezone.utc).isoformat()})
            create_audit_log(request.user_id, "biometric_verification_success", f"Verified (euclidean: {euclidean:.4f})", get_ip(req))
            return {"success": True, "message": "Face verified successfully!", "euclidean_distance": euclidean, "cosine_similarity": cosine}
        else:
            create_audit_log(request.user_id, "biometric_verification_failed", f"Failed (euclidean: {euclidean:.4f})", get_ip(req))
            return {"success": False, "message": "Face verification failed. Please try again.", "euclidean_distance": euclidean, "cosine_similarity": cosine}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Verification error: {e}")
        raise HTTPException(status_code=500, detail=f"Verification failed: {str(e)}")

@app.get("/api/profile/{user_id}")
async def get_biometric_profile(user_id: str):
    try:
        profile_response = databases.list_documents(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
            queries=[Query.equal("user_id", user_id)])
        if not profile_response.get("documents"):
            return {"success": False, "has_profile": False, "profile": None}
        profile = profile_response["documents"][0]
        safe_profile = {k: v for k, v in profile.items() if k != "face_embedding"}
        return {"success": True, "has_profile": True, "profile": safe_profile}
    except Exception as e:
        logger.error(f"Profile fetch error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch biometric profile.")

@app.delete("/api/profile/{user_id}")
async def delete_biometric_profile(user_id: str, req: Request):
    try:
        profile_response = databases.list_documents(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID,
            queries=[Query.equal("user_id", user_id)])
        if not profile_response.get("documents"):
            raise HTTPException(status_code=404, detail="No biometric profile found.")
        profile_id = profile_response["documents"][0]["$id"]
        databases.delete_document(database_id=APPWRITE_DATABASE_ID, collection_id=BIOMETRICS_COLLECTION_ID, document_id=profile_id)
        create_audit_log(user_id, "biometric_profile_deleted", "Profile deleted", get_ip(req))
        return {"success": True, "message": "Biometric profile deleted."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile deletion error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete profile.")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    logger.info(f"Starting Za-Biometrie backend on port {port}")
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
