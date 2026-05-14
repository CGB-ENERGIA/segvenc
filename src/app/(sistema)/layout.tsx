import Sidebar from '@/components/Sidebar'
import { AuthProvider } from '@/lib/auth-context'

export default function SistemaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
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
    </AuthProvider>
  )
}