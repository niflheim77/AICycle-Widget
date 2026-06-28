import { arcColor, pct } from '../lib'

export function Gauge({ u, size = 64 }: { u: number; size?: number }) {
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const dash = c * Math.min(Math.max(u, 0), 1)
  const color = arcColor(u)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="gauge">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#2a2a32" strokeWidth={7} fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={7}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className="gauge-text" fill={color}>
        {pct(u)}%
      </text>
    </svg>
  )
}
