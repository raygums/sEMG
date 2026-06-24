import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ============================================
// gateway-status stub (Serial mode)
// ============================================
// Endpoint ini dipertahankan sebagai stub kompatibilitas mundur.
// Sistem sudah pivot dari BLE ke Serial (kabel USB) — tidak ada lagi
// konsep "gateway disconnect/reconnect" karena Serial kabel tidak punya
// skenario terputus seperti BLE.
//
// GET selalu return connected: true (Serial tidak pernah "terputus")
// POST diabaikan (tidak ada lagi GatewayEvent di schema)
// DELETE diabaikan (tidak ada open events untuk di-close)

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    connected: true,
    hasEverConnected: false,
    openEvent: null,
    recentEvents: [],
    note: 'Serial mode — gateway-status tidak digunakan',
  })
}

export async function POST(_req: NextRequest) {
  return NextResponse.json({
    message: 'Serial mode — gateway-status POST diabaikan',
  })
}

export async function DELETE(_req: NextRequest) {
  return NextResponse.json({
    message: 'Serial mode — tidak ada GatewayEvent untuk di-reset',
    count: 0,
  })
}
