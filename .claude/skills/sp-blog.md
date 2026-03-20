---
name: sp-blog
description: Create or update a blog post (auto-ordered by publishedDate)
user_invocable: true
---

# Create/Update Blog Post

## Instructions

1. **Create directory:** `content/blogs/<slug>/`
2. **Create README.md** with frontmatter (title, description, publishedDate, lastUpdatedOn, tags)
3. **Write content** — blogs are shorter-form, more personal/exploratory than articles
4. **Run `bun run build`** to verify

Blog posts are automatically ordered by `publishedDate` (newest first) on the listing page. No series assignment needed.
