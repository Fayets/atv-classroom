import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Finder from './Finder'
import ContratosCarpeta from './ContratosCarpeta'
import CierresCarpeta from './CierresCarpeta'
import CuellosCarpeta from './CuellosCarpeta'
import LlamadasCarpeta from './LlamadasCarpeta'
import SopsCarpeta from './SopsCarpeta'
import OnboardingsCarpeta from './OnboardingsCarpeta'
import BibliotecaApp from './BibliotecaApp'
import NuevaClase from './NuevaClase'
import NuevoCliente from '../mensajes/NuevoCliente'
import '../../styles/finder.css'

// Las carpetas y apps del equipo (antes en el escritorio de macOS) como ventanas flotantes sobre la página.
// Se abren desde la barra lateral (Sidebar manda "atv:carpeta" con el id) y Mensajes pide la ficha de un
// cliente con "atv:ficha" (abre Clientes en esa ficha). Van en una capa fija a la derecha de la barra lateral.

const ESTADO = { clientes: false, contratos: false, cierres: false, onboardings: false, llamadas: false, cuellos: false, sops: false, biblioteca: false }

export function abrirCarpeta(id) {
  window.dispatchEvent(new CustomEvent('atv:carpeta', { detail: id }))
}

export default function HerramientasEquipo() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [abiertas, setAbiertas] = useState(ESTADO)
  const [frente, setFrente] = useState(null)
  const [fichaPedida, setFichaPedida] = useState(null)
  const [dandoAlta, setDandoAlta] = useState(false)
  const [dandoClase, setDandoClase] = useState(false)

  const abrir = (id) => {
    if (id === 'alta') return setDandoAlta(true)
    if (id === 'clase') return setDandoClase(true)
    setAbiertas((a) => ({ ...a, [id]: true }))
    setFrente(id)
  }
  const cerrar = (id) => setAbiertas((a) => ({ ...a, [id]: false }))

  useEffect(() => {
    const alPedir = (e) => abrir(e.detail)
    const alPedirFicha = (e) => {
      setFichaPedida({ id: e.detail, n: Date.now() })
      abrir('clientes')
    }
    window.addEventListener('atv:carpeta', alPedir)
    window.addEventListener('atv:ficha', alPedirFicha)
    return () => {
      window.removeEventListener('atv:carpeta', alPedir)
      window.removeEventListener('atv:ficha', alPedirFicha)
    }
  }, [])

  // Ir a un chat o a una pantalla desde una carpeta: se cierran las ventanas para ver la pantalla.
  function abrirChat(ruta) {
    navigate(ruta)
    setAbiertas(ESTADO)
    setFrente(null)
  }

  const props = (id) => ({ abierta: abiertas[id], alFrente: frente === id, alEnfocar: () => setFrente(id), alCerrar: () => cerrar(id) })

  return (
    <div className="eq-herr">
      {isAdmin ? <Finder irA={fichaPedida} {...props('clientes')} alAbrirChat={abrirChat} /> : null}
      {isAdmin ? <ContratosCarpeta {...props('contratos')} /> : null}
      {isAdmin ? <CierresCarpeta {...props('cierres')} /> : null}
      <BibliotecaApp {...props('biblioteca')} alAbrirChat={abrirChat} />
      <SopsCarpeta {...props('sops')} alAbrirChat={abrirChat} />
      <CuellosCarpeta {...props('cuellos')} />
      <LlamadasCarpeta {...props('llamadas')} alAbrirChat={abrirChat} />
      <OnboardingsCarpeta {...props('onboardings')} alAbrirChat={abrirChat} />
      {dandoClase ? (
        <NuevaClase
          onCerrar={() => setDandoClase(false)}
          onVerModulo={(id) => {
            setDandoClase(false)
            abrirChat(`/classroom/${id}`)
          }}
        />
      ) : null}
      {dandoAlta ? (
        <NuevoCliente
          onCerrar={() => setDandoAlta(false)}
          onAbrirChat={(canalId) => {
            setDandoAlta(false)
            if (canalId) abrirChat(`/mensajes?c=${canalId}`)
          }}
        />
      ) : null}
    </div>
  )
}
