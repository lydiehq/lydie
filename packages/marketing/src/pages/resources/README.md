# Resource Hub Implementation

This implementation creates a dynamic resource hub using the Lydie API. It supports pillar pages with child articles and custom components.

## Architecture

### API Changes

- **New endpoint**: `GET /api/v1/{organizationId}/documents/:slug/children`
  - Returns all published child documents of a given parent document
  - Used to build the "Related Articles" sections on pillar pages

### Marketing Site Routes

1. **`/resources`** - Main resources index page
   - Lists all pillar pages (hardcoded for now)

2. **`/resources/[pillar]/index.astro`** - Pillar page
   - Dynamic route that fetches content from Lydie
   - Displays the pillar content + grid of child articles
   - Maps URL slugs to Lydie document slugs via `pillarSlugMap`

3. **`/resources/[pillar]/[article].astro`** - Child article page
   - Dynamic route for individual articles
   - Supports table of contents and related documents

### Custom Components

Custom components are defined in Lydie and rendered on the marketing site. Available components:

#### 1. Link Grid (`link-grid`)

A grid of link cards with icons, titles, and descriptions.

**Properties:**

- `links` (array of objects):
  - `title` (string): Link title
  - `href` (string): URL
  - `icon` (string, optional): Emoji or icon character
  - `description` (string, optional): Short description

**Usage in Lydie:**

1. Create a component named "link-grid"
2. Add a property "links" of type "List of Objects"
3. Add fields: title (text), href (text), icon (text), description (text)

#### 2. Comparison Grid (`comparison-grid`)

A grid for comparing items side by side.

**Properties:**

- `items` (array of objects):
  - `label` (string): Item label
  - `description` (string): Item description
  - `icon` (string, optional): Emoji or icon
- `columns` (number): Number of columns (2 or 3)

#### 3. Visual Framework (`visual-framework`)

A highlighted content box with gradient background.

**Properties:**

- `title` (string): Section title
- `description` (string): Section description
- `content` (string): Main content

#### 4. Flow Steps (`flow-steps`)

A horizontal or vertical step-by-step flow.

**Properties:**

- `steps` (array of objects):
  - `title` (string): Step title
  - `description` (string): Step description
- `direction` (string): "horizontal" or "vertical"

### Content Flow

1. **Create content in Lydie:**
   - Create a "Resource Hub" parent page (not rendered, just for organization)
   - Create pillar pages as children (e.g., "knowledge-base", "note-taking")
   - Create child articles under each pillar

2. **Configure slugs:**
   - Update `pillarSlugMap` in `[pillar]/index.astro` to map URL slugs to Lydie document slugs
   - Example: `"knowledge-bases"` (URL) → `"knowledge-base"` (Lydie slug)

3. **Add custom components:**
   - Create components in Lydie settings
   - Insert them in your documents
   - The marketing site will render them using the custom component handlers

### Adding New Pillars

1. Create the pillar document in Lydie with child articles
2. Add the pillar to the `pillars` array in `/resources/index.astro`
3. Add a slug mapping in `pillarSlugMap` if the URL slug differs from the Lydie slug

### Caching Strategy

All pages use ISR-like caching:

- `max-age=3600` (1 hour) - Browser cache
- `s-maxage=3600` (1 hour) - CDN cache
- `stale-while-revalidate=86400` (24 hours) - Serve stale while revalidating

This ensures fast page loads while keeping content reasonably fresh.

### Files Modified

1. **`packages/backend/src/api/external/index.ts`**
   - Added `/documents/:slug/children` endpoint

2. **`packages/core/src/content.ts`**
   - Added `getDocumentChildren()` method to `LydieClient`

3. **`packages/marketing/src/utils/content-renderer.ts`**
   - Updated to support custom component renderers

4. **`packages/marketing/src/utils/custom-components.ts`** (new)
   - Custom component HTML renderers

5. **`packages/marketing/src/pages/resources/`** (new)
   - Dynamic Astro pages for the resource hub

### Future Improvements

1. **Dynamic pillar discovery**: Instead of hardcoding pillars, fetch them from Lydie
2. **Component registry**: Make custom components discoverable/configurable
3. **SEO metadata**: Pull meta descriptions, OG images from Lydie custom fields
4. **Search**: Add search functionality across all resource content
5. **Tag filtering**: Support filtering articles by tags/categories
