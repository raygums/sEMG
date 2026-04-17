// ============================================
// Type definitions for the EMG Acquisition System
// ============================================

export type PhaseType = 'PREPARATION' | 'ACTION' | 'REST'

export type SessionStatus = 'pending' | 'running' | 'completed' | 'aborted'

export type EventType =
  | 'SESSION_START'
  | 'SESSION_END'
  | 'SESSION_ABORT'
  | 'REPETITION_START'
  | 'REPETITION_END'
  | 'PHASE_PREPARATION'
  | 'PHASE_ACTION'
  | 'PHASE_REST'
  | 'TRIGGER_SENT'

export interface TimerConfig {
  preparationDuration: number
  actionDuration: number
  restDuration: number
  repetitionCount: number
}

export interface SessionEvent {
  eventType: EventType
  repetitionNum?: number
  clientTimestamp: number
  metadata?: Record<string, unknown>
}

export interface SessionState {
  currentPhase: PhaseType
  currentRepetition: number
  totalRepetitions: number
  phaseTimeRemaining: number
  phaseTotalTime: number
  isRunning: boolean
  progress: number
}

export interface GestureFormData {
  name: string
  label: string
  description?: string
  videoUrl?: string
  orderIndex?: number
}

export interface ConfigFormData {
  name: string
  preparationDuration: number
  actionDuration: number
  restDuration: number
  repetitionCount: number
}

export interface ExportData {
  sessionId: string
  participantName: string
  gestureName: string
  gestureLabel: string
  events: {
    eventType: string
    repetitionNum: number | null
    timestamp: string
    clientTimestamp: string
    metadata: Record<string, unknown> | null
  }[]
}
