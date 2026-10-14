import { createContext, useCallback, useContext, useMemo, useState } from 'react'

// Estado de la ventana del panel del equipo, como en macOS:
// "max" (pantalla completa), "ventana" (flotante), "min" (en el Dock) o "cerrada".
const EscritorioContext = createContext(null)
const CLAVE = 'atv_ventana'

function leer() {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) || '{}')
    return { tamano: v.tamano === 'ventana' ? 'ventana' : 'max' }
  } catch {
    return { tamano: 'max' }
  }
}

export function EscritorioProvider({ children }) {
  const [tamano, setTamano] = useState(() => leer().tamano) // cómo vuelve al abrirse
  const [visible, setVisible] = useState('abierta') // abierta | min | cerrada
  // Desde Mensajes se pide abrir la ficha de un cliente en la carpeta Clientes (n cambia en cada pedido).
  const [fichaPedida, setFichaPedida] = useState(null)
  const verFicha = useCallback((clienteId) => setFichaPedida({ id: clienteId, n: Date.now() }), [])

  const guardar = (t) => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ tamano: t }))
    } catch {
      // sin almacenamiento, el tamaño vale mientras la pestaña esté abierta
    }
  }

  const alternarTamano = useCallback(() => {
    setTamano((t) => {
      const nuevo = t === 'max' ? 'ventana' : 'max'
      guardar(nuevo)
      return nuevo
    })
  }, [])
  const minimizar = useCallback(() => setVisible('min'), [])
  const cerrar = useCallback(() => setVisible('cerrada'), [])
  const abrir = useCallback(() => setVisible('abierta'), [])

  const valor = useMemo(
    () => ({ tamano, visible, alternarTamano, minimizar, cerrar, abrir, fichaPedida, verFicha }),
    [tamano, visible, alternarTamano, minimizar, cerrar, abrir, fichaPedida, verFicha],
  )
  return <EscritorioContext.Provider value={valor}>{children}</EscritorioContext.Provider>
}

/** null fuera del escritorio (clientes): los botones del semáforo quedan como adorno. */
export function useEscritorio() {
  return useContext(EscritorioContext)
}
