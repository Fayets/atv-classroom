import { useEffect, useRef } from 'react'

// Alerta al estilo de macOS (reemplaza al confirm() del navegador). Esc cancela; el foco arranca en Cancelar.
export default function Alerta({ titulo, texto, confirmar = 'Aceptar', peligro = false, onConfirmar, onCancelar }) {
  const cancelar = useRef(null)

  useEffect(() => {
    cancelar.current?.focus()
    const teclas = (e) => {
      if (e.key === 'Escape') onCancelar()
    }
    document.addEventListener('keydown', teclas)
    return () => document.removeEventListener('keydown', teclas)
  }, [onCancelar])

  return (
    <div className="msj-alerta__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="msj-alerta" role="alertdialog" aria-modal="true" aria-labelledby="msj-alerta-titulo" aria-describedby="msj-alerta-texto">
        <img className="msj-alerta__icono" src="/atv-logo.png" alt="" width={44} height={58} />
        <h2 id="msj-alerta-titulo">{titulo}</h2>
        <p id="msj-alerta-texto">{texto}</p>
        <div className="msj-alerta__botones">
          <button type="button" ref={cancelar} onClick={onCancelar}>
            Cancelar
          </button>
          <button type="button" className={peligro ? 'is-peligro' : 'is-principal'} onClick={onConfirmar}>
            {confirmar}
          </button>
        </div>
      </div>
    </div>
  )
}
