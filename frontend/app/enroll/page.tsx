'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, Camera, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Fingerprint, Loader2 } from 'lucide-react'
import * as faceapi from 'face-api.js'

/* ------------------------------------------------------------------ */
/*  Reusable CameraPreview component                                   */
/* ------------------------------------------------------------------ */

interface CameraPreviewProps {
  streamRef: React.MutableRefObject<MediaStream | null>
  onCameraReady: (ready: boolean) => void
  onFaceDetected: (detected: boolean, score: number) => void
  modelsReady: boolean
  overlay?: React.ReactNode
  isActive: boolean
}

function CameraPreview({ streamRef, onCameraReady, onFaceDetected, modelsReady, overlay, isActive }: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  /* ---- start camera ---- */
  const startCamera = useCallback(async () => {
    if (!modelsReady) { setError('Models not loaded yet.') ; return }
    setError('')
    setLoading(true)

    // stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream

      const video = videoRef.current
      if (!video) { setError('Video element not available.') ; setLoading(false); return }

      video.srcObject = stream
      video.autoplay = true
      video.playsInline = true
      video.muted = true

      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => { video.removeEventListener('loadedmetadata', onLoaded); resolve() }
        video.addEventListener('loadedmetadata', onLoaded)
        setTimeout(() => reject(new Error('loadedmetadata timeout')), 5000)
      })

      await video.play()
      setLoading(false)
      onCameraReady(true)
    } catch (err: unknown) {
      setLoading(false)
      const e = err as Error
      if (e.name === 'NotAllowedError') setError('Camera permission denied. Please allow camera access in your browser settings.')
      else if (e.name === 'NotFoundError') setError('No camera found on this device.')
      else if (e.name === 'NotReadableError') setError('Camera is in use by another application.')
      else setError(`Failed to open camera: ${e.message || 'Unknown error'}`)
      onCameraReady(false)
    }
  }, [modelsReady, onCameraReady, streamRef])

  /* ---- stop camera ---- */
  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    const video = videoRef.current
    if (video) { video.srcObject = null }
    onCameraReady(false)
    onFaceDetected(false, 0)
  }, [onCameraReady, onFaceDetected, streamRef])

  /* ---- face detection loop ---- */
  useEffect(() => {
    if (!isActive) return
    const video = videoRef.current
    if (!video || video.readyState < 4) return

    detectionRef.current = setInterval(async () => {
      if (!video || video.readyState !== 4) return
      try {
        const det = await faceapi.detectSingleFace(video)
        if (det) onFaceDetected(true, det.score)
        else onFaceDetected(false, 0)
      } catch { /* ignore individual detection errors */ }
    }, 300)
    return () => { if (detectionRef.current) clearInterval(detectionRef.current) }
  }, [isActive, onFaceDetected])

  /* cleanup on unmount */
  useEffect(() => { return stopCamera }, [stopCamera])

  return (
    <>
      {/* Main video area */}
      <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ display: isActive && !loading ? 'block' : 'none' }}
        />

        {/* Loading skeleton */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Initializing camera...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <span className="text-sm text-red-400 text-center px-6">{error}</span>
            <button onClick={startCamera} className="btn-primary text-sm px-4 py-2">
              Retry <Camera className="w-4 h-4 ml-1" />
            </button>
          </div>
        )}

        {/* Idle state */}
        {!isActive && !loading && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary">
            <Camera className="w-12 h-12 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Camera is off</span>
          </div>
        )}

        {/* Active badge */}
        {isActive && !loading && !error && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Camera active
          </div>
        )}

        {/* Overlay (face-detection frame etc.) */}
        {isActive && !loading && !error && overlay}
      </div>

      {/* Action button */}
      <div className="flex gap-3">
        {!isActive && !error && (
          <button onClick={startCamera} disabled={!modelsReady || loading} className="w-full btn-primary disabled:opacity-50">
            <Camera className="w-5 h-5 mr-2" />
            {loading ? 'Starting...' : 'Open Camera'}
          </button>
        )}
        {error && (
          <button onClick={startCamera} className="w-full btn-primary">
            Retry <Camera className="w-4 h-4 ml-1" />
          </button>
        )}
        {isActive && (
          <button onClick={stopCamera} className="w-full btn-secondary">
            <ArrowLeft className="w-4 h-4 mr-2" /> Close Camera
          </button>
        )}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { id: 'intro', title: 'Welcome', desc: 'Enroll your face for secure biometric authentication' },
  { id: 'permission', title: 'Camera Permission', desc: 'Allow camera access to capture your face' },
  { id: 'position', title: 'Position', desc: 'Position your face in the frame' },
  { id: 'capture', title: 'Capture', desc: 'We will capture multiple face samples' },
  { id: 'processing', title: 'Processing', desc: 'Creating your biometric profile' },
  { id: 'complete', title: 'Complete', desc: 'Face enrollment successful' },
]

