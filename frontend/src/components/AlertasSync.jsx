// Arma las notificaciones del miembro que no son chats (ver utils/alertasApp.js) con lo que la app ya trae:
// - el roadmap: una versión nueva que le dejó su coach y los pasos que el equipo marcó como hechos (últimos 30 días);
// - el acceso: cuando le quedan 15 días o menos;
// - las notificaciones del celular: si están apagadas.
// El cierre de mes lo publica CierreMes.jsx. No dibuja nada; se refresca cada 10 minutos y al volver a la pestaña.
import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { fetchMiRoadmap } from '../api/roadmap'
import { estadoAvisos } from '../utils/push'
import { publicarAlertas } from '../utils/alertasApp'

const DIAS = 30
const MAXIMO = 8
const reciente = (fecha) => fecha && Date.now() - new Date(fecha).getTime() < DIAS * 864e5

function delRoadmap(datos) {
  const lista = []
  for (const grupo of datos?.grupos || []) {
    for (const doc of grupo.docs || []) {
      if (doc.estado === 'reemplazado') continue
      const coach = grupo.coach?.nombre || 'Tu coach'
      if (reciente(doc.fecha)) {
        lista.push({
          id: `roadmap-doc-${doc.id}`,
          tipo: 'roadmap',
          titulo: doc.version > 1 ? `Nueva versión de tu roadmap de ${doc.titulo}` : `Tenés tu roadmap de ${doc.titulo}`,
          texto: `${coach} te lo dejó listo. Tu próximo paso ya está arriba de todo.`,
          fecha: doc.fecha,
          accion: 'Ver roadmap',
          ruta: '/roadmap',
        })
      }
      for (const paso of doc.pasos || []) {
        if (!paso.hecho || paso.hecho_por?.tipo !== 'equipo' || !reciente(paso.hecho_en)) continue
        lista.push({
          id: `roadmap-paso-${doc.id}-${paso.id}`,
          tipo: 'paso',
          titulo: `${paso.hecho_por.nombre} marcó un paso como hecho`,
          texto: paso.texto,
          fecha: paso.hecho_en,
          accion: 'Ver roadmap',
          ruta: '/roadmap',
        })
      }
    }
  }
  return lista.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, MAXIMO)
}

export default function AlertasSync() {
  const { isAuthenticated, isEquipo, user } = useAuth()
  const miembro = isAuthenticated && !isEquipo
  const conRoadmap = (user?.permisos?.roadmaps ?? (user?.rol === '2k' ? 'no' : 'si')) !== 'no'
  const dias = user?.dias_restantes

  // Acceso por vencer: persistente cuando queda una semana o menos.
  useEffect(() => {
    publicarAlertas(
      'acceso',
      miembro && dias != null && dias <= 15
        ? [{
            id: `acceso-${dias < 0 ? 'vencido' : dias <= 7 ? 'semana' : 'quincena'}`,
            tipo: 'acceso',
            titulo: dias < 0 ? 'Se venció tu acceso' : `Te ${dias === 1 ? 'queda 1 día' : `quedan ${dias} días`} de acceso`,
            texto: dias < 0 ? 'Hablá con tu coach para renovarlo y no perder el material.' : 'Hablá con tu coach si querés seguir después de esa fecha.',
            fecha: null,
            urgente: dias <= 7,
            persistente: dias <= 7,
            accion: 'Ver mi cuenta',
            ruta: '/cuenta',
          }]
        : [],
    )
  }, [miembro, dias])

  useEffect(() => {
    if (!miembro) {
      publicarAlertas('roadmap', [])
      publicarAlertas('avisos', [])
      return undefined
    }
    let vivo = true
    const refrescar = async () => {
      if (conRoadmap) {
        try {
          const datos = await fetchMiRoadmap()
          if (vivo) publicarAlertas('roadmap', delRoadmap(datos))
        } catch {
          /* sin roadmap: no hay alertas de roadmap */
        }
      }
      try {
        const estado = await estadoAvisos()
        if (!vivo) return
        publicarAlertas(
          'avisos',
          estado === 'apagadas'
            ? [{
                id: 'avisos-apagadas',
                tipo: 'avisos',
                titulo: 'Las notificaciones están apagadas',
                texto: 'Activalas para enterarte apenas te escriben, aunque tengas la app cerrada.',
                fecha: null,
                accion: 'Activarlas',
                ruta: '/cuenta',
              }]
            : [],
        )
      } catch {
        /* nada */
      }
    }
    refrescar()
    const cada = setInterval(refrescar, 10 * 60 * 1000)
    const alVolver = () => document.visibilityState === 'visible' && refrescar()
    document.addEventListener('visibilitychange', alVolver)
    return () => {
      vivo = false
      clearInterval(cada)
      document.removeEventListener('visibilitychange', alVolver)
    }
  }, [miembro, conRoadmap])

  return null
}
