import { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import clsx from 'clsx'
import { parseFaqMarkdown } from '../lib/faq'

type Props = {
  markdown: string
}

export default function FaqContent({ markdown }: Props) {
  const parsed = useMemo(() => parseFaqMarkdown(markdown), [markdown])

  // Accordion behavior: one open question per category.
  const [openByCategory, setOpenByCategory] = useState<Record<string, string | null>>({})

  return (
    <div className="space-y-10">
      {parsed.introMarkdown && (
        <div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node, ...props }) => <p className="leading-7 text-mb-text/95 my-4" {...props} />,
              ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-4 space-y-2" {...props} />,
              ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-4 space-y-2" {...props} />,
              a: ({ node, ...props }) => (
                <a className="text-mb-gold hover:text-mb-gold/90" target="_blank" rel="noreferrer" {...props} />
              )
            }}
          >
            {parsed.introMarkdown}
          </ReactMarkdown>
        </div>
      )}

      {parsed.categories.map(category => {
        const openId = openByCategory[category.id] ?? null
        return (
          <section key={category.id} id={category.id} className="scroll-mt-24">
            <div className="mb-4">
              <h2 className="text-2xl font-semibold text-mb-text">{category.title}</h2>
              {category.prefaceMarkdown && (
                <div className="mt-2 text-mb-muted">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      p: ({ node, ...props }) => <p className="leading-7 my-2" {...props} />,
                      a: ({ node, ...props }) => (
                        <a className="text-mb-gold hover:text-mb-gold/90" target="_blank" rel="noreferrer" {...props} />
                      )
                    }}
                  >
                    {category.prefaceMarkdown}
                  </ReactMarkdown>
                </div>
              )}
            </div>

            <div className="space-y-3">
              {category.items.map(item => {
                const isOpen = openId === item.id
                return (
                  <div
                    key={item.id}
                    id={item.id}
                    className={clsx(
                      'rounded-2xl border bg-mb-panel/60',
                      isOpen ? 'border-mb-gold/50 shadow-glow' : 'border-mb-border'
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenByCategory(prev => ({
                          ...prev,
                          [category.id]: prev[category.id] === item.id ? null : item.id
                        }))
                      }
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="font-semibold text-mb-text">{item.question}</span>
                      <span
                        className={clsx(
                          'shrink-0 h-8 w-8 rounded-xl grid place-items-center border',
                          isOpen
                            ? 'border-mb-gold/50 bg-mb-panel2 text-mb-gold'
                            : 'border-mb-border bg-mb-panel2 text-mb-muted'
                        )}
                        aria-hidden
                      >
                        {isOpen ? '–' : '+'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 pt-0 text-mb-text/95">
                        <div className="border-t border-mb-border pt-4">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }) => <p className="leading-7 my-3" {...props} />,
                              ul: ({ node, ...props }) => <ul className="list-disc pl-6 my-3 space-y-2" {...props} />,
                              ol: ({ node, ...props }) => <ol className="list-decimal pl-6 my-3 space-y-2" {...props} />,
                              a: ({ node, ...props }) => (
                                <a
                                  className="text-mb-gold hover:text-mb-gold/90"
                                  target="_blank"
                                  rel="noreferrer"
                                  {...props}
                                />
                              )
                            }}
                          >
                            {item.answerMarkdown}
                          </ReactMarkdown>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
