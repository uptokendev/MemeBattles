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
            'block rounded-xl border border-transparent px-2 py-1.5 text-sm text-mb-muted transition-colors hover:border-mb-border/60 hover:bg-mb-panel2/60 hover:text-mb-text',
            i.depth === 3 && 'ml-3'
          )}
        >
          {i.text}
        </a>
      ))}
    </div>
  )
}
