import { useMemo } from 'react'
import { useLocation, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import matter from 'gray-matter'
import Toc from './Toc'
import PrevNext from './PrevNext'
import { getPageByPath, normalizePath } from '../content/loader'

export default function DocPage() {
  const loc = useLocation()
  const path = useMemo(() => normalizePath(loc.pathname), [loc.pathname])

  const raw = useMemo(() => getPageByPath(path), [path])
  const { data, content } = useMemo(() => matter(raw ?? ''), [raw])

  const title = (data.title as string) || 'Not found'
  const description = (data.description as string) || ''
  const toc = useMemo(() => {
    if (!raw) return []
    const lines = content.split('\n')
    const headings: { depth: number; text: string; id: string }[] = []
    for (const line of lines) {
      const m = /^(#{2,3})\s+(.+)$/.exec(line.trim())
      if (!m) continue
      const depth = m[1].length
      const text = m[2].trim()
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
      headings.push({ depth, text, id })
    }
    return headings
  }, [raw, content])

  if (!raw) {
    return (
      <div className="rounded-2xl border border-mb-border bg-mb-panel/70 p-8">
        <h1 className="text-2xl font-bold mb-2">Page not found</h1>
        <p className="text-mb-muted mb-6">
          The route <code>{path}</code> does not exist yet.
        </p>
        <Link
          to="/getting-started"
          className="inline-flex px-4 py-2 rounded-xl border border-mb-border bg-mb-panel2 hover:shadow-glow"
        >
          Go to Getting Started
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_260px] gap-8">
      <article className="min-w-0">
        <div className="rounded-2xl border border-mb-border bg-mb-panel/70 p-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-mb-text">{title}</h1>
            {description && <p className="text-mb-muted mt-2">{description}</p>}
          </div>

          <div className="prose-mb text-mb-text">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h2: ({ node, ...props }) => {
                  const text = String(props.children)
                  const id = text
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                  return <h2 id={id} className="text-2xl font-semibold mt-10 mb-4" {...props} />
                },
                h3: ({ node, ...props }) => {
                  const text = String(props.children)
                  const id = text
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                  return <h3 id={id} className="text-xl font-semibold mt-8 mb-3" {...props} />
                },
                p: ({ node, ...props }) => <p className="leading-7 text-mb-text/95 my-4" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-4 space-y-2" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-4 space-y-2" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-2 border-mb-gold/60 pl-4 my-5 text-mb-muted"
                    {...props}
                  />
                ),
                a: ({ node, ...props }) => (
                  <a className="text-mb-gold hover:text-mb-gold/90" target="_blank" rel="noreferrer" {...props} />
                ),
                code: ({ node, inline, className, children, ...props }) => {
                  if (inline) {
                    return (
                      <code className="text-mb-text" {...props}>
                        {children}
                      </code>
                    )
                  }
                  return (
                    <pre className="my-5">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  )
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>

          <div className="mt-10 pt-6 border-t border-mb-border">
            <PrevNext currentPath={path} />
          </div>
        </div>
      </article>

      <aside className="hidden xl:block sticky top-20 h-[calc(100vh-96px)]">
        <div className="rounded-2xl border border-mb-border bg-mb-panel/70 p-4">
          <div className="text-xs uppercase tracking-wider text-mb-muted mb-3">On this page</div>
          <Toc items={toc} />
        </div>
      </aside>
    </div>
  )
}
