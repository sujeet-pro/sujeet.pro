---
name: sp-validate
description: Run validation and auto-fix common issues
user_invocable: true
---

# Validate Content

## Instructions

1. **Run `bun run validate`** to check all content
2. **Review errors** (missing title, invalid dates, missing tags)
3. **Auto-fix** common issues:
   - Missing title → extract from H1
   - Missing description → extract from first paragraph
   - Missing tags → infer from series membership
   - Missing publishedDate → copy from lastUpdatedOn
4. **Run `bun run check-orphans`** to find unreferenced assets
5. **Report results** to the user
