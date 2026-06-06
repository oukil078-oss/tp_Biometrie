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
/*  Camera Preview Component                                           */
/* ------------------------------------------------------------------ */

interface CameraPreviewProps {
  isActive: boolean
  modelsReady: boolean
  onCameraReady: (videoEl: HTMLVideoElement | null, stream: MediaStream | null) => void
  onFaceDetected: (detected: boolean, score: number) => void
  overlay?: React.ReactNode
  primaryButton?: { label: string; onClick: () => void; disabled?: boolean }
  secondaryButton?: { label: string; onClick: () => void }
}

function CameraPreview({
  isActive,
  modelsReady,
  onCameraReady,
  onFaceDetected,
  overlay,
  primaryButton,
  secondaryButton,
}: CameraPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const startingRef = useRef(false)
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const onFaceDetectedRef = useRef(onFaceDetected)
  const onCameraReadyRef = useRef(onCameraReady)

  // Keep refs updated without causing re-renders of effects
  useEffect(() => { onFaceDetectedRef.current = onFaceDetected }, [onFaceDetected])
  useEffect(() => { onCameraReadyRef.current = onCameraReady }, [onCameraReady])

  // Mounted tracking – guards async callbacks against post-unmount state writes
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  stopStream – safely tear down the current MediaStream            */
  /* ---------------------------------------------------------------- */
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) {
      video.srcObject = null
      video.load() // release any pending decode
    }
  }, [])

  /* ---------------------------------------------------------------- */
  /*  startFaceDetection – periodic single-face detection loop         */
  /* ---------------------------------------------------------------- */
  const startFaceDetection = useCallback(() => {
    if (detectionRef.current) {
      clearInterval(detectionRef.current)
      detectionRef.current = null
    }

    console.log('[CameraPreview] Starting face detection loop')
    detectionRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return
      try {
        const det = await faceapi.detectSingleFace(video)
        onFaceDetectedRef.current(!!det, det?.score ?? 0)
      } catch {
        onFaceDetectedRef.current(false, 0)
      }
    }, 500)
  }, [])

  /* ---------------------------------------------------------------- */
  /*  startCamera – obtain MediaStream & bind it to <video>            */
  /* ---------------------------------------------------------------- */
  const startCamera = useCallback(async () => {
    /* ---- guards ---- */
    if (startingRef.current) return
    if (!modelsReady) {
      console.log('[CameraPreview] Models not ready yet, skipping start')
      return
    }

    startingRef.current = true
    console.log('[CameraPreview] Starting camera...')
    setErrorMsg('')

    /* ---- stop any previous stream ---- */
    stopStream()

    /* ---- set state to "starting" (shows loading overlay) ---- */
    if (mountedRef.current) setCameraState('starting')

    try {
      /* 1. Request camera */
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })

      /* Bail out if component unmounted while waiting for permission */
      if (!mountedRef.current) {
        stream.getTracks().forEach(t => t.stop())
        return
      }

      /* Validate stream has video tracks */
      if (stream.getVideoTracks().length === 0) {
        stream.getTracks().forEach(t => t.stop())
        throw new Error('No video tracks found in camera stream.')
      }

      streamRef.current = stream
      console.log('[CameraPreview] Stream obtained:', stream.id, 'tracks:', stream.getTracks().length)

      /* 2. Grab video element */
      const video = videoRef.current
      if (!video) {
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        throw new Error('Video element not found in DOM.')
      }

      /* 3. Set playback attributes BEFORE assigning srcObject */
      video.muted = true
      video.autoplay = true
      video.playsInline = true

      /* 4. Assign stream */
      video.srcObject = stream
      console.log('[CameraPreview] srcObject assigned')

      /* 5. Wait for actual video data (loadeddata ≥ HAVE_CURRENT_DATA) */
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Camera initialization timed out. Please try again.')), 15_000)

        if (video.readyState >= 2) {
          clearTimeout(timeout)
          resolve()
          return
        }

        const done = () => { clearTimeout(timeout); resolve() }
        const fail = () => { clearTimeout(timeout); reject(new Error('Video element encountered an error.')) }

        video.addEventListener('loadeddata', done, { once: true })
        video.addEventListener('error', fail, { once: true })
      })

      if (!mountedRef.current) return

      /* 6. Explicitly play (with retry) */
      try {
        await video.play()
        console.log('[CameraPreview] play() succeeded')
      } catch (playErr) {
        console.warn('[CameraPreview] play() rejected on first attempt:', playErr)
        // Retry once – sometimes the browser needs a second attempt after loadeddata
        await new Promise(r => setTimeout(r, 100))
        try {
          await video.play()
          console.log('[CameraPreview] play() succeeded on retry')
        } catch {
          // If still failing but video has data, continue – the stream may still render
          if (video.readyState < 2) throw new Error('Video playback failed – no data available.')
          console.log('[CameraPreview] Continuing despite play() rejection (readyState OK)')
        }
      }

      /* 7. Wait for real video dimensions (non-zero) */
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Camera produced no video frames.')), 5_000)
          const check = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              clearTimeout(timeout)
              resolve()
            }
          }
          video.addEventListener('resize', () => check(), { once: true })
          check()
        })
      }

      if (!mountedRef.current) return

      console.log('[CameraPreview] Camera ready!', video.videoWidth, 'x', video.videoHeight)
      setCameraState('ready')
      onCameraReadyRef.current(video, streamRef.current)
      startingRef.current = false
      startFaceDetection()
    } catch (err: unknown) {
      if (!mountedRef.current) { startingRef.current = false; return }

      console.error('[CameraPreview] Camera error:', err)
      startingRef.current = false
      stopStream()

      const e = err as Error
      if (e.name === 'NotAllowedError') setErrorMsg('Camera permission denied. Please allow camera access in your browser settings and try again.')
      else if (e.name === 'NotFoundError') setErrorMsg('No camera found on this device.')
      else if (e.name === 'NotReadableError') setErrorMsg('Camera is in use by another application. Close other apps using the camera.')
      else setErrorMsg(e.message || 'Failed to start camera.')

      setCameraState('error')
      onCameraReadyRef.current(null, null)
    }
  }, [modelsReady, stopStream, startFaceDetection])

  /* ---------------------------------------------------------------- */
  /*  stopCamera – full teardown                                       */
  /* ---------------------------------------------------------------- */
  const stopCamera = useCallback(() => {
    console.log('[CameraPreview] Stopping camera')
    startingRef.current = false

    if (detectionRef.current) {
      clearInterval(detectionRef.current)
      detectionRef.current = null
    }

    stopStream()

    setCameraState('idle')
    setErrorMsg('')
    onCameraReadyRef.current(null, null)
    onFaceDetectedRef.current(false, 0)
  }, [stopStream])

  /* ---------------------------------------------------------------- */
  /*  Auto-start / auto-stop effect                                    */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    if (isActive && cameraState === 'idle' && modelsReady && !startingRef.current) {
      console.log('[CameraPreview] Auto-starting camera')
      startCamera()
    }

    if (!isActive && (cameraState === 'ready' || cameraState === 'starting')) {
      console.log('[CameraPreview] Deactivating – stopping camera')
      stopCamera()
    }
  }, [isActive, cameraState, modelsReady, startCamera, stopCamera])

  /* ---------------------------------------------------------------- */
  /*  Cleanup on unmount – stop stream & reset guards                  */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    return () => {
      console.log('[CameraPreview] Unmounting – full cleanup')
      startingRef.current = false
      mountedRef.current = false
      if (detectionRef.current) clearInterval(detectionRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
    }
  }, [])

  /* ---- Manual retry handler ---- */
  const handleRetry = useCallback(() => {
    setErrorMsg('')
    setCameraState('idle')
    startingRef.current = false
    // Defer startCamera to next tick so state settles
    setTimeout(() => startCamera(), 50)
  }, [startCamera])

  return (
    <div className="space-y-4">
      {/* Camera preview container */}
      <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video">
        {/* Video element – ALWAYS in DOM, ALWAYS rendered */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Loading overlay */}
        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Initializing camera...</span>
          </div>
        )}

        {/* Error overlay */}
        {cameraState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <span className="text-sm text-red-400 text-center px-6">{errorMsg}</span>
            <button onClick={handleRetry} className="btn-primary text-sm px-4 py-2">
              Retry <Camera className="w-4 h-4 ml-1" />
            </button>
          </div>
        )}

        {/* Idle overlay */}
        {cameraState === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-secondary/90 backdrop-blur-sm z-10">
            <Camera className="w-12 h-12 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Camera is off</span>
          </div>
        )}

        {/* Active indicator */}
        {cameraState === 'ready' && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-medium z-20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Camera active
          </div>
        )}

        {/* Detection overlay */}
        {cameraState === 'ready' && overlay}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {/* Manual start button – shown when auto-start didn't fire */}
        {cameraState === 'idle' && isActive && (
          <button
            onClick={startCamera}
            disabled={!modelsReady}
            className="w-full btn-primary disabled:opacity-50"
          >
            <Camera className="w-5 h-5 mr-2" /> Open Camera
          </button>
        )}

        {/* Primary action button – only when camera is live */}
        {cameraState === 'ready' && primaryButton && (
          <button
            onClick={primaryButton.onClick}
            disabled={primaryButton.disabled}
            className="w-full btn-primary disabled:opacity-50"
          >
            {primaryButton.label}
          </button>
        )}

        {/* Secondary action button */}
        {cameraState === 'ready' && secondaryButton && (
          <button onClick={secondaryButton.onClick} className="w-full btn-secondary">
            {secondaryButton.label}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function EnrollPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [faceDetected, setFaceDetected] = useState(false)
  const [captureCount, setCaptureCount] = useState(0)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [confidence, setConfidence] = useState(0)
  const [modelsReady, setModelsReady] = useState(false)

  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Load face-api models on mount */
  useEffect(() => {
    const loadModels = async () => {
      try {
        console.log('[Enroll] Loading models from', MODEL_URL)
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
        ])
        setModelsReady(true)
        console.log('[Enroll] Models loaded successfully')
      } catch (err) {
        console.error('[Enroll] Model load failed:', err)
        setError('Failed to load face detection models. Please refresh the page.')
      }
    }
    loadModels()

    return () => {
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop())
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* Handle camera ready state from CameraPreview */
  const handleCameraReady = useCallback((video: HTMLVideoElement | null, stream: MediaStream | null) => {
    console.log('[Enroll] Camera ready:', !!video, !!stream)
    setVideoEl(video)
    setCameraStream(stream)
    setCameraReady(!!video && !!stream)
  }, [])

  /* Handle face detection updates from CameraPreview */
  const handleFaceDetected = useCallback((detected: boolean, score: number) => {
    setFaceDetected(detected)
    setConfidence(score)
  }, [])

  /* Capture a single face sample */
  const captureSample = useCallback(async () => {
    if (!videoEl || videoEl.readyState < 2) {
      setError('Camera preview not ready.')
      return
    }

    console.log('[Enroll] Capturing sample', captureCount + 1)
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoEl.videoWidth
      canvas.height = videoEl.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Mirror the capture to match the displayed preview
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(videoEl, 0, 0)

      const imageData = canvas.toDataURL('image/jpeg', 0.85)
      const newCount = captureCount + 1
      setCaptureCount(newCount)
      console.log('[Enroll] Sample', newCount, '/ 5 captured')

      if (newCount >= 5) {
        console.log('[Enroll] All 5 samples done, processing enrollment')
        setCurrentStep(4)
        await processEnrollment(imageData)
      }
    } catch (err) {
      console.error('[Enroll] Capture error:', err)
      setError('Failed to capture face sample.')
    }
  }, [videoEl, captureCount]) // eslint-disable-line react-hooks/exhaustive-deps

  /* Process enrollment with the final captured image */
  const processEnrollment = useCallback(async (finalImage: string) => {
    setProcessing(true)
    setError('')
    try {
      console.log('[Enroll] Processing enrollment...')
      const img = await faceapi.fetchImage(finalImage)
      const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()

      if (!det) {
        setError('Could not detect face. Try again with better lighting.')
        setProcessing(false)
        setCurrentStep(2)
        setCaptureCount(0)
        return
      }

      console.log('[Enroll] Face detected, score:', det.detection.score)
      const embedding = Array.from(det.descriptor)
      const userId = sessionStorage.getItem('signupUserId') || sessionStorage.getItem('userId') || ''
      const username = sessionStorage.getItem('signupUsername') || sessionStorage.getItem('user') || ''

      const res = await fetch('/api/enroll-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username, embedding, imageData: finalImage }),
      })
      const data = await res.json()

      if (data.success) {
        setSuccess(true)
        setCurrentStep(5)
      } else {
        setError(data.message || 'Enrollment failed.')
        setCurrentStep(2)
        setCaptureCount(0)
      }
    } catch (err) {
      console.error('[Enroll] Enrollment error:', err)
      setError('Failed to process enrollment.')
      setCurrentStep(2)
      setCaptureCount(0)
    } finally {
      setProcessing(false)
    }
  }, [])

  /* Auto-capture on step 3 */
  useEffect(() => {
    if (captureTimerRef.current) {
      clearTimeout(captureTimerRef.current)
      captureTimerRef.current = null
    }

    if (currentStep === 3 && cameraReady && faceDetected && !processing) {
      console.log('[Enroll] Auto-capturing in 1.5s...')
      captureTimerRef.current = setTimeout(() => {
        captureSample()
      }, 1500)
    }

    return () => {
      if (captureTimerRef.current) {
        clearTimeout(captureTimerRef.current)
        captureTimerRef.current = null
      }
    }
  }, [currentStep, cameraReady, faceDetected, processing, captureSample])

  /* ---- Step renderer ---- */
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

        {/* Step 0: Intro */}
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

        {/* Step 1: Permission */}
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
                onClick={() => setCurrentStep(2)}
                disabled={!modelsReady}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {modelsReady ? 'Allow Camera' : 'Loading Models...'} <ArrowRight className="w-5 h-5 ml-2" />
              </button>
            </div>
          </div>
        )}

        {/* Steps 2 & 3: Camera */}
        {(currentStep === 2 || currentStep === 3) && (
          <div className="space-y-6">
            <CameraPreview
              isActive={true}
              modelsReady={modelsReady}
              onCameraReady={handleCameraReady}
              onFaceDetected={handleFaceDetected}
              overlay={
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  {/* Face detection oval */}
                  <div className={`w-48 h-60 border-2 rounded-full transition-all mb-16 ${
                    faceDetected ? 'border-emerald-500/70' : 'border-white/30 animate-pulse'
                  }`} />
                  {/* Status badges */}
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
              }
              primaryButton={currentStep === 2 ? {
                label: 'Continue to Capture',
                onClick: () => {
                  if (faceDetected) {
                    setCurrentStep(3)
                    setCaptureCount(0)
                    setFaceDetected(false)
                    setConfidence(0)
                  } else {
                    setError('Please position your face in the frame first.')
                  }
                },
                disabled: !faceDetected,
              } : undefined}
              secondaryButton={currentStep === 2 ? {
                label: 'Close Camera',
                onClick: () => setCurrentStep(1),
              } : undefined}
            />

            {/* Step 2 instructions */}
            {currentStep === 2 && cameraReady && (
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
            {currentStep === 3 && cameraReady && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-foreground">Capturing samples</span>
                    <span className="text-sm text-muted-foreground">{captureCount}/5</span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${(captureCount / 5) * 100}%` }}
                    />
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

        {/* Step 4: Processing */}
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

        {/* Step 5: Complete */}
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
