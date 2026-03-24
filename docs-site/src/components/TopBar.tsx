import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import { siteConfig } from '../content/siteConfig'

export default function TopBar() {
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()

  const pageTitle = useMemo(() => {
    const p = loc.pathname.replace(/^\//, '')
    if (!p) return 'Docs'
    return p.split('/').slice(-1)[0].replace(/-/g, ' ')
  }, [loc.pathname])

  return (
    <div className="mb-topbar sticky top-0 z-40 border-b border-mb-border/60 backdrop-blur-xl">
      <div className="mb-topbar__inner mx-auto flex max-w-[1440px] items-center gap-3 px-4 sm:px-5 lg:px-6">
        <button
          className="mb-outline-button inline-flex h-10 w-10 items-center justify-center rounded-2xl lg:hidden"
          onClick={() => setOpen(v => !v)}
          aria-label="Toggle navigation"
        >
          <span className="text-mb-accent text-lg">☰</span>
        </button>

        <button onClick={() => nav('/introduction')} className="inline-flex items-center gap-3 text-left">
          <div className="mb-logo-wrap grid place-items-center overflow-hidden rounded-2xl border border-mb-border/60 bg-mb-panel/90 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.95)]">
            <img src="/logo.png" alt="MemeWarzone" className="mb-logo object-contain" loading="eager" decoding="async" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-mb-text sm:text-base">{siteConfig.title}</div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-mb-muted sm:text-xs">{pageTitle}</div>
          </div>
        </button>

        <div className="ml-auto flex items-center gap-2">
          <a className="mb-topbar__cta hidden sm:inline-flex" href={siteConfig.mainSiteUrl} target="_blank" rel="noreferrer">
            Return to Launchpad
          </a>
        </div>
      </div>

      {open && (
        <div className="border-t border-mb-border/60 bg-mb-bg/96 lg:hidden">
          <div className="px-4 py-4 sm:px-5">
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
