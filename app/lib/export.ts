import type { ExportData } from './types'

export function exportToCSV(data: ExportData): string {
  const headers = [
    'session_id',
    'participant_name',
    'gesture_name',
    'gesture_label',
    'event_type',
    'repetition_num',
    'server_timestamp',
    'client_timestamp_ms',
  ]

  const rows = data.events.map((event) => [
    data.sessionId,
    data.participantName,
    data.gestureName,
    data.gestureLabel,
    event.eventType,
    event.repetitionNum ?? '',
    event.timestamp,
    event.clientTimestamp,
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
  ].join('\n')

  return csvContent
}

export function exportToJSON(data: ExportData): string {
  return JSON.stringify(data, null, 2)
}
