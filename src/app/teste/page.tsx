'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function TestePage() {
  const [dados, setDados] = useState<any[]>([])
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    async function buscarDados() {
      // Substitua 'auditorias' pelo nome de uma tabela que você criou
      const { data, error } = await supabase
        .from('colaboradores') 
        .select('*')

      if (error) {
        setErro(error.message)
      } else {
        setDados(data || [])
      }
    }

    buscarDados()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Teste de Conexão Supabase - SISGEA</h1>
      
      {erro && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          Erro: {erro}
        </div>
      )}

      <div className="mt-4">
        <h2 className="text-lg font-semibold">Dados encontrados:</h2>
        <pre className="bg-gray-100 p-4 mt-2 rounded border">
          {dados.length > 0 
            ? JSON.stringify(dados, null, 2) 
            : "Nenhum dado encontrado ou carregando..."}
        </pre>
      </div>
    </div>
  )
}