import { useEffect, useRef, useCallback } from 'react'

interface UseOptimizedTimerOptions {
  duration: number
  isRunning: boolean
  restartKey?: string | number
  onTimeUpdate?: (remaining: number) => void
  onComplete?: () => void
}

/**
 * Optimized timer hook that avoids React re-render hell.
 * Uses useRef for calculations and direct DOM manipulation for UI updates.
 * Runs at ~60fps without triggering React state updates every frame.
 *
 * KEY FIX: Includes restartKey in dependency array to detect phase transitions
 * even when duration values remain the same (e.g., REST→PREPARATION both 5s).
 * This ensures the timer completely restarts on every phase/repetition change.
 */
export function useOptimizedTimer({
  duration,
  isRunning,
  restartKey,
  onTimeUpdate,
  onComplete,
}: UseOptimizedTimerOptions) {
  const timerDisplayRef = useRef<HTMLElement | null>(null)
  const phaseStartRef = useRef<number>(0)
  const workerRef = useRef<Worker | null>(null)
  const isCompleteRef = useRef(false)
  const workerUrlRef = useRef<string>('')

  const updateDisplay = useCallback((remaining: number) => {
    if (!timerDisplayRef.current) return

    const mins = Math.floor(remaining / 60)
    const secs = Math.floor(remaining % 60)
    const ms = Math.floor((remaining % 1) * 100)
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`

    // Direct DOM manipulation - no React re-render
    timerDisplayRef.current.textContent = formatted
  }, [])

  // Cleanup worker utility
  const cleanupWorker = useCallback(() => {
    if (workerRef.current) {
      try {
        workerRef.current.postMessage('stop')
        workerRef.current.terminate()
      } catch {
        // Worker may have already terminated
      }
      workerRef.current = null
    }
    if (workerUrlRef.current) {
      URL.revokeObjectURL(workerUrlRef.current)
      workerUrlRef.current = ''
    }
  }, [])

  // Initialize or update timer
  useEffect(() => {
    if (!isRunning) {
      cleanupWorker()
      isCompleteRef.current = false
      return
    }

    // Reset state when starting
    phaseStartRef.current = performance.now()
    isCompleteRef.current = false

    // Clean up any existing worker before creating a new one
    cleanupWorker()

    // Create Web Worker for timing (survives background tab throttling)
    const workerCode = `
      let timerId = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          timerId = setInterval(() => self.postMessage('tick'), 16);
        } else if (e.data === 'stop') {
          clearInterval(timerId);
        }
      };
    `
    const blob = new Blob([workerCode], { type: 'application/javascript' })
    const workerUrl = URL.createObjectURL(blob)
    workerUrlRef.current = workerUrl
    const worker = new Worker(workerUrl)
    workerRef.current = worker

    worker.onmessage = () => {
      const elapsed = (performance.now() - phaseStartRef.current) / 1000
      const remaining = Math.max(0, duration - elapsed)

      // Update display
      updateDisplay(remaining)

      // Call callback without triggering React re-render
      if (onTimeUpdate) {
        onTimeUpdate(remaining)
      }

      // Fire completion
      if (remaining <= 0 && !isCompleteRef.current) {
        isCompleteRef.current = true
        if (onComplete) {
          onComplete()
        }
      }
    }

    worker.postMessage('start')

    return () => {
      cleanupWorker()
    }
  }, [isRunning, duration, restartKey, updateDisplay, onTimeUpdate, onComplete, cleanupWorker])

  return { timerDisplayRef }
}
