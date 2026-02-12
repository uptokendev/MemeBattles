export type FaqItem = {
  question: string
  id: string
  answerMarkdown: string
}

export type FaqCategory = {
  title: string
  id: string
  prefaceMarkdown?: string
  items: FaqItem[]
}

export type FaqParsed = {
  introMarkdown: string
  categories: FaqCategory[]
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

/**
 * Parses FAQ markdown with this structure:
 * - Intro text (optional)
 * - ## Category
 *   - ### Question
 *     Answer...
 */
export function parseFaqMarkdown(markdown: string): FaqParsed {
  const lines = (markdown ?? '').split('\n')
  const intro: string[] = []
  const categories: FaqCategory[] = []

  let currentCategory: FaqCategory | null = null
  let currentQuestion: { q: string; a: string[] } | null = null
  let categoryPreface: string[] = []

  const flushQuestion = () => {
    if (!currentCategory || !currentQuestion) return
    const question = currentQuestion.q.trim()
    const answerMarkdown = currentQuestion.a.join('\n').trim()
    if (!question) return
    currentCategory.items.push({ question, id: `${currentCategory.id}-${slugify(question)}`, answerMarkdown })
    currentQuestion = null
  }

  const flushCategory = () => {
    if (!currentCategory) return
    flushQuestion()
    const preface = categoryPreface.join('\n').trim()
    if (preface) currentCategory.prefaceMarkdown = preface
    categoryPreface = []
    if (currentCategory.items.length > 0) categories.push(currentCategory)
    currentCategory = null
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    const cat = /^##\s+(.+)$/.exec(line.trim())
    if (cat) {
      flushCategory()
      const title = cat[1].trim()
      currentCategory = { title, id: slugify(title), items: [] }
      categoryPreface = []
      continue
    }

    const q = /^###\s+(.+)$/.exec(line.trim())
    if (q) {
      if (!currentCategory) {
        // If someone forgets a category, create a default one.
        currentCategory = { title: 'General', id: 'general', items: [] }
      }
      flushQuestion()
      // Capture any category preface text that appears before the first question.
      const preface = categoryPreface.join('\n').trim()
      if (preface && !currentCategory.prefaceMarkdown) currentCategory.prefaceMarkdown = preface
      categoryPreface = []
      currentQuestion = { q: q[1].trim(), a: [] }
      continue
    }

    // Content lines
    if (!currentCategory) {
      intro.push(line)
    } else if (currentQuestion) {
      currentQuestion.a.push(line)
    } else {
      categoryPreface.push(line)
    }
  }

  flushCategory()

  return {
    introMarkdown: intro.join('\n').trim(),
    categories
  }
}

export function buildFaqToc(parsed: FaqParsed) {
  const headings: { depth: number; text: string; id: string }[] = []
  for (const cat of parsed.categories) {
    headings.push({ depth: 2, text: cat.title, id: cat.id })
    for (const item of cat.items) {
      headings.push({ depth: 3, text: item.question, id: item.id })
    }
  }
  return headings
}
