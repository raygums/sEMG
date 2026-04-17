// SSE (Server-Sent Events) endpoint for real-time trigger signals
// External sensor module can connect to this endpoint to receive
// phase transition notifications in real-time

const clients = new Set<ReadableStreamDefaultController>()

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      clients.add(controller)

      // Send initial connection event
      const data = `data: ${JSON.stringify({
        type: 'CONNECTED',
        timestamp: Date.now(),
        message: 'Trigger stream connected',
      })}\n\n`
      controller.enqueue(new TextEncoder().encode(data))
    },
    cancel(controller) {
      clients.delete(controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

// POST endpoint to send trigger events from session runner
export async function POST(request: Request) {
  const body = await request.json()

  const event = {
    type: body.eventType,
    sessionId: body.sessionId,
    gestureName: body.gestureName,
    repetitionNum: body.repetitionNum,
    timestamp: Date.now(),
    clientTimestamp: body.clientTimestamp,
  }

  const data = `data: ${JSON.stringify(event)}\n\n`
  const encoded = new TextEncoder().encode(data)

  // Broadcast to all connected clients
  for (const controller of clients) {
    try {
      controller.enqueue(encoded)
    } catch {
      clients.delete(controller)
    }
  }

  return Response.json({ sent: clients.size, event })
}
