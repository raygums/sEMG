import { prisma } from '@/app/lib/prisma'
import { notFound } from 'next/navigation'
import SessionController from '@/app/components/admin/SessionController'

export default async function AdminSessionDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = await params

  // Mengambil data sesi secara detail dari PostgreSQL
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      gesture: true,
      config: true,
    },
  })

  // Jika ID sesi tidak ditemukan di database
  if (!session) {
    notFound()
  }

  return (
    <div className="container mx-auto py-10 flex justify-center">
      {/* Memanggil Panel Kontrol Peneliti */}
      <SessionController 
        sessionId={session.id}
        gestureName={session.gesture.name}
        gestureLabel={session.gesture.label}
        participantName={session.participantName}
        config={{
          preparationDuration: session.config.preparationDuration,
          actionDuration: session.config.actionDuration,
          restDuration: session.config.restDuration,
          repetitionCount: session.config.repetitionCount
        }}
      />
    </div>
  )
}