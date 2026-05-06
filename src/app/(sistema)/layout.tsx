import Sidebar from '@/components/Sidebar'
import { AuthProvider } from '@/lib/auth-context'

export default function SistemaLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f5f5f5' }}>
        <Sidebar />
   <main style={{ marginLeft: 220, flex: 1, padding: '32px', minWidth: 0 }}>
          {children}
        </main>
      </div>
    </AuthProvider>
  )
}