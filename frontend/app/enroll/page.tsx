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
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [cameraState, setCameraState] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const startedRef = useRef(false)
  const onFaceDetectedRef = useRef(onFaceDetected)
  const onCameraReadyRef = useRef(onCameraReady)

  // Keep refs updated without causing re-renders of effects
  useEffect(() => {
    onFaceDetectedRef.current = onFaceDetected
  }, [onFaceDetected])

  useEffect(() => {
    onCameraReadyRef.current = onCameraReady
  }, [onCameraReady])

  /* ---- start camera ---- */
  const startCamera = useCallback(async () => {
    if (startedRef.current) return
    if (!modelsReady) {
      console.log('[CameraPreview] Models not ready yet, skipping start')
      return
    }

    startedRef.current = true
    console.log('[CameraPreview] Starting camera...')
    setErrorMsg('')
    setCameraState('starting')

    // Stop existing stream
    if (streamRef.current) {
      console.log('[CameraPreview] Stopping existing stream')
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      streamRef.current = stream
      console.log('[CameraPreview] Stream obtained:', stream.id, 'tracks:', stream.getTracks().length)

      // Wait for video element to exist
      const video = videoRef.current
      if (!video) {
        throw new Error('Video element not found in DOM')
      }

      console.log('[CameraPreview] Video element found, assigning stream...')

      // Set all required attributes for cross-browser compatibility
      video.srcObject = stream
      video.setAttribute('autoplay', '')
      video.setAttribute('playsinline', '')
      video.setAttribute('muted', '')
      video.autoplay = true
      video.playsInline = true
      video.muted = true

      // Wait for video to have data
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Video loading timeout')), 10000)

        if (video.readyState >= 2) {
          clearTimeout(timeout)
          resolve()
          return
        }

        const onLoaded = () => {
          console.log('[CameraPreview] loadedmetadata fired')
          clearTimeout(timeout)
          resolve()
        }
        video.addEventListener('loadedmetadata', onLoaded, { once: true })
        video.addEventListener('error', () => {
          clearTimeout(timeout)
          reject(new Error('Video element error'))
        }, { once: true })
      })

      console.log('[CameraPreview] Video readyState:', video.readyState, 'dimensions:', video.videoWidth, 'x', video.videoHeight)

      // Try to play - but don't fail if rejected (video may still render)
      try {
        await video.play()
        console.log('[CameraPreview] Video.play() succeeded')
      } catch (playErr) {
        console.warn('[CameraPreview] play() rejected:', playErr)
        if (video.readyState < 2) {
          throw new Error('Video playback failed - no data available')
        }
        console.log('[CameraPreview] Video has data despite play() rejection, continuing')
      }

      setCameraState('ready')
      onCameraReadyRef.current(video, streamRef.current)
      startedRef.current = false

      // Start face detection
      startFaceDetection()
    } catch (err: unknown) {
      console.error('[CameraPreview] Camera error:', err)
      startedRef.current = false

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }

      const e = err as Error
      if (e.name === 'NotAllowedError') setErrorMsg('Camera permission denied. Please allow access.')
      else if (e.name === 'NotFoundError') setErrorMsg('No camera found on this device.')
      else if (e.name === 'NotReadableError') setErrorMsg('Camera is in use by another app.')
      else setErrorMsg(`Camera error: ${e.message}`)

      setCameraState('error')
      onCameraReadyRef.current(null, null)
    }
  }, [modelsReady])

  /* ---- face detection ---- */
  const startFaceDetection = useCallback(() => {
    console.log('[CameraPreview] Starting face detection loop')

    if (detectionRef.current) {
      clearInterval(detectionRef.current)
      detectionRef.current = null
    }

    detectionRef.current = setInterval(async () => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      try {
        const det = await faceapi.detectSingleFace(video)
        if (det) {
          console.log('[CameraPreview] Face detected! Score:', det.score)
          onFaceDetectedRef.current(true, det.score)
        } else {
          onFaceDetectedRef.current(false, 0)
        }
      } catch (e) {
        console.warn('[CameraPreview] Detection error:', e)
        onFaceDetectedRef.current(false, 0)
      }
    }, 500)
  }, [])

  /* ---- stop camera ---- */
  const stopCamera = useCallback(() => {
    console.log('[CameraPreview] Stopping camera')
    startedRef.current = false

    if (detectionRef.current) {
      clearInterval(detectionRef.current)
      detectionRef.current = null
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }

    const video = videoRef.current
    if (video) video.srcObject = null

    setCameraState('idle')
    setErrorMsg('')
    onCameraReadyRef.current(null, null)
    onFaceDetectedRef.current(false, 0)
  }, [])

  /* ---- auto-start when isActive or modelsReady ---- */
  useEffect(() => {
    if (isActive && cameraState === 'idle' && modelsReady && !startedRef.current) {
      console.log('[CameraPreview] Auto-starting camera')
      startCamera()
    }

    if (!isActive && (cameraState === 'ready' || cameraState === 'starting')) {
      console.log('[CameraPreview] Deactivating - stopping camera')
      stopCamera()
    }
  }, [isActive, cameraState, modelsReady, startCamera, stopCamera])

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      console.log('[CameraPreview] Unmounting - cleanup')
      if (detectionRef.current) clearInterval(detectionRef.current)
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Camera preview container */}
      <div className="relative rounded-2xl overflow-hidden bg-secondary aspect-video">
        {/* Video element - ALWAYS in DOM, ALWAYS visible */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{
            transform: 'scaleX(-1)',
          }}
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
            <button
              onClick={() => { setErrorMsg(''); setCameraState('idle'); startedRef.current = false; startCamera() }}
              className="btn-primary text-sm px-4 py-2"
            >
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
        {/* Manual start button */}
        {cameraState === 'idle' && isActive && (
          <button onClick={startCamera} disabled={!modelsReady} className="w-full btn-primary disabled:opacity-50">
            <Camera className="w-5 h-5 mr-2" /> Open Camera
          </button>
        )}

        {/* Primary action button */}
        {cameraState === 'ready' && primaryButton && (
          <button onClick={primaryButton.onClick} disabled={primaryButton.disabled} className="w-full btn-primary disabled:opacity-50">
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
        setError('Failed to load face detection models. Please refresh.')
      }
    }
    loadModels()

    return () => {
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current)
      if (cameraStream) cameraStream.getTracks().forEach(t => t.stop())
    }
  }, [])

  /* Handle camera ready state from CameraPreview */
  const handleCameraReady = useCallback((video: HTMLVideoElement | null, stream: MediaStream | null) => {
    console.log('[Enroll] Camera ready:', !!video, !!stream)
    setVideoEl(video)
    setCameraStream(stream)
    setCameraReady(!!video && !!stream)
  }, [])

  /* Handle face detection updates from CameraPreview */
  const handleFaceDetected = useCallback((detected: boolean, score: number) => {
    console.log('[Enroll] Face detection:', detected, score)
    setFaceDetected(detected)
    setConfidence(score)
  }, [])

  /* Capture a single face sample */
  const captureSample = useCallback(async () => {
    if (!videoEl || videoEl.readyState < 2) {
      console.warn('[Enroll] Video not ready for capture')
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
  }, [videoEl, captureCount])

  /* Process enrollment with the final captured image */
  const processEnrollment = useCallback(async (finalImage: string) => {
    setProcessing(true)
    setError('')
    try {
      console.log('[Enroll] Processing enrollment...')
      const img = await faceapi.fetchImage(finalImage)
      const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor()

      if (!det) {
        console.warn('[Enroll] No face found in captured image')
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
        console.log('[Enroll] Enrollment successful')
        setSuccess(true)
        setCurrentStep(5)
      } else {
        console.warn('[Enroll] Server enrollment failed:', data.message)
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
                    console.log('[Enroll] Moving to capture step')
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
