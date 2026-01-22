export interface ConversionConfig {
  slug: string // URL: /tools/convert/{slug}
  fromFormat: string // Display name
  toFormat: string // Display name
  pandocFrom: string // Pandoc format name
  pandocTo: string // Pandoc format name
  title: string
  h1: string
  description: string
  introText: string
  howToSteps: string[]
  faqs: { q: string; a: string }[]
  keywords: string[]
  relatedSlugs: string[]
}

export const conversionConfigs: ConversionConfig[] = [
  {
    slug: "markdown-to-pdf",
    fromFormat: "Markdown",
    toFormat: "PDF",
    pandocFrom: "markdown",
    pandocTo: "pdf",
    title: "Convert Markdown to PDF Online Free | Markdown to PDF Converter",
    h1: "Convert Markdown to PDF Online",
    description:
      "Free online markdown to PDF converter. No sign-up, no watermarks. Convert your markdown files to PDF instantly with full formatting support.",
    introText:
      "Convert your Markdown documents to PDF format with full formatting support. Perfect for creating professional documents, reports, and documentation from your Markdown files.",
    howToSteps: [
      "Paste your Markdown content or upload a .md file",
      'Click "Convert to PDF"',
      "Download your converted PDF document",
    ],
    faqs: [
      {
        q: "Is this markdown to PDF converter free?",
        a: "Yes, completely free with no hidden costs, watermarks, or sign-up required.",
      },
      {
        q: "Do you store my files?",
        a: "No. All conversions happen server-side and files are immediately deleted after conversion.",
      },
      {
        q: "What markdown features are supported?",
        a: "We support full CommonMark syntax including headings, lists, code blocks, tables, links, and images.",
      },
      {
        q: "Is there a file size limit?",
        a: "Yes, files are limited to 1MB of text content for optimal performance.",
      },
    ],
    keywords: ["markdown to pdf", "convert markdown to pdf", "md to pdf online"],
    relatedSlugs: ["markdown-to-docx", "markdown-to-html", "html-to-pdf"],
  },
  {
    slug: "markdown-to-docx",
    fromFormat: "Markdown",
    toFormat: "DOCX",
    pandocFrom: "markdown",
    pandocTo: "docx",
    title: "Convert Markdown to Word (DOCX) Online Free | Markdown to DOCX",
    h1: "Convert Markdown to Word (DOCX)",
    description:
      "Free markdown to Word converter. Transform your .md files to .docx format instantly. No sign-up required.",
    introText:
      "Convert Markdown files to Microsoft Word format (DOCX) with preserved formatting. Ideal for sharing documents with teams or editing in Word.",
    howToSteps: [
      "Paste your Markdown content or upload a file",
      'Click "Convert to DOCX"',
      "Download and open in Microsoft Word or Google Docs",
    ],
    faqs: [
      {
        q: "Can I edit the DOCX file after conversion?",
        a: "Yes! The converted DOCX file is fully editable in Microsoft Word, Google Docs, or any compatible word processor.",
      },
      {
        q: "Are tables and images supported?",
        a: "Yes, markdown tables and linked images are converted to their Word equivalents.",
      },
      {
        q: "Is formatting preserved?",
        a: "Yes, headings, bold, italic, lists, and other formatting are preserved in the Word document.",
      },
    ],
    keywords: ["markdown to word", "markdown to docx", "convert md to word"],
    relatedSlugs: ["markdown-to-pdf", "docx-to-markdown", "markdown-to-html"],
  },
  {
    slug: "markdown-to-html",
    fromFormat: "Markdown",
    toFormat: "HTML",
    pandocFrom: "markdown",
    pandocTo: "html",
    title: "Convert Markdown to HTML Online | Free MD to HTML Converter",
    h1: "Convert Markdown to HTML",
    description:
      "Free markdown to HTML converter. Convert .md files to clean HTML instantly. Perfect for web developers and content creators.",
    introText:
      "Convert Markdown to clean, semantic HTML. Ideal for blog posts, documentation, and web content.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to HTML"',
      "Copy the HTML or download the file",
    ],
    faqs: [
      {
        q: "Is the HTML clean and semantic?",
        a: "Yes, we generate clean, standards-compliant HTML without unnecessary markup.",
      },
      {
        q: "Can I use this HTML on my website?",
        a: "Absolutely! The generated HTML is ready to use in any web project.",
      },
      {
        q: "Does it support code blocks with syntax highlighting?",
        a: "The HTML structure for code blocks is preserved, though you'll need to add your own syntax highlighting CSS.",
      },
    ],
    keywords: ["markdown to html", "md to html", "convert markdown to html online"],
    relatedSlugs: ["html-to-markdown", "markdown-to-pdf", "markdown-to-docx"],
  },
  {
    slug: "html-to-markdown",
    fromFormat: "HTML",
    toFormat: "Markdown",
    pandocFrom: "html",
    pandocTo: "markdown",
    title: "Convert HTML to Markdown Online Free | HTML to MD Converter",
    h1: "Convert HTML to Markdown",
    description:
      "Free HTML to markdown converter. Convert web pages and HTML files to clean markdown format.",
    introText:
      "Convert HTML content to clean Markdown format. Perfect for importing web content into markdown-based systems.",
    howToSteps: ["Paste your HTML content", 'Click "Convert to Markdown"', "Download your markdown file"],
    faqs: [
      {
        q: "Does it work with complex HTML?",
        a: "Yes, we convert headings, paragraphs, lists, tables, links, and images from HTML to markdown.",
      },
      {
        q: "Are styles preserved?",
        a: "Basic formatting like bold, italic, and links are preserved. CSS styling is not converted.",
      },
      {
        q: "Can I convert entire web pages?",
        a: "Yes, though we recommend cleaning the HTML first to remove navigation, ads, and other non-content elements.",
      },
    ],
    keywords: ["html to markdown", "convert html to md", "html to markdown online"],
    relatedSlugs: ["markdown-to-html", "markdown-to-pdf", "markdown-to-docx"],
  },
  {
    slug: "markdown-to-txt",
    fromFormat: "Markdown",
    toFormat: "Plain Text",
    pandocFrom: "markdown",
    pandocTo: "txt",
    title: "Convert Markdown to Plain Text | Strip Markdown Formatting Online",
    h1: "Convert Markdown to Plain Text",
    description:
      "Free markdown to plain text converter. Remove markdown formatting and get clean text. No sign-up required.",
    introText:
      "Strip all markdown formatting and convert to plain text. Useful for extracting content without markup.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to Plain Text"',
      "Copy or download the plain text",
    ],
    faqs: [
      {
        q: "What happens to formatting?",
        a: "All markdown formatting is removed, leaving only the plain text content.",
      },
      {
        q: "Are links preserved?",
        a: "Link text is preserved, but URLs are removed unless they're displayed as part of the text.",
      },
      {
        q: "What about images?",
        a: "Image alt text is preserved, but image references are removed.",
      },
    ],
    keywords: ["markdown to text", "strip markdown", "markdown to plain text"],
    relatedSlugs: ["markdown-to-html", "markdown-to-pdf", "html-to-markdown"],
  },
  {
    slug: "docx-to-markdown",
    fromFormat: "DOCX",
    toFormat: "Markdown",
    pandocFrom: "docx",
    pandocTo: "markdown",
    title: "Convert Word (DOCX) to Markdown Online Free | DOCX to MD Converter",
    h1: "Convert Word (DOCX) to Markdown",
    description: "Free DOCX to markdown converter. Extract content from Word documents to markdown format.",
    introText:
      "Convert Microsoft Word documents to clean Markdown format. Perfect for migrating content to markdown-based systems.",
    howToSteps: [
      "Upload your Word (.docx) file",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        q: "Does it preserve formatting?",
        a: "Basic formatting like headings, bold, italic, lists, and tables are converted to markdown equivalents.",
      },
      {
        q: "What about images?",
        a: "Images are referenced with markdown image syntax, but you'll need to save images separately.",
      },
      {
        q: "Can I convert Google Docs?",
        a: "Export your Google Doc as .docx first, then use this converter.",
      },
    ],
    keywords: ["docx to markdown", "word to markdown", "convert word to md"],
    relatedSlugs: ["markdown-to-docx", "html-to-markdown", "docx-to-html"],
  },
  {
    slug: "html-to-pdf",
    fromFormat: "HTML",
    toFormat: "PDF",
    pandocFrom: "html",
    pandocTo: "pdf",
    title: "Convert HTML to PDF Online Free | Web Page to PDF Converter",
    h1: "Convert HTML to PDF",
    description: "Free HTML to PDF converter. Convert web pages and HTML documents to PDF format instantly.",
    introText:
      "Convert HTML content to PDF format. Ideal for archiving web pages or creating printable versions of web content.",
    howToSteps: ["Paste your HTML content", 'Click "Convert to PDF"', "Download your PDF document"],
    faqs: [
      {
        q: "Are styles preserved?",
        a: "Basic HTML styling is preserved, though complex CSS may not render perfectly.",
      },
      {
        q: "Can I convert a live website?",
        a: "Copy the HTML source code from your browser and paste it here.",
      },
      {
        q: "What about page breaks?",
        a: "The PDF will be generated with automatic page breaks based on content length.",
      },
    ],
    keywords: ["html to pdf", "convert html to pdf", "web page to pdf"],
    relatedSlugs: ["markdown-to-pdf", "html-to-markdown", "html-to-docx"],
  },
  {
    slug: "rst-to-markdown",
    fromFormat: "reStructuredText",
    toFormat: "Markdown",
    pandocFrom: "rst",
    pandocTo: "markdown",
    title: "Convert reStructuredText (RST) to Markdown | RST to MD Converter",
    h1: "Convert reStructuredText to Markdown",
    description:
      "Free RST to markdown converter. Convert Python documentation and RST files to markdown format.",
    introText:
      "Convert reStructuredText to Markdown format. Perfect for migrating Python documentation to markdown-based systems.",
    howToSteps: [
      "Paste your reStructuredText content",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        q: "What is reStructuredText?",
        a: "reStructuredText (RST) is a markup language commonly used in Python documentation and Sphinx.",
      },
      {
        q: "Are directives converted?",
        a: "Common directives are converted to their markdown equivalents where possible.",
      },
      {
        q: "Is this useful for Sphinx docs?",
        a: "Yes, if you're migrating from Sphinx to a markdown-based documentation system.",
      },
    ],
    keywords: ["rst to markdown", "restructuredtext to markdown", "convert rst to md"],
    relatedSlugs: ["markdown-to-rst", "html-to-markdown", "rst-to-html"],
  },
  {
    slug: "markdown-to-epub",
    fromFormat: "Markdown",
    toFormat: "EPUB",
    pandocFrom: "markdown",
    pandocTo: "epub",
    title: "Convert Markdown to EPUB Online | Create eBooks from Markdown",
    h1: "Convert Markdown to EPUB",
    description: "Free markdown to EPUB converter. Create e-books from your markdown content instantly.",
    introText:
      "Convert Markdown documents to EPUB format for e-readers. Perfect for creating e-books from your markdown content.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to EPUB"',
      "Download and open in your e-reader",
    ],
    faqs: [
      {
        q: "What is EPUB?",
        a: "EPUB is a standard e-book format supported by most e-readers like Kindle, Kobo, and Apple Books.",
      },
      {
        q: "Can I add a cover image?",
        a: "This converter creates a basic EPUB. You can add covers and metadata using e-book editing tools.",
      },
      {
        q: "Does it support chapters?",
        a: "Yes, markdown headings are converted to chapter divisions in the EPUB.",
      },
    ],
    keywords: ["markdown to epub", "convert markdown to ebook", "md to epub"],
    relatedSlugs: ["markdown-to-pdf", "markdown-to-html", "markdown-to-docx"],
  },
  {
    slug: "markdown-to-odt",
    fromFormat: "Markdown",
    toFormat: "ODT",
    pandocFrom: "markdown",
    pandocTo: "odt",
    title: "Convert Markdown to ODT Online | Markdown to OpenDocument Format",
    h1: "Convert Markdown to ODT",
    description:
      "Free markdown to ODT converter. Convert markdown to OpenDocument format for LibreOffice and OpenOffice.",
    introText:
      "Convert Markdown to ODT (OpenDocument Text) format. Compatible with LibreOffice Writer, OpenOffice, and other open-source office suites.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to ODT"',
      "Download and open in LibreOffice or OpenOffice",
    ],
    faqs: [
      {
        q: "What is ODT?",
        a: "ODT is the OpenDocument Text format, an open standard used by LibreOffice, OpenOffice, and Google Docs.",
      },
      {
        q: "Can I edit the ODT file?",
        a: "Yes, ODT files are fully editable in LibreOffice Writer, OpenOffice Writer, and compatible applications.",
      },
      {
        q: "Is ODT better than DOCX?",
        a: "ODT is an open standard, while DOCX is Microsoft's format. Both work well for most use cases.",
      },
    ],
    keywords: ["markdown to odt", "markdown to opendocument", "md to odt"],
    relatedSlugs: ["markdown-to-docx", "markdown-to-pdf", "odt-to-markdown"],
  },
  {
    slug: "html-to-txt",
    fromFormat: "HTML",
    toFormat: "Plain Text",
    pandocFrom: "html",
    pandocTo: "txt",
    title: "Convert HTML to Plain Text | Strip HTML Tags Online",
    h1: "Convert HTML to Plain Text",
    description: "Free HTML to text converter. Remove HTML tags and extract plain text content.",
    introText: "Strip HTML tags and convert to plain text. Useful for extracting content from web pages.",
    howToSteps: [
      "Paste your HTML content",
      'Click "Convert to Plain Text"',
      "Copy or download the plain text",
    ],
    faqs: [
      {
        q: "Are line breaks preserved?",
        a: "Yes, paragraph breaks and line breaks in the HTML are preserved in the text output.",
      },
      {
        q: "What happens to links?",
        a: "Link text is preserved, but the URLs are removed.",
      },
      {
        q: "Can I extract text from a website?",
        a: "Yes, copy the HTML source and paste it here to extract just the text content.",
      },
    ],
    keywords: ["html to text", "strip html tags", "html to plain text"],
    relatedSlugs: ["html-to-markdown", "markdown-to-txt", "html-to-pdf"],
  },
  {
    slug: "rst-to-html",
    fromFormat: "reStructuredText",
    toFormat: "HTML",
    pandocFrom: "rst",
    pandocTo: "html",
    title: "Convert reStructuredText (RST) to HTML | RST to HTML Converter",
    h1: "Convert reStructuredText to HTML",
    description: "Free RST to HTML converter. Convert Python documentation and RST files to HTML format.",
    introText: "Convert reStructuredText to HTML. Perfect for rendering Python documentation as web pages.",
    howToSteps: [
      "Paste your reStructuredText content",
      'Click "Convert to HTML"',
      "Copy the HTML or download the file",
    ],
    faqs: [
      {
        q: "Will Sphinx directives work?",
        a: "Common RST directives are converted, though Sphinx-specific extensions may not be fully supported.",
      },
      {
        q: "Is syntax highlighting preserved?",
        a: "Code blocks are converted with proper HTML structure, but you'll need to add CSS for syntax highlighting.",
      },
    ],
    keywords: ["rst to html", "restructuredtext to html", "convert rst to html"],
    relatedSlugs: ["rst-to-markdown", "markdown-to-html", "html-to-markdown"],
  },
  {
    slug: "markdown-to-mediawiki",
    fromFormat: "Markdown",
    toFormat: "MediaWiki",
    pandocFrom: "markdown",
    pandocTo: "mediawiki",
    title: "Convert Markdown to MediaWiki Format | Markdown to Wikipedia Syntax",
    h1: "Convert Markdown to MediaWiki",
    description: "Free markdown to MediaWiki converter. Convert markdown to Wikipedia-style wiki markup.",
    introText:
      "Convert Markdown to MediaWiki format. Useful for contributing to Wikipedia or other MediaWiki-based wikis.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to MediaWiki"',
      "Copy and paste the wiki markup into your wiki",
    ],
    faqs: [
      {
        q: "What is MediaWiki?",
        a: "MediaWiki is the wiki software used by Wikipedia and thousands of other wikis.",
      },
      {
        q: "Can I use this for Wikipedia?",
        a: "Yes, the output is compatible with Wikipedia's markup syntax.",
      },
      {
        q: "Are tables converted?",
        a: "Yes, markdown tables are converted to MediaWiki table syntax.",
      },
    ],
    keywords: ["markdown to mediawiki", "markdown to wikipedia", "convert markdown to wiki"],
    relatedSlugs: ["markdown-to-html", "html-to-markdown", "markdown-to-txt"],
  },
  {
    slug: "html-to-docx",
    fromFormat: "HTML",
    toFormat: "DOCX",
    pandocFrom: "html",
    pandocTo: "docx",
    title: "Convert HTML to Word (DOCX) Online | HTML to DOCX Converter",
    h1: "Convert HTML to Word (DOCX)",
    description: "Free HTML to Word converter. Convert web content to editable Word documents.",
    introText:
      "Convert HTML content to Microsoft Word format. Perfect for saving web content as editable documents.",
    howToSteps: ["Paste your HTML content", 'Click "Convert to DOCX"', "Download and open in Microsoft Word"],
    faqs: [
      {
        q: "Are styles preserved?",
        a: "Basic HTML formatting is converted to Word styles, though complex CSS may not translate perfectly.",
      },
      {
        q: "Can I convert web pages?",
        a: "Yes, copy the HTML source from a web page and convert it to a Word document.",
      },
      {
        q: "Is the DOCX editable?",
        a: "Yes, the converted file is fully editable in Microsoft Word and compatible applications.",
      },
    ],
    keywords: ["html to docx", "html to word", "convert html to word"],
    relatedSlugs: ["html-to-pdf", "docx-to-html", "html-to-markdown"],
  },
  {
    slug: "docx-to-html",
    fromFormat: "DOCX",
    toFormat: "HTML",
    pandocFrom: "docx",
    pandocTo: "html",
    title: "Convert Word (DOCX) to HTML Online | DOCX to HTML Converter",
    h1: "Convert Word (DOCX) to HTML",
    description: "Free DOCX to HTML converter. Convert Word documents to web-ready HTML.",
    introText:
      "Convert Microsoft Word documents to HTML format. Perfect for publishing Word content on the web.",
    howToSteps: [
      "Upload your Word (.docx) file",
      'Click "Convert to HTML"',
      "Copy the HTML or download the file",
    ],
    faqs: [
      {
        q: "Are styles preserved?",
        a: "Yes, Word styles are converted to inline HTML styles.",
      },
      {
        q: "What about images?",
        a: "Images are embedded in the HTML, but you may want to extract and host them separately for web use.",
      },
      {
        q: "Is the HTML clean?",
        a: "The HTML is semantic and relatively clean, though some Word-specific formatting may be verbose.",
      },
    ],
    keywords: ["docx to html", "word to html", "convert word to html"],
    relatedSlugs: ["html-to-docx", "docx-to-markdown", "markdown-to-html"],
  },
  {
    slug: "markdown-to-rst",
    fromFormat: "Markdown",
    toFormat: "reStructuredText",
    pandocFrom: "markdown",
    pandocTo: "rst",
    title: "Convert Markdown to reStructuredText (RST) | Markdown to RST",
    h1: "Convert Markdown to reStructuredText",
    description:
      "Free markdown to RST converter. Convert markdown to reStructuredText for Sphinx documentation.",
    introText:
      "Convert Markdown to reStructuredText (RST). Useful for migrating content to Sphinx documentation systems.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to reStructuredText"',
      "Download your RST file",
    ],
    faqs: [
      {
        q: "What is reStructuredText used for?",
        a: "RST is commonly used in Python documentation and with the Sphinx documentation generator.",
      },
      {
        q: "Will it work with Sphinx?",
        a: "Yes, the converted RST is compatible with Sphinx documentation systems.",
      },
    ],
    keywords: ["markdown to rst", "markdown to restructuredtext", "convert md to rst"],
    relatedSlugs: ["rst-to-markdown", "markdown-to-html", "rst-to-html"],
  },
  {
    slug: "odt-to-markdown",
    fromFormat: "ODT",
    toFormat: "Markdown",
    pandocFrom: "odt",
    pandocTo: "markdown",
    title: "Convert ODT to Markdown Online | OpenDocument to Markdown Converter",
    h1: "Convert ODT to Markdown",
    description:
      "Free ODT to markdown converter. Extract content from OpenDocument files to markdown format.",
    introText:
      "Convert ODT (OpenDocument Text) files to Markdown. Perfect for migrating LibreOffice content to markdown systems.",
    howToSteps: ["Upload your ODT file", 'Click "Convert to Markdown"', "Download your markdown file"],
    faqs: [
      {
        q: "What is ODT?",
        a: "ODT is the OpenDocument Text format used by LibreOffice, OpenOffice, and other open-source office suites.",
      },
      {
        q: "Is formatting preserved?",
        a: "Basic formatting like headings, bold, italic, and lists are converted to markdown syntax.",
      },
    ],
    keywords: ["odt to markdown", "opendocument to markdown", "convert odt to md"],
    relatedSlugs: ["markdown-to-odt", "docx-to-markdown", "html-to-markdown"],
  },
  {
    slug: "textile-to-markdown",
    fromFormat: "Textile",
    toFormat: "Markdown",
    pandocFrom: "textile",
    pandocTo: "markdown",
    title: "Convert Textile to Markdown Online | Textile to MD Converter",
    h1: "Convert Textile to Markdown",
    description: "Free Textile to markdown converter. Migrate from Textile markup to Markdown format.",
    introText:
      "Convert Textile markup to Markdown. Useful for migrating legacy content to markdown-based systems.",
    howToSteps: ["Paste your Textile content", 'Click "Convert to Markdown"', "Download your markdown file"],
    faqs: [
      {
        q: "What is Textile?",
        a: "Textile is a lightweight markup language similar to Markdown, once popular in blogging platforms.",
      },
      {
        q: "Why convert to Markdown?",
        a: "Markdown has become the de facto standard for documentation and content, with wider tool support.",
      },
    ],
    keywords: ["textile to markdown", "convert textile to md", "textile markup converter"],
    relatedSlugs: ["html-to-markdown", "rst-to-markdown", "markdown-to-html"],
  },
  {
    slug: "org-to-markdown",
    fromFormat: "Org Mode",
    toFormat: "Markdown",
    pandocFrom: "org",
    pandocTo: "markdown",
    title: "Convert Org Mode to Markdown Online | Org to Markdown Converter",
    h1: "Convert Org Mode to Markdown",
    description: "Free Org Mode to markdown converter. Convert Emacs Org files to markdown format.",
    introText:
      "Convert Org Mode files to Markdown. Perfect for migrating Emacs Org notes to markdown-based systems.",
    howToSteps: ["Paste your Org Mode content", 'Click "Convert to Markdown"', "Download your markdown file"],
    faqs: [
      {
        q: "What is Org Mode?",
        a: "Org Mode is a powerful markup language and organization system for Emacs.",
      },
      {
        q: "Are TODO items converted?",
        a: "Basic TODO structures are converted, though advanced Org features may not have markdown equivalents.",
      },
      {
        q: "What about tables?",
        a: "Yes, Org tables are converted to markdown table syntax.",
      },
    ],
    keywords: ["org to markdown", "org mode to markdown", "convert org to md"],
    relatedSlugs: ["markdown-to-html", "rst-to-markdown", "html-to-markdown"],
  },
]
