import { Link } from 'react-router-dom'
import { flatNav } from '../content/sidebar'

export default function PrevNext({ currentPath }: { currentPath: string }) {
  const idx = flatNav.findIndex(i => i.href === currentPath)

  const prev = idx > 0 ? flatNav[idx - 1] : null
  const next = idx >= 0 && idx < flatNav.length - 1 ? flatNav[idx + 1] : null

  return (
    <div className="flex items-center gap-3">
      {prev ? (
        <Link
          to={prev.href}
          className="flex-1 rounded-2xl border border-mb-border bg-mb-panel2/60 p-4 hover:shadow-glow"
        >
          <div className="text-xs text-mb-muted">Previous</div>
          <div className="font-semibold">{prev.title}</div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}

      {next ? (
        <Link
          to={next.href}
          className="flex-1 rounded-2xl border border-mb-border bg-mb-panel2/60 p-4 hover:shadow-glow"
        >
          <div className="text-xs text-mb-muted">Next</div>
          <div className="font-semibold">{next.title}</div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}
