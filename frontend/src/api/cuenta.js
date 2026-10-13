import { request, requestForm } from './client'

export function fetchCuenta() {
  return request('/api/cuenta')
}

export function subirFoto(blob) {
  const datos = new FormData()
  datos.append('archivo', blob, 'foto.jpg')
  return requestForm('/api/cuenta/foto', { method: 'POST', body: datos })
}

export function quitarFoto() {
  return request('/api/cuenta/foto', { method: 'DELETE' })
}

/** Recorta al centro y achica a 512×512 en el navegador: sube rápido y siempre queda cuadrada. */
export function prepararFoto(archivo, lado = 512) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo)
    const img = new Image()
    img.onload = () => {
      const corte = Math.min(img.width, img.height)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = Math.min(lado, corte)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, (img.width - corte) / 2, (img.height - corte) / 2, corte, corte, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo leer la foto.'))), 'image/jpeg', 0.88)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Ese archivo no es una imagen que se pueda abrir.'))
    }
    img.src = url
  })
}
