import { Link } from 'react-router-dom'
import { flatNav } from '../content/sidebar'

export default function PrevNext({ currentPath }: { currentPath: string }) {
  const idx = flatNav.findIndex(i => i.href === currentPath)

  const prev = idx > 0 ? flatNav[idx - 1] : null
  const next = idx >= 0 && idx < flatNav.length - 1 ? flatNav[idx + 1] : null

  return (
    <div className="flex items-center gap-3">
      {prev ? (
        <Link to={prev.href} className="mb-outline-button flex-1 rounded-[1.35rem] p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-mb-muted">Previous</div>
          <div className="font-semibold text-mb-text">{prev.title}</div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}

      {next ? (
        <Link to={next.href} className="mb-outline-button flex-1 rounded-[1.35rem] p-4 text-right">
          <div className="text-xs uppercase tracking-[0.2em] text-mb-muted">Next</div>
          <div className="font-semibold text-mb-text">{next.title}</div>
        </Link>
      ) : (
        <div className="flex-1" />
      )}
    </div>
  )
}