const MODEL_URL = typeof window !== 'undefined' ? `${window.location.origin}/models` : '/models'

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function EnrollPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [captureCount, setCaptureCount] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const [modelsReady, setModelsReady] = useState(false)

  const streamRef = useRef<MediaStream | null>(null)

  /* Load face-api models on mount */
  useEffect(() => {
    const loadModels = async () => {
      try {
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        setModelsReady(true)
      } catch (err) {
        console.error('Failed to load models:', err)
        setError('Failed to load face detection models. Please refresh.')
      }
    }
    loadModels()
  }, [])

  /* ---- enrollment processing ---- */
  const captureSample = async () => {
    if (!streamRef.current) return
    try {
      const video = document.querySelector('video') as HTMLVideoElement | null
      if (!video || video.readyState < 2) return

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0)
      const imageData = canvas.toDataURL('image/jpeg', 0.8)
      const newCount = captureCount + 1
      setCaptureCount(newCount)
      if (newCount >= 5) {
        setCurrentStep(4)
        await processEnrollment(imageData)
      }
    } catch { setError('Failed to capture. Try again.') }
  }

  const processEnrollment = async (finalImage: string) => {
    setProcessing(true)
    setError('')
    try {
      const img = await faceapi.fetchImage(finalImage)
      const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
      if (!det) { setError('Failed to extract face features. Try with better lighting.'); setProcessing(false); setCurrentStep(2); return }
      const embedding = Array.from(det.descriptor)
      const userId = sessionStorage.getItem('signupUserId') || sessionStorage.getItem('userId') || ''
      const username = sessionStorage.getItem('signupUsername') || sessionStorage.getItem('user') || ''
      const res = await fetch('/api/enroll-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username, embedding, imageData: finalImage }),
      })
      const data = await res.json()
      if (data.success) { setSuccess(true); setCurrentStep(5) }
      else { setError(data.message || 'Enrollment failed.'); setCurrentStep(2) }
    } catch { setError('Failed to process enrollment.'); setCurrentStep(2) }
    finally { setProcessing(false) }
  }

  /* Auto-capture on step 3 (capture step) */
  useEffect(() => {
    if (currentStep !== 3 || !faceDetected || processing) return
    const timer = setTimeout(() => captureSample(), 1500)
    return () => clearTimeout(timer)
  }, [currentStep, faceDetected, processing, captureCount])

  /* ---- step renderer ---- */
  const renderStep = () => {
    const step = STEPS[currentStep]

    return (
      <div className="space-y-8">
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                i < currentStep ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                i === currentStep ? 'bg-primary/20 text-primary border border-primary/30' :
                'bg-secondary text-muted-foreground border border-border'
              }`}>
                {i < currentStep ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-8 h-0.5 transition-all ${i < currentStep ? 'bg-emerald-500/30' : 'bg-border'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Title */}
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">{step.title}</h2>
          <p className="text-muted-foreground">{step.desc}</p>
        </div>

        {/* Messages */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            <p className="text-sm text-emerald-400">Face enrollment complete!</p>
          </div>
        )}

        {/* ---- Step 0: Intro ---- */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Fingerprint className="w-12 h-12 text-primary" />
              </div>
            </div>
            <div className="glass rounded-xl p-6 space-y-4">
              <h3 className="text-lg font-semibold text-foreground">What to expect</h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />We will ask for camera access</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Position your face in the frame</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Capture 5 face samples</li>
                <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Create your biometric profile</li>
              </ul>
            </div>
            <button onClick={() => setCurrentStep(1)} className="w-full btn-primary">
              Continue <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        )}

        {/* ---- Step 1: Permission ---- */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="flex justify-center">
              <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Camera className="w-12 h-12 text-primary" />
              </div>
            </div>
            <div className="glass rounded-xl p-6">
              <h3 className="text-lg font-semibold text-foreground mb-2">Camera Permission Required</h3>
              <p className="text-sm text-muted-foreground mb-4">
                We need access to your camera to capture your face for biometric enrollment.
                Your face data is processed locally and stored securely as encrypted embeddings.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <p className="text-xs text-amber-400">Your biometric data is never shared or sold.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCurrentStep(0)} className="btn-ghost flex-1">
                <ArrowLeft className="w-4 h-4 mr-2" /> Back
              </button>
              <button onClick={() => setCurrentStep(2)} disabled={!modelsReady} className="btn-primary flex-1 disabled:opacity-50">
                {modelsReady ? 'Allow Camera' : 'Loading Models...'} <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* ---- Steps 2 & 3: Camera (position + capture) ---- */}
        {(currentStep === 2 || currentStep === 3) && (
          <div className="space-y-6">
            <CameraPreview
              streamRef={streamRef}
              onCameraReady={setCameraReady}
              onFaceDetected={(detected, score) => { setFaceDetected(detected); setConfidence(score) }}
              modelsReady={modelsReady}
              isActive={currentStep === 2 || currentStep === 3}
              overlay={
                <>
                  {/* face-detection oval */}
                  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-60 border-2 rounded-full transition-all ${
                    faceDetected ? 'border-emerald-500/70' : 'border-primary/30 animate-pulse'
                  }`} />
                  {/* badges */}
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between">
                    <div className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                      faceDetected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}>
                      {faceDetected ? 'Face Detected' : 'No Face Detected'}
                    </div>
                    {faceDetected && (
                      <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                        {Math.round(confidence * 100)}%
                      </div>
                    )}
                    {currentStep === 3 && (
                      <div className="px-3 py-1.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30">
                        {captureCount}/5
                      </div>
                    )}
                  </div>
                </>
              }
            />

            {currentStep === 2 && (
              <>
                <div className="glass rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-foreground mb-3">Position your face</h3>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Ensure good lighting</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Look directly at the camera</li>
                    <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Remove glasses if possible</li>
                  </ul>
                </div>
                <button
                  onClick={() => { if (faceDetected) { setCurrentStep(3); setCaptureCount(0) } else setError('Please position your face in the frame first.') }}
                  disabled={!faceDetected}
                  className="w-full btn-primary disabled:opacity-50"
                >
                  Continue to Capture <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </>
            )}

            {currentStep === 3 && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Progress</span>
                    <span className="text-sm text-muted-foreground">{Math.round((captureCount / 5) * 100)}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${(captureCount / 5) * 100}%` }} />
                  </div>
                </div>
                <div className="glass rounded-xl p-4">
                  <p className="text-sm text-muted-foreground text-center">
                    {faceDetected ? 'Capturing face sample...' : 'Position your face in the frame'}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ---- Step 4: Processing ---- */}
        {currentStep === 4 && (
          <div className="space-y-8 flex flex-col items-center justify-center py-12">
            <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
              {processing ? <Loader2 className="w-12 h-12 text-primary animate-spin" /> : <Fingerprint className="w-12 h-12 text-primary" />}
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-2">Processing your face data...</h3>
              <p className="text-sm text-muted-foreground">Creating your biometric profile. This may take a moment.</p>
            </div>
          </div>
        )}

        {/* ---- Step 5: Complete ---- */}
        {currentStep === 5 && (
          <div className="space-y-8 flex flex-col items-center justify-center py-12">
            <div className="w-24 h-24 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-emerald-400" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-foreground mb-2">Enrollment Complete!</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Your face has been successfully enrolled. You can now use facial recognition to sign in.
              </p>
            </div>
            <button onClick={() => router.push('/dashboard')} className="btn-primary">
              Go to Dashboard <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 bg-grid pointer-events-none" />
      <div className="fixed inset-0 bg-radial pointer-events-none" />
      <div className="relative z-10 w-full max-w-lg">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center shadow-glow-sm">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-gradient">Za-Biometrie</span>
          </Link>
        </div>
        <div className="glass rounded-2xl p-8 shadow-glow">{renderStep()}</div>
      </div>
    </div>
  )
}
