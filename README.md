# Za-Biometrie 🔐

> **Enterprise-grade biometric authentication platform with facial recognition**

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=for-the-badge&logo=tailwindcss)](https://tailwindcss.com/)
[![Appwrite](https://img.shields.io/badge/Appwrite-Cloud-f02e6e?style=for-the-badge&logo=appwrite)](https://appwrite.io/)
[![Python](https://img.shields.io/badge/Python-3.11-3776ab?style=for-the-badge&logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)

---

## 📋 Product Overview

Za-Biometrie is a polished, production-ready biometric authentication platform that combines traditional password-based authentication with facial recognition enrollment and verification. Built on top of the original `tp_Biometrie` project, it preserves all existing business logic while completely rebuilding the UI/UX from scratch into a premium, modern experience.

### Key Features

- 🔒 **Secure Authentication** — SHA-256 password hashing with unique salts, progressive rate limiting (5s/10s/15s cooldown), and brute-force protection
- 🧠 **Facial Recognition** — Real-time face detection and enrollment using `face-api.js` (SSD MobileNet V1 + 68-point landmark detection + 128-dim embeddings)
- 📸 **Face Enrollment Wizard** — Step-by-step guided flow with quality indicators, confidence scoring, and 5-sample capture for robust profile creation
- ✅ **Face Verification** — Live comparison using Euclidean distance (threshold: 0.6) with retry limits, failure logging, and password fallback
- 📊 **Security Dashboard** — Account overview, biometric status, activity audit logs, and session management
- 🌙 **Premium Dark UI** — Glass-morphism design, gradient accents, smooth animations, fully responsive
- 🔍 **Audit Logging** — Every authentication event (login, enrollment, verification, logout) is logged with timestamps and IP addresses

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Za-Biometrie                          │
├─────────────────────────────────────────────────────────┤
│  Frontend (Next.js 15 + TypeScript)                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Landing  │ │ Signup   │ │ Signin   │ │ Dashboard  │ │
│  │ Page     │ │ Page     │ │ Page     │ │ Page       │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │ Enroll   │ │ Verify   │ │ Settings │ │ 404/Error  │ │
│  │ Face     │ │ Face     │ │ Page     │ │ Page       │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│                                                         │
│  API Routes (Next.js Server Functions)                  │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐             │
│  │ /api/     │ │ /api/     │ │ /api/     │             │
│  │ signup    │ │ signin    │ │ enroll-   │             │
│  │           │ │           │ │ face      │             │
│  └───────────┘ └───────────┘ └───────────┘             │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐             │
│  │ /api/     │ │ /api/     │ │ /api/     │             │
│  │ verify-   │ │ user      │ │ audit     │             │
│  │ face      │ │           │ │           │             │
│  └───────────┘ └───────────┘ └───────────┘             │
│                                                         │
│  Biometric Engine (face-api.js)                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │ SSD MobileNet V1 → Face Landmark 68 → Face Recognition│
│  │ Euclidean Distance + Cosine Similarity               │
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Backend Service (Python FastAPI) - Optional            │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────┐  │
│  │ /api/enroll │ │ /api/verify │ │ /api/profile/:id  │  │
│  └─────────────┘ └─────────────┘ └───────────────────┘  │
│                                                         │
│  DeepFace / face-recognition for server-side processing │
└─────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────┐
│  Appwrite Cloud                                         │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐ │
│  │ users        │ │ biometric_   │ │ audit_logs       │ │
│  │ collection   │ │ profiles     │ │ collection       │ │
│  │              │ │ collection   │ │                  │ │
│  └──────────────┘ └──────────────┘ └──────────────────┘ │
│  ┌──────────────┐ ┌──────────────┐                      │
│  │ face_images  │ │ sessions     │                      │
│  │ storage      │ │ collection   │                      │
│  └──────────────┘ └──────────────┘                      │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15, React 19, TypeScript, Tailwind CSS, Lucide Icons |
| **Biometric Engine** | face-api.js (SSD MobileNet V1, 68-point landmarks, 128-dim embeddings) |
| **Backend API** | Python 3.11, FastAPI, Uvicorn |
| **Database** | Appwrite Cloud (Database + Storage) |
| **Authentication** | Custom SHA-256 + salt hashing (preserved from original PHP logic) |
| **Deployment** | Vercel (frontend), Render (backend), Docker Compose (local) |

---

## 📁 Repository Structure

```
za-biometrie/
├── README.md                           # This file
├── .env.example                        # Environment variable template
├── docker-compose.yml                  # Local Docker orchestration
├── Dockerfile.frontend                 # Frontend container config
├── Dockerfile.backend                  # Backend container config
├── download_models.sh                  # Model download helper script
│
├── frontend/                           # Next.js 15 Application
│   ├── app/
│   │   ├── layout.tsx                  # Root layout with metadata
│   │   ├── page.tsx                    # Landing page (hero, features, CTA)
│   │   ├── globals.css                 # Tailwind + custom styles
│   │   ├── not-found.tsx               # 404 error page
│   │   ├── signup/page.tsx             # Signup with validation
│   │   ├── signin/page.tsx             # Signin with rate limiting
│   │   ├── enroll/page.tsx             # Face enrollment wizard (5 steps)
│   │   ├── verify/page.tsx             # Face verification with fallback
│   │   ├── dashboard/page.tsx          # Profile dashboard
│   │   ├── settings/page.tsx           # Security settings
│   │   └── api/                        # Server-side API routes
│   │       ├── signup/route.ts         # User registration
│   │       ├── signin/route.ts         # User authentication
│   │       ├── enroll-face/route.ts    # Biometric enrollment
│   │       ├── verify-face/route.ts    # Biometric verification
│   │       ├── user/route.ts           # User data retrieval
│   │       ├── logout/route.ts         # Session termination
│   │       └── audit/route.ts          # Audit event logging
│   ├── components/
│   │   ├── ui/index.tsx                # Reusable UI components
│   │   └── biometric/                  # Face capture/verification hooks
│   ├── lib/appwrite.ts                 # Appwrite SDK configuration
│   ├── public/models/                  # face-api.js model weights
│   ├── package.json
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── next.config.js
│   └── postcss.config.js
│
└── backend/                            # Python FastAPI Service
    ├── main.py                         # API endpoints (enroll, verify, profile)
    └── requirements.txt                # Python dependencies
```

---

## 🔐 Biometric Flow Explanation

### Signup + Enrollment Flow
1. **User Registration** → User enters username (exactly 5 letters, 1 uppercase + 1 lowercase) and password (exactly 8 characters, 1 uppercase + 1 lowercase + 1 number)
2. **Validation** → Input validated server-side with the same regex patterns as the original PHP implementation
3. **Hashing** → Password hashed using SHA-256 with a unique 4-digit random salt
4. **Storage** → User record created in Appwrite `users` collection
5. **Redirect** → User automatically redirected to face enrollment wizard
6. **Enrollment** → User completes 5-step wizard: intro → camera permission → face positioning → 5-sample capture → profile creation
7. **Embedding Generation** → `face-api.js` extracts 128-dimensional face descriptor from captured samples
8. **Profile Storage** → Biometric profile (embedding + metadata) saved to Appwrite `biometric_profiles` collection

### Signin + Verification Flow
1. **Authentication** → User enters username and password (same validation as original)
2. **Rate Limiting** → Progressive cooldown: 5s after 1st fail, 10s after 2nd, 15s after 3rd
3. **Verification** → If user has biometric profile, redirect to face verification page
4. **Face Capture** → Real-time face detection with confidence scoring
5. **Comparison** → Euclidean distance computed between live and stored embeddings (threshold: 0.6)
6. **Access Grant** → If match, user redirected to dashboard
7. **Fallback** → After 3 failed verification attempts, password fallback is offered
8. **Audit Logging** → All events (success/failure) logged with timestamps and IP addresses

---

## ⚙️ Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```bash
# Appwrite Configuration
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=your_api_key
APPWRITE_DATABASE_ID=your_database_id
APPWRITE_USERS_COLLECTION_ID=users
APPWRITE_BIOMETRICS_COLLECTION_ID=biometric_profiles
APPWRITE_AUDIT_COLLECTION_ID=audit_logs
APPWRITE_STORAGE_BUCKET_ID=face_images

# Frontend (public - safe for browser)
NEXT_PUBLIC_APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
NEXT_PUBLIC_APPWRITE_PROJECT_ID=your_project_id
```

Create a `.env` file in the `backend/` directory:

```bash
APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=your_api_key
APPWRITE_DATABASE_ID=your_database_id
APPWRITE_USERS_COLLECTION_ID=users
APPWRITE_BIOMETRICS_COLLECTION_ID=biometric_profiles
APPWRITE_AUDIT_COLLECTION_ID=audit_logs
APPWRITE_STORAGE_BUCKET_ID=face_images
VERIFICATION_THRESHOLD=0.6
```

---

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker (optional, for containerized local dev)
- Webcam (for face enrollment/verification)

### Frontend (Next.js)
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### Backend (FastAPI)
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
# → http://localhost:8000
# → API docs: http://localhost:8000/docs
```

### Docker Compose (All Services)
```bash
# Copy environment variables
cp .env.example .env

# Build and start all services
docker compose up -d --build

# Access services:
# Frontend:  http://localhost:3000
# Backend:   http://localhost:8000
# API Docs:  http://localhost:8000/docs
```

---

## ☁️ Deployment

### Vercel (Frontend)
1. Connect your GitHub repository to Vercel
2. Set the build command: `cd frontend && npm run build`
3. Set the output directory: `frontend/.next`
4. Add all environment variables from `.env.example`
5. Deploy — Vercel handles HTTPS, CDN, and serverless functions automatically

### Render (Backend)
1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Set the root directory to `backend/`
4. Build command: `pip install -r requirements.txt`
5. Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables

### Appwrite Setup
1. Create a new project at [appwrite.io](https://appwrite.io)
2. Create a database named `biometrie_db`
3. Create these collections:
   - `users` (with attributes: `username`, `password`, `salt`, `created_at`, `last_login`, `status`)
   - `biometric_profiles` (with attributes: `user_id`, `username`, `face_embedding`, `enrollment_date`, `last_verification`, `status`)
   - `audit_logs` (with attributes: `user_id`, `event_type`, `details`, `timestamp`, `ip_address`, `user_agent`)
   - `sessions` (optional, for session management)
4. Create a storage bucket named `face_images`
5. Generate an API key with **database**, **storage**, and **users** read/write permissions
6. Add the API key to your environment variables

---

## 🔒 Security Notes

### What We Preserved
- **Password validation rules**: username (5 letters, 1 upper + 1 lower), password (8 chars, 1 upper + 1 lower + 1 digit)
- **Hashing algorithm**: SHA-256 with unique 4-digit salt
- **Rate limiting**: Progressive cooldown (5s → 10s → 15s) after failed attempts
- **Session management**: Original session-based auth logic

### What We Improved
- **Biometric data security**: Face embeddings stored as JSON in Appwrite, never exposed in the frontend
- **No raw image storage**: Only numerical embeddings are persisted for verification
- **Audit logging**: All authentication events logged with timestamps and IP addresses
- **Password hash/salt protection**: Sensitive auth data never rendered in the UI
- **Verification threshold**: Euclidean distance comparison with configurable threshold (default: 0.6)
- **Retry limits**: Maximum 3 verification attempts before password fallback
- **Input sanitization**: Server-side validation for all API endpoints
- **HTTPS enforced**: Production deployment requires secure connections

### Security Best Practices
- Never commit `.env.local` or API keys to version control
- Use environment-specific API keys (development vs. production)
- Regularly rotate Appwrite API keys
- Monitor audit logs for suspicious activity
- Keep face-api.js models updated for improved accuracy

---

## 🎯 Demo Flow

1. **Landing Page** → Visit `/` to see the product overview
2. **Sign Up** → Go to `/signup`, create an account (e.g., `JohnD` / `Passw0rd1`)
3. **Face Enrollment** → Automatically redirected to `/enroll`, complete the 5-step wizard
4. **Sign In** → Go to `/signin`, enter your credentials
5. **Face Verification** → Automatically redirected to `/verify`, position your face for comparison
6. **Dashboard** → Upon successful verification, access `/dashboard` to view your account
7. **Settings** → Visit `/settings` to manage biometric enrollment and view session info

---

## 📝 License

This project is built on the original `tp_Biometrie` authentication system and has been completely redesigned and rebuilt into a production-ready biometric authentication platform.

---

**Za-Biometrie** — Secure, intelligent, production-grade biometric authentication.
