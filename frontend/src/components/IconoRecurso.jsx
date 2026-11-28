// Brand icons for external resources, drawn inline so they work offline and scale cleanly.
// The key comes from tipoRecurso (utils/frentes.js), which reads it from the resource URL.
// Unknown platforms fall back to a generic link clip.

const page = (color, detail) => (
  <>
    <path d="M6 2h8.5L20 7.5V20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill={color} />
    <path d="M14.5 2 20 7.5h-4a1.5 1.5 0 0 1-1.5-1.5z" fill="#fff" opacity="0.55" />
    {detail}
  </>
)

const ICONS = {
  doc: page('#4285F4', <path d="M7.5 11h9M7.5 14h9M7.5 17h6" stroke="#fff" strokeWidth="1.5" />),
  sheet: page('#0F9D58', <path d="M7.5 11h9v7.5h-9zM7.5 14.75h9M12 11v7.5" fill="none" stroke="#fff" strokeWidth="1.3" />),
  slides: page('#F4B400', <rect x="7.5" y="11.5" width="9" height="6.5" fill="none" stroke="#fff" strokeWidth="1.5" />),
  form: page('#7248B9', <path d="M7.5 11.5h1.4M7.5 14.5h1.4M7.5 17.5h1.4M10.5 11.5h6M10.5 14.5h6M10.5 17.5h6" stroke="#fff" strokeWidth="1.4" />),
  drive: (
    <>
      <path d="M8.3 3h7.4l7 12.2h-7.4z" fill="#FFBA00" />
      <path d="M8.3 3 1.3 15.2 5 21.6l7-12.2z" fill="#00AC47" />
      <path d="M8.7 15.2h14l-3.7 6.4H5z" fill="#2684FC" />
    </>
  ),
  miro: (
    <>
      <rect width="24" height="24" rx="5" fill="#FFD02F" />
      <path d="M15.9 5.5h-2.2l1.9 3.4-4.2-3.4H9.2l2.1 3.9-4.4-3.9H4.7l2.2 5L4.7 18.5h2.2l4.4-8.2-2.1 8.2h2.2l4.2-8.6-1.9 8.6h2.2l3.4-9.8z" fill="#050038" />
    </>
  ),
  loom: (
    <>
      <circle cx="12" cy="12" r="11" fill="#625DF5" />
      <g fill="#fff">
        {[0, 45, 90, 135].map((g) => (
          <rect key={g} x="10.8" y="4" width="2.4" height="16" rx="1.2" transform={`rotate(${g} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="3" fill="#625DF5" />
    </>
  ),
  youtube: (
    <>
      <rect x="1" y="4.5" width="22" height="15" rx="4.5" fill="#FF0000" />
      <path d="M10 8.8v6.4l5.6-3.2z" fill="#fff" />
    </>
  ),
  wa: (
    <>
      <path d="M12 1.5A10.5 10.5 0 0 0 3 17.4L1.5 22.5l5.3-1.4A10.5 10.5 0 1 0 12 1.5z" fill="#25D366" />
      <path d="M8.4 6.8c.3 0 .6 0 .8.5l1 2.4c.1.3 0 .5-.2.8l-.6.7c.9 1.7 2.2 3 4 3.9l.7-.8c.2-.3.5-.3.8-.2l2.3 1.1c.3.2.4.4.3.8-.2 1.2-1.4 2-2.5 2-3.9 0-8.4-4.6-8.4-8.4 0-1.3 1-2.8 1.8-2.8z" fill="#fff" />
    </>
  ),
  notion: (
    <>
      <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" fill="#fff" stroke="#111" strokeWidth="1.6" />
      <path d="M8 17V7.4l1.8-.1 5 7.5V7M7 7.4h3M13.5 7h3" fill="none" stroke="#111" strokeWidth="1.5" />
    </>
  ),
  pdf: page('#D93025', <text x="12" y="17.5" textAnchor="middle" fontSize="6.4" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">PDF</text>),
  link: <path d="M21 11.5 12.4 20a5.6 5.6 0 0 1-8-8l8.7-8.6a3.7 3.7 0 0 1 5.3 5.3l-8.7 8.6a1.9 1.9 0 0 1-2.6-2.6l8-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />,
}

export default function IconoRecurso({ tag, size = 22, title }) {
  const key = String(tag || '').toLowerCase()
  return (
    <svg className="rec-ico" viewBox="0 0 24 24" width={size} height={size} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      {ICONS[key] || ICONS.link}
    </svg>
  )
}
