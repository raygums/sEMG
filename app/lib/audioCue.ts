/**
 * Audio cue manager for session phases.
 * Plays a beep sound to signal phase transitions without visual dependency.
 */

class AudioCueManager {
  private audioContext: AudioContext | null = null
  private initialized = false

  /**
   * Initialize audio context on first user interaction.
   * Required by browser autoplay policy.
   */
  initializeAudioContext() {
    if (this.initialized) return

    try {
      const audioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
      this.audioContext = new audioContextClass()
      this.initialized = true
    } catch (error) {
      console.warn('AudioContext not available:', error)
    }
  }

  /**
   * Play a beep sound using Web Audio API.
   * Duration: 100ms, frequency: 800Hz, type: sine wave
   */
  playBeep(durationMs: number = 100, frequency: number = 800) {
    if (!this.audioContext) {
      this.initializeAudioContext()
    }

    if (!this.audioContext || this.audioContext.state === 'closed') {
      console.warn('AudioContext not available for beep')
      return
    }

    try {
      const now = this.audioContext.currentTime
      const duration = durationMs / 1000

      // Create oscillator
      const oscillator = this.audioContext.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency

      // Create gain (volume control)
      const gain = this.audioContext.createGain()
      gain.gain.setValueAtTime(0.3, now) // 30% volume
      gain.gain.exponentialRampToValueAtTime(0.01, now + duration) // Fade out

      // Connect and start
      oscillator.connect(gain)
      gain.connect(this.audioContext.destination)

      oscillator.start(now)
      oscillator.stop(now + duration)
    } catch (error) {
      console.warn('Failed to play beep:', error)
    }
  }

  /**
   * Play a short double beep for important signals (phase transitions).
   */
  playDoubleBip() {
    // First beep
    this.playBeep(100, 800)
    // Second beep after 150ms
    setTimeout(() => this.playBeep(100, 800), 150)
  }
}

export const audioCue = new AudioCueManager()
