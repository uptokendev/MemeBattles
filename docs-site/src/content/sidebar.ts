import manifest from './page-manifest.json'

export type NavItem = { title: string; href: string }
export type NavSection = { title: string; items: NavItem[] }

export type PageManifestEntry = {
  route: string
  title: string
  group: string
  groupOrder: number
  pageOrder: number
  status: string
  source: string
  aliases: string[]
}

type PageManifest = {
  pages: PageManifestEntry[]
}

export const pageManifest = manifest as PageManifest

function sortPages(a: PageManifestEntry, b: PageManifestEntry) {
  if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder
  if (a.pageOrder !== b.pageOrder) return a.pageOrder - b.pageOrder
  return a.title.localeCompare(b.title)
}

export const canonicalPages = [...pageManifest.pages].sort(sortPages)

export const sidebar: NavSection[] = canonicalPages.reduce<NavSection[]>((sections, page) => {
  const section = sections.find((entry) => entry.title === page.group)

  if (section) {
    section.items.push({ title: page.title, href: page.route })
    return sections
  }

  sections.push({
    title: page.group,
    items: [{ title: page.title, href: page.route }]
  })

  return sections
}, [])

export const flatNav: NavItem[] = canonicalPages.map((page) => ({
  title: page.title,
  href: page.route
}))

export const routeAliases = canonicalPages.reduce<Record<string, string>>((aliases, page) => {
  for (const alias of page.aliases) {
    aliases[alias] = page.route
  }

  return aliases
}, {})
