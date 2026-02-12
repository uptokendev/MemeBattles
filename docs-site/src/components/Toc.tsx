import clsx from 'clsx'

export type TocItem = {
  depth: number
  text: string
  id: string
}

export default function Toc({ items }: { items: TocItem[] }) {
  if (!items.length) {
    return <div className="text-sm text-mb-muted">No headings yet.</div>
  }

  return (
    <div className="space-y-2">
      {items.map(i => (
        <a
          key={i.id}
          href={`#${i.id}`}
          className={clsx(
            'block text-sm text-mb-muted hover:text-mb-text',
            i.depth === 3 && 'pl-3'
          )}
        >
          {i.text}
        </a>
      ))}
    </div>
  )
}
