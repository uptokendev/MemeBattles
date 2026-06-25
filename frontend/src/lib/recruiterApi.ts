export type RecruiterRole = 'creator' | 'trader'

export type Recruiter = {
  id: string | number
  wallet: string
  code: string
  displayName: string | null
  status: string
  source: string
  createdAt: string | null
  updatedAt: string | null
}

export type RecruiterSquad = {
  total: number
  active: number
  creators: number
  traders: number
  pending: number
  inactiveLinks: number
}

const rawBase = String(import.meta.env.VITE_API_BASE_URL ?? '').trim()
const API_BASE = rawBase.replace(/\/$/, '')

function buildUrl(pathWithQuery: string): string {
  if (API_BASE && /^https?:\/\//i.test(API_BASE)) {
    return `${API_BASE}${pathWithQuery.startsWith('/') ? pathWithQuery : `/${pathWithQuery}`}`
  }
  return new URL(pathWithQuery, window.location.origin).toString()
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function normalizeWallet(wallet: string): string {
  return String(wallet ?? '').trim().toLowerCase()
}

export function normalizeRecruiterCode(code: string): string {
  return String(code ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

export async function fetchRecruiterByCode(code: string): Promise<{ recruiter: Recruiter; squad: RecruiterSquad; inviteUrl: string }> {
  const url = buildUrl(`/api/recruiter?code=${encodeURIComponent(normalizeRecruiterCode(code))}`)
  const res = await fetch(url, { method: 'GET', cache: 'no-store' })
  const json = await readJson(res)
  if (!res.ok) throw new Error(json?.error || `Recruiter lookup failed (${res.status})`)
  return { recruiter: json.recruiter, squad: json.squad, inviteUrl: json.inviteUrl }
}

export async function fetchRecruiterByWallet(wallet: string): Promise<{ recruiter: Recruiter; squad: RecruiterSquad; inviteUrl: string }> {
  const url = buildUrl(`/api/recruiter?wallet=${encodeURIComponent(normalizeWallet(wallet))}`)
  const res = await fetch(url, { method: 'GET', cache: 'no-store' })
  const json = await readJson(res)
  if (!res.ok) throw new Error(json?.error || `Recruiter lookup failed (${res.status})`)
  return { recruiter: json.recruiter, squad: json.squad, inviteUrl: json.inviteUrl }
}

export async function signupRecruiter(input: { wallet: string; code: string; displayName?: string | null }): Promise<{ recruiter: Recruiter; redirectTo: string }> {
  const res = await fetch(buildUrl('/api/recruiter-signup'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: normalizeWallet(input.wallet),
      code: normalizeRecruiterCode(input.code),
      displayName: input.displayName ?? null,
    }),
  })
  const json = await readJson(res)
  if (!res.ok) throw new Error(json?.error || `Recruiter signup failed (${res.status})`)
  return { recruiter: json.recruiter, redirectTo: json.redirectTo }
}

export async function syncRecruiterAttribution(input: { wallet: string; recruiterCode: string; memberRole?: RecruiterRole | null }) {
  const res = await fetch(buildUrl('/api/recruiter-attribution'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      wallet: normalizeWallet(input.wallet),
      recruiterCode: normalizeRecruiterCode(input.recruiterCode),
      memberRole: input.memberRole ?? null,
    }),
  })
  const json = await readJson(res)
  if (!res.ok && !json?.needsRoleSelection) {
    throw new Error(json?.error || json?.reason || `Attribution failed (${res.status})`)
  }
  return json
}
