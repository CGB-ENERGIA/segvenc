'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setCarregando(true)
    setErro(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      setErro('E-mail ou senha inválidos.')
      setCarregando(false)
      return
    }

    router.push('/dashboard')
  }

  async function handleEsqueciSenha() {
    if (!email) {
      setErro('Informe seu e-mail para redefinir a senha.')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    if (error) {
      setErro('Erro ao enviar e-mail. Verifique o endereço informado.')
    } else {
      setErro(null)
      alert('E-mail de redefinição enviado! Verifique sua caixa de entrada.')
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f5f5f5',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      padding: '20px',
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: 20,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 400,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>

        {/* LOGO */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <Image
            src="/logo-cgb.png"
            alt="CGB"
            width={180}
            height={60}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>

        {/* TÍTULO */}
        <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', marginBottom: 4 }}>
          Bem-vindo de volta
        </h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: 28 }}>
          Acesse com seu e-mail corporativo
        </p>

        {/* FORMULÁRIO */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 5 }}>
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@cgbengenharia.com.br"
              required
              style={{
                width: '100%', height: 40, border: '1px solid #e0e0e0',
                borderRadius: 8, padding: '0 12px', fontSize: 14,
                color: '#333', backgroundColor: '#fafafa', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#666', marginBottom: 5 }}>
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              required
              style={{
                width: '100%', height: 40, border: '1px solid #e0e0e0',
                borderRadius: 8, padding: '0 12px', fontSize: 14,
                color: '#333', backgroundColor: '#fafafa', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {erro && (
            <div style={{
              fontSize: 13, color: '#b91c1c', backgroundColor: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 8,
              padding: '8px 12px', marginBottom: 12,
            }}>
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={carregando}
            style={{
              width: '100%', height: 42, backgroundColor: '#9f183c',
              color: 'white', border: 'none', borderRadius: 8,
              fontSize: 14, fontWeight: 500, cursor: 'pointer',
              opacity: carregando ? 0.7 : 1, marginTop: 4,
            }}
          >
            {carregando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <button
          onClick={handleEsqueciSenha}
          style={{
            width: '100%', textAlign: 'center', fontSize: 13,
            color: '#9f183c', background: 'none', border: 'none',
            cursor: 'pointer', marginTop: 14,
          }}
        >
          Esqueci minha senha
        </button>

        <div style={{ borderTop: '1px solid #f0f0f0', margin: '20px 0' }} />

        <p style={{ fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 1.6 }}>
          Primeiro acesso? Informe seu e-mail e clique em<br />
          <span style={{ color: '#666', fontWeight: 500 }}>"Esqueci minha senha"</span> para receber o acesso.
        </p>
      </div>
    </div>
  )
}