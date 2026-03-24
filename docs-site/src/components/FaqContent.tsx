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
  const [openByCategory, setOpenByCategory] = useState<Record<string, string | null>>({})

  return (
    <div className="space-y-10">
      {parsed.introMarkdown && (
        <div>
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ node, ...props }) => <p className="my-4 leading-7 text-mb-text/95" {...props} />,
              ul: ({ node, ...props }) => <ul className="my-4 list-disc space-y-2 pl-6" {...props} />,
              ol: ({ node, ...props }) => <ol className="my-4 list-decimal space-y-2 pl-6" {...props} />,
              a: ({ node, ...props }) => (
                <a className="text-mb-accent2 hover:text-mb-accent2/95" target="_blank" rel="noreferrer" {...props} />
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
                      p: ({ node, ...props }) => <p className="my-2 leading-7" {...props} />,
                      a: ({ node, ...props }) => (
                        <a className="text-mb-accent2 hover:text-mb-accent2/95" target="_blank" rel="noreferrer" {...props} />
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
                      'rounded-[1.35rem] border bg-mb-panel/60 transition-all',
                      isOpen ? 'border-mb-accent/50 shadow-glow' : 'border-mb-border/70'
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
                      className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={isOpen}
                    >
                      <span className="font-semibold text-mb-text">{item.question}</span>
                      <span
                        className={clsx(
                          'grid h-8 w-8 shrink-0 place-items-center rounded-xl border transition-colors',
                          isOpen
                            ? 'border-mb-accent/50 bg-[rgba(240,106,26,0.12)] text-mb-accent2'
                            : 'border-mb-border/70 bg-mb-panel2/70 text-mb-muted'
                        )}
                        aria-hidden
                      >
                        {isOpen ? '–' : '+'}
                      </span>
                    </button>

                    {isOpen && (
                      <div className="px-5 pb-5 pt-0 text-mb-text/95">
                        <div className="border-t border-mb-border/40 pt-4">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ node, ...props }) => <p className="my-3 leading-7" {...props} />,
                              ul: ({ node, ...props }) => <ul className="my-3 list-disc space-y-2 pl-6" {...props} />,
                              ol: ({ node, ...props }) => <ol className="my-3 list-decimal space-y-2 pl-6" {...props} />,
                              a: ({ node, ...props }) => (
                                <a className="text-mb-accent2 hover:text-mb-accent2/95" target="_blank" rel="noreferrer" {...props} />
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
