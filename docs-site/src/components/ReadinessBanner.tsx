import clsx from 'clsx'

type ReadinessStatus = 'live' | 'partial' | 'planned' | 'testnet'

const statusCopy: Record<ReadinessStatus, { label: string; summary: string; tone: string }> = {
  live: {
    label: 'Operational',
    summary: 'This page reflects the live product surface.',
    tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
  },
  partial: {
    label: 'Partial',
    summary: 'This area is fielded in part. Live behavior can differ by route, chain, or release.',
    tone: 'border-amber-400/30 bg-amber-500/10 text-amber-100'
  },
  planned: {
    label: 'Planned',
    summary: 'This area is planned. Treat this page as forward guidance until the feature is fielded.',
    tone: 'border-sky-400/30 bg-sky-500/10 text-sky-100'
  },
  testnet: {
    label: 'Testnet active',
    summary: 'This area is active on testnet or devnet only. Do not treat it as mainnet ready.',
    tone: 'border-violet-400/30 bg-violet-500/10 text-violet-100'
  }
}

export default function ReadinessBanner({
  status,
  note
}: {
  status: string
  note?: string
}) {
  if (!Object.hasOwn(statusCopy, status)) {
    return null
  }

  const entry = statusCopy[status as ReadinessStatus]
  if (status === 'live' && !note) {
    return null
  }

  return (
    <div className={clsx('mb-8 rounded-[1.4rem] border px-4 py-4 sm:px-5', entry.tone)}>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.22em]">
        Readiness: {entry.label}
      </div>
      <p className="m-0 text-sm leading-6">
        {note || entry.summary}
      </p>
    </div>
  )
}
