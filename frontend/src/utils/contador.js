// The Messages counter: how many messages are unread. Mentions can arrive before the unread total
// refreshes, so the higher of both is shown. Drawn by components/Contador.jsx.
export function valorContador(menciones, noLeidos) {
  return Math.max(noLeidos || 0, menciones || 0)
}
