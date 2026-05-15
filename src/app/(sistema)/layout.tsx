'use client'

import Sidebar from '@/components/Sidebar'
import { AuthProvider, useAuth } from '@/lib/auth-context'

function SistemaConteudo({ children }: { children: React.ReactNode }) {
  const { carregando } = useAuth()

  if (carregando) return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'white' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 32, height: 32, border: '3px solid #f0f0f0', borderTop: '3px solid #9f183c', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ fontSize: 14, color: '#888', margin: 0 }}>Carregando...</p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'white' }}>
      <Sidebar />
      <main style={{
        marginLeft: 'var(--sidebar-width, 220px)',
        flex: 1,
        padding: '32px',
        minWidth: 0,
        transition: 'margin-left 0.2s ease',
      }}>
        {children}
      </main>
    </div>
  )
}

export default function SistemaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <SistemaConteudo>{children}</SistemaConteudo>
    </AuthProvider>
  )
}