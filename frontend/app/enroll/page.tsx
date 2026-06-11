'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Shield, Camera, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Fingerprint, Loader2 } from 'lucide-react'
import * as faceapi from 'face-api.js'

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
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function EnrollPage() {
  const router = useRouter()

  // Step flow
  const [currentStep, setCurrentStep] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Camera state
  const [cameraStatus, setCameraStatus] = useState<'off' | 'starting' | 'active' | 'error'>('off')
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Face detection
  const [modelsReady, setModelsReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const [captureCount, setCaptureCount] = useState(0)
  const [processing, setProcessing] = useState(false)

  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ---- Load face-api models ---- */
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        console.log('[Enroll] Loading models from', MODEL_URL)
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        if (!cancelled) {
          setModelsReady(true)
          console.log('[Enroll] Models loaded successfully')
        }
      } catch (err) {
        console.error('[Enroll] Model load failed:', err)
        if (!cancelled) setError('Failed to load face detection models. Please refresh.')
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      if (detectionRef.current) clearInterval(detectionRef.current)
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  /* ================================================================ */
  /*  CAMERA LIFECYCLE                                                */
  /*  Everything is driven by direct calls, NOT by useEffect.         */
  /*  The user clicks a button → we call startCamera().               */
  /*  This avoids ALL React StrictMode useEffect timing issues.       */
  /* ================================================================ */

  const stopCamera = useCallback(() => {
    console.log('[Enroll] stopCamera')
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraStatus('off')
    setCameraError('')
    setFaceDetected(false)
    setConfidence(0)
  }, [])

  /** Called directly from a button click – runs in USER GESTURE context */
  const startCamera = useCallback(async () => {
    if (cameraStatus === 'starting' || cameraStatus === 'active') return

    console.log('[Enroll] startCamera — requesting getUserMedia')
    setCameraStatus('starting')
    setCameraError('')
    setError('')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })

      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop())
        throw new Error('No video tracks found.')
      }

      streamRef.current = stream
      console.log('[Enroll] Stream obtained:', stream.id)

      // We are STILL in the click-handler's microtask, so the video
      // element from step 2 might not be in the DOM yet.
      // We wait a tick for React to render step 2, then attach.
      // But actually — if we're already on step 2, the element exists.
      // If we're transitioning from step 1 → 2, React needs to render first.

      // Give React a chance to render (if step was just changed)
      await new Promise(r => setTimeout(r, 50))

      const video = videoRef.current
      if (!video) {
        console.error('[Enroll] Video element not found after waiting')
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        setCameraStatus('error')
        setCameraError('Video element not found. Please refresh the page.')
        return
      }

      console.log('[Enroll] Attaching stream to video element')
      video.srcObject = stream
      video.muted = true

      // Explicitly play — this works because we're still in user-gesture
      // context (or very close to it), and the video is muted.
      try {
        await video.play()
        console.log('[Enroll] video.play() succeeded')
      } catch (playErr) {
        console.warn('[Enroll] video.play() rejected:', playErr, 'retrying...')
        await new Promise(r => setTimeout(r, 200))
        try {
          await video.play()
          console.log('[Enroll] video.play() retry succeeded')
        } catch (retryErr) {
          console.error('[Enroll] video.play() retry also failed:', retryErr)
          // Even if play failed, autoplay attribute may still kick in.
          // Don't throw — just log and continue.
        }
      }

      console.log('[Enroll] Camera active! videoWidth:', video.videoWidth, 'videoHeight:', video.videoHeight)
      setCameraStatus('active')
      startFaceDetection()
    } catch (err: unknown) {
      console.error('[Enroll] startCamera error:', err)
      const e = err as Error
      if (e.name === 'NotAllowedError') setCameraError('Camera permission denied. Please allow camera access in your browser settings.')
      else if (e.name === 'NotFoundError') setCameraError('No camera found on this device.')
      else if (e.name === 'NotReadableError') setCameraError('Camera is in use by another app.')
      else setCameraError(e.message || 'Failed to start camera.')
      setCameraStatus('error')
    }
  }, [cameraStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ---- Face detection loop ---- */
  const startFaceDetection = useCallback(() => {
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null }

    console.log('[Enroll] Starting face detection loop')
    detectionRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      try {
        const det = await faceapi.detectSingleFace(video)
        setFaceDetected(!!det)
        setConfidence(det?.score ?? 0)
      } catch {
        setFaceDetected(false)
      }
    }, 500)
  }, [])

  /* ---- "Allow Camera" button on Step 1 ---- */
  const handleAllowCamera = useCallback(() => {
    // 1. Move to step 2 (renders the video element)
    setCurrentStep(2)
    // 2. Start the camera immediately — we're in a click handler,
    //    so getUserMedia has user-gesture context.
    //    We set cameraStatus first, then startCamera picks up after render.
    // Use setTimeout(0) so React can commit step 2 render first.
    setTimeout(() => startCamera(), 0)
  }, [startCamera])

  /* ---- Capture ---- */
  const processEnrollment = useCallback(async (finalImage: string) => {
    setProcessing(true)
    setError('')
    try {
      const img = await faceapi.fetchImage(finalImage)
      const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()
      if (!det) {
        setError('Could not detect face. Try again with better lighting.')
        setProcessing(false)
        setCurrentStep(2)
        setCaptureCount(0)
        return
      }
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
      else { setError(data.message || 'Enrollment failed.'); setCurrentStep(2); setCaptureCount(0) }
    } catch {
      setError('Failed to process enrollment.'); setCurrentStep(2); setCaptureCount(0)
    } finally {
      setProcessing(false)
    }
  }, [])

  const captureSample = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < 2) { setError('Camera not ready.'); return }
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      ctx.translate(canvas.width, 0); ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0)
      const imageData = canvas.toDataURL('image/jpeg', 0.85)
      const n = captureCount + 1
      setCaptureCount(n)
      if (n >= 5) { setCurrentStep(4); await processEnrollment(imageData) }
    } catch { setError('Failed to capture.') }
  }, [captureCount, processEnrollment])

  /* Auto-capture on step 3 */
  useEffect(() => {
    if (captureTimerRef.current) { clearTimeout(captureTimerRef.current); captureTimerRef.current = null }
    if (currentStep === 3 && cameraStatus === 'active' && faceDetected && !processing) {
      captureTimerRef.current = setTimeout(() => captureSample(), 1500)
    }
    return () => { if (captureTimerRef.current) { clearTimeout(captureTimerRef.current); captureTimerRef.current = null } }
  }, [currentStep, cameraStatus, faceDetected, processing, captureSample])

  /* ================================================================ */
  /*  RENDER                                                          */
  /* ================================================================ */
  const step = STEPS[currentStep]

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

        <div className="glass rounded-2xl p-8 shadow-glow">
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

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <p className="text-sm text-emerald-400">Face enrollment complete!</p>
              </div>
            )}

            {/* ======== Step 0: Intro ======== */}
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
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Allow camera access</li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Position your face in the frame</li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />We will capture 5 face samples</li>
                    <li className="flex items-center gap-3"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Create your biometric profile</li>
                  </ul>
                </div>
                <button onClick={() => setCurrentStep(1)} className="w-full btn-primary">
                  Continue <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
            )}

            {/* ======== Step 1: Permission ======== */}
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
                    Your face data is processed locally and stored securely.
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
                  <button
                    onClick={handleAllowCamera}
                    disabled={!modelsReady}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {modelsReady ? (
                      <><Camera className="w-5 h-5 mr-2" /> Allow Camera</>
                    ) : (
                      <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading Models...</>
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* ======== Steps 2 & 3: Camera + Preview ======== */}
            {(currentStep === 2 || currentStep === 3) && (
              <div className="space-y-6">
                {/* ---- Video container ---- */}
                <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video">
                  {/* The video element */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                    style={{ transform: 'scaleX(-1)' }}
                  />

                  {/* Starting overlay */}
                  {cameraStatus === 'starting' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
                      <Loader2 className="w-10 h-10 text-primary animate-spin" />
                      <span className="text-sm text-muted-foreground">Initializing camera...</span>
                    </div>
                  )}

                  {/* Error overlay */}
                  {cameraStatus === 'error' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
                      <AlertCircle className="w-10 h-10 text-red-400" />
                      <span className="text-sm text-red-400 text-center px-6">{cameraError}</span>
                      <button onClick={startCamera} className="btn-primary text-sm px-4 py-2">
                        Retry <Camera className="w-4 h-4 ml-1" />
                      </button>
                    </div>
                  )}

                  {/* Off overlay */}
                  {cameraStatus === 'off' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
                      <Camera className="w-12 h-12 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Camera is off</span>
                      <button onClick={startCamera} disabled={!modelsReady} className="btn-primary text-sm px-4 py-2 disabled:opacity-50">
                        <Camera className="w-4 h-4 mr-1" /> Open Camera
                      </button>
                    </div>
                  )}

                  {/* Active badge */}
                  {cameraStatus === 'active' && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium z-20">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Camera active
                    </div>
                  )}

                  {/* Face overlay (active only) */}
                  {cameraStatus === 'active' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <div className={`w-48 h-60 border-2 rounded-full transition-all mb-16 ${
                        faceDetected ? 'border-emerald-500/70' : 'border-white/30 animate-pulse'
                      }`} />
                      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
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
                    </div>
                  )}
                </div>

                {/* ---- Action buttons ---- */}
                <div className="flex gap-3">
                  {currentStep === 2 && cameraStatus === 'active' && (
                    <>
                      <button
                        onClick={() => {
                          if (faceDetected) {
                            setCaptureCount(0)
                            setFaceDetected(false)
                            setConfidence(0)
                            setCurrentStep(3)
                          } else {
                            setError('Please position your face in the frame first.')
                          }
                        }}
                        disabled={!faceDetected}
                        className="w-full btn-primary disabled:opacity-50"
                      >
                        Continue to Capture
                      </button>
                      <button onClick={() => { stopCamera(); setCurrentStep(1) }} className="w-full btn-secondary">
                        Close Camera
                      </button>
                    </>
                  )}
                </div>

                {/* Step 2 instructions */}
                {currentStep === 2 && cameraStatus === 'active' && (
                  <div className="glass rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-foreground mb-3">Position your face</h3>
                    <ul className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Ensure good lighting</li>
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Look directly at the camera</li>
                      <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />Keep still while detecting</li>
                    </ul>
                  </div>
                )}

                {/* Step 3 progress */}
                {currentStep === 3 && cameraStatus === 'active' && (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-foreground">Capturing samples</span>
                        <span className="text-sm text-muted-foreground">{captureCount}/5</span>
                      </div>
                      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all duration-500 ease-out" style={{ width: `${(captureCount / 5) * 100}%` }} />
                      </div>
                    </div>
                    <div className="glass rounded-xl p-4">
                      <p className="text-sm text-muted-foreground text-center">
                        {faceDetected ? '✓ Capturing...' : 'Position your face in the frame'}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ======== Step 4: Processing ======== */}
            {currentStep === 4 && (
              <div className="space-y-8 flex flex-col items-center justify-center py-12">
                <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center">
                  {processing ? <Loader2 className="w-12 h-12 text-primary animate-spin" /> : <Fingerprint className="w-12 h-12 text-primary" />}
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Processing...</h3>
                  <p className="text-sm text-muted-foreground">Creating your biometric profile.</p>
                </div>
              </div>
            )}

            {/* ======== Step 5: Complete ======== */}
            {currentStep === 5 && (
              <div className="space-y-8 flex flex-col items-center justify-center py-12">
                <div className="w-24 h-24 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="w-12 h-12 text-emerald-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-foreground mb-2">Enrollment Complete!</h3>
                  <p className="text-sm text-muted-foreground mb-6">Your face has been enrolled successfully.</p>
                </div>
                <button onClick={() => router.push('/dashboard')} className="btn-primary">
                  Go to Dashboard <ArrowRight className="w-5 h-5 ml-2" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
