export function getVideoEmbedInfo(url) {
  if (!url || typeof url !== 'string') return null

  const trimmed = url.trim()
  if (!trimmed) return null

  const youtubePatterns = [
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
  ]

  for (const pattern of youtubePatterns) {
    const match = trimmed.match(pattern)
    if (match?.[1]) {
      return {
        type: 'iframe',
        src: `https://www.youtube.com/embed/${match[1]}`,
      }
    }
  }

  const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([a-f0-9]+))?/i)
  if (vimeoMatch?.[1]) {
    const videoId = vimeoMatch[1]
    const privacyHash = vimeoMatch[2]
    const src = privacyHash
      ? `https://player.vimeo.com/video/${videoId}?h=${privacyHash}`
      : `https://player.vimeo.com/video/${videoId}`
    return { type: 'iframe', src }
  }

  if (/player\.vimeo\.com\/video\/\d+/.test(trimmed)) {
    return { type: 'iframe', src: trimmed }
  }

  const loomMatch = trimmed.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/)
  if (loomMatch?.[1]) {
    return {
      type: 'iframe',
      src: `https://www.loom.com/embed/${loomMatch[1]}`,
    }
  }

  const wistiaMatch = trimmed.match(
    /wistia\.(?:net|com)\/(?:embed\/iframe|medias)\/([a-zA-Z0-9]+)/,
  )
  if (wistiaMatch?.[1]) {
    return {
      type: 'iframe',
      src: `https://fast.wistia.net/embed/iframe/${wistiaMatch[1]}`,
    }
  }

  if (/\.(mp4|webm|ogg)(\?|$)/i.test(trimmed)) {
    return { type: 'video', src: trimmed }
  }

  if (
    /^https?:\/\/.+(youtube\.com\/embed|player\.vimeo\.com|loom\.com\/embed|wistia\.net\/embed)/i.test(
      trimmed,
    )
  ) {
    return { type: 'iframe', src: trimmed }
  }

  return null
}

/** @deprecated use getVideoEmbedInfo */
export function getVideoEmbedUrl(url) {
  const info = getVideoEmbedInfo(url)
  return info?.type === 'iframe' ? info.src : info?.type === 'video' ? info.src : null
}

export function isDirectVideo(url) {
  return getVideoEmbedInfo(url)?.type === 'video'
}

export function formatDuracion(segundos) {
  if (segundos == null || Number.isNaN(segundos)) return null
  const total = Math.max(0, Math.floor(segundos))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}
