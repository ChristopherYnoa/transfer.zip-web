import path from 'path'
import fs from 'fs/promises'
import { globby } from 'globby'
import matter from 'gray-matter'
import { compileMDX } from 'next-mdx-remote/rsc'
import remarkGfm from 'remark-gfm'
import { mdxComponents } from '@/mdx-components'

const MINOR_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with',
])

export function slugToTitle(slug) {
  const segment = slug.split('/').pop() || ''
  return segment
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i > 0 && MINOR_WORDS.has(lower)) return lower
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

function extractHeadings(markdown) {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm
  const headings = []
  let match

  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length
    const title = match[2].trim()
    const id = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
    headings.push({ level, title, id })
  }

  return headings
}

function getContentDir() {
  return path.join(process.cwd(), 'src/content')
}

export async function getAllSlugs() {
  const files = await globby(['**/*.mdx'], { cwd: getContentDir() })
  return files.map(f => f.replace(/\.mdx$/, ''))
}

export async function getAllVirtualSlugs() {
  const slugs = await getAllSlugs()
  const existing = new Set(slugs)
  const virtual = new Set()
  for (const slug of slugs) {
    const segments = slug.split('/')
    for (let i = 1; i < segments.length; i++) {
      const partial = segments.slice(0, i).join('/')
      if (!existing.has(partial)) virtual.add(partial)
    }
  }
  return [...virtual]
}

async function readContentFile(slug) {
  const filePath = path.join(getContentDir(), `${slug}.mdx`)
  const raw = await fs.readFile(filePath, 'utf-8')
  return matter(raw)
}

export async function getContentMeta(slug) {
  try {
    const { data } = await readContentFile(slug)
    return data
  } catch {
    return null
  }
}

export async function getContentBySlug(slug) {
  try {
    const { data, content } = await readContentFile(slug)
    const toc = extractHeadings(content)
    const { content: MDXContent } = await compileMDX({
      source: content,
      components: mdxComponents(),
      options: {
        mdxOptions: {
          remarkPlugins: [remarkGfm],
        },
      },
    })
    return { meta: data, content: MDXContent, toc }
  } catch {
    return null
  }
}

export async function getChildrenBySlug(parentSlug) {
  const allSlugs = await getAllSlugs()
  const prefix = parentSlug ? `${parentSlug}/` : ''

  // Find all slugs that are children of the parent
  const childSlugs = allSlugs.filter(slug => {
    if (!parentSlug) return true // Root level gets all
    return slug.startsWith(prefix) && slug !== parentSlug
  })

  // Get metadata for each child
  const children = await Promise.all(
    childSlugs.map(async (slug) => {
      const meta = await getContentMeta(slug)
      if (!meta) return null

      // Calculate depth relative to parent
      const relativePath = parentSlug ? slug.slice(prefix.length) : slug
      const depth = relativePath.split('/').length
      const segments = relativePath.split('/')
      const directParent = segments.length > 1
        ? prefix + segments.slice(0, -1).join('/')
        : parentSlug

      return {
        slug,
        href: `/${slug}`,
        title: meta.title,
        description: meta.description?.replace(/<[^>]*>/g, ''), // Strip HTML
        imgSrc: meta.imgSrc,
        depth,
        directParent,
        isDirectChild: depth === 1
      }
    })
  )

  // Filter out nulls and organize hierarchically
  const validChildren = children.filter(Boolean)

  // Group by direct children and their sub-children
  const directChildren = validChildren.filter(c => c.isDirectChild)
  const organized = directChildren.map(parent => ({
    ...parent,
    children: validChildren.filter(c =>
      c.directParent === parent.slug ||
      c.slug.startsWith(parent.slug + '/')
    ).filter(c => c.slug !== parent.slug)
  }))

  // Also include orphaned children (those without a direct parent mdx file)
  const orphanedParents = new Set()
  validChildren.forEach(c => {
    if (!c.isDirectChild) {
      const firstSegment = (parentSlug ? c.slug.slice(prefix.length) : c.slug).split('/')[0]
      const potentialParent = parentSlug ? `${parentSlug}/${firstSegment}` : firstSegment
      if (!directChildren.find(d => d.slug === potentialParent)) {
        orphanedParents.add(potentialParent)
      }
    }
  })

  // Create virtual parents for orphaned groups
  orphanedParents.forEach(parentPath => {
    const segments = parentPath.split('/')
    const title = segments[segments.length - 1]
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())

    organized.push({
      slug: parentPath,
      href: `/${parentPath}`,
      title: `${title}`,
      description: null,
      isVirtual: true,
      isDirectChild: true,
      children: validChildren.filter(c =>
        c.slug.startsWith(parentPath + '/')
      )
    })
  })

  return organized
}
