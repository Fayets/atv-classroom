import { useEffect, useState } from 'react'
import { fetchSessionProfile } from '../api/client'
import { useAuth } from '../context/AuthContext'

function mensajeDiasRestantes(dias) {
  if (dias == null) return null
  if (dias <= 0) return 'Tu acceso al programa venció'
  if (dias === 1) return 'Te queda 1 día en el programa'
  return `Te quedan ${dias} días en el programa`
}

export default function AccesoRestante() {
  const { isAdmin, user } = useAuth()
  const [diasRestantes, setDiasRestantes] = useState(user?.dias_restantes ?? null)

  useEffect(() => {
    if (isAdmin) return

    let cancelled = false

    async function load() {
      try {
        const data = await fetchSessionProfile()
        if (!cancelled && typeof data.dias_restantes === 'number') {
          setDiasRestantes(data.dias_restantes)
        }
      } catch {
        // Sin fecha de vencimiento o error de red: no mostramos el badge.
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [isAdmin])

  if (isAdmin) return null

  const mensaje = mensajeDiasRestantes(diasRestantes)
  if (!mensaje) return null

  const variant =
    diasRestantes <= 0
      ? 'hub-page__access--expired'
      : diasRestantes <= 7
        ? 'hub-page__access--warning'
        : ''

  return (
    <p className={`hub-page__access${variant ? ` ${variant}` : ''}`}>{mensaje}</p>
  )
}
