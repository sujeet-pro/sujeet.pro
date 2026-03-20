import { Fragment, h, } from '../../src/jsx-runtime'

type Props = {
  frontmatter: Record<string, any>
}

function formatDate(val: unknown,): string | null {
  if (!val) return null
  const d = val instanceof Date ? val : new Date(String(val,),)
  if (isNaN(d.getTime(),)) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', },)
}

export function ContentMeta({ frontmatter, }: Props,) {
  const published = formatDate(frontmatter.publishedDate,)
  const updated = formatDate(frontmatter.lastUpdatedOn,)
  const showUpdated = updated && updated !== published
  const readTime = frontmatter.readTime as number | undefined

  const items: string[] = []
  if (published) items.push(`Published on ${published}`,)
  if (showUpdated) items.push(`Last updated on ${updated}`,)
  if (readTime) items.push(`${readTime} min read`,)

  if (items.length === 0 && !frontmatter.draft) return <></>

  return (
    <div class="content-meta">
      {frontmatter.draft ? <span class="content-meta-draft">Draft</span> : null}
      {items.length > 0 ? <span>{items.join(' \u00b7 ',)}</span> : null}
    </div>
  )
}
