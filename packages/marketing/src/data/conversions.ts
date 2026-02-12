export interface ConversionConfig {
  slug: string; // URL: /tools/convert/{slug}
  fromFormat: string; // Display name
  toFormat: string; // Display name
  pandocFrom: string; // Pandoc format name
  pandocTo: string; // Pandoc format name
  title: string;
  h1: string;
  description: string;
  introText: string;
  howToSteps: string[];
  faqs: { question: string; answer: string }[];
  keywords: string[];
  relatedSlugs: string[];
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
        question: "Is this markdown to PDF converter free?",
        answer: "Yes, completely free with no hidden costs, watermarks, or sign-up required.",
      },
      {
        question: "Do you store my files?",
        answer: "No. All conversions happen server-side and files are immediately deleted after conversion.",
      },
      {
        question: "What markdown features are supported?",
        answer: "We support full CommonMark syntax including headings, lists, code blocks, tables, links, and images.",
      },
      {
        question: "Is there a file size limit?",
        answer: "Yes, files are limited to 1MB of text content for optimal performance.",
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
        question: "Can I edit the DOCX file after conversion?",
        answer: "Yes! The converted DOCX file is fully editable in Microsoft Word, Google Docs, or any compatible word processor.",
      },
      {
        question: "Are tables and images supported?",
        answer: "Yes, markdown tables and linked images are converted to their Word equivalents.",
      },
      {
        question: "Is formatting preserved?",
        answer: "Yes, headings, bold, italic, lists, and other formatting are preserved in the Word document.",
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
        question: "Is the HTML clean and semantic?",
        answer: "Yes, we generate clean, standards-compliant HTML without unnecessary markup.",
      },
      {
        question: "Can I use this HTML on my website?",
        answer: "Absolutely! The generated HTML is ready to use in any web project.",
      },
      {
        question: "Does it support code blocks with syntax highlighting?",
        answer: "The HTML structure for code blocks is preserved, though you'll need to add your own syntax highlighting CSS.",
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
    howToSteps: [
      "Paste your HTML content",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        question: "Does it work with complex HTML?",
        answer: "Yes, we convert headings, paragraphs, lists, tables, links, and images from HTML to markdown.",
      },
      {
        question: "Are styles preserved?",
        answer: "Basic formatting like bold, italic, and links are preserved. CSS styling is not converted.",
      },
      {
        question: "Can I convert entire web pages?",
        answer: "Yes, though we recommend cleaning the HTML first to remove navigation, ads, and other non-content elements.",
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
        question: "What happens to formatting?",
        answer: "All markdown formatting is removed, leaving only the plain text content.",
      },
      {
        question: "Are links preserved?",
        answer: "Link text is preserved, but URLs are removed unless they're displayed as part of the text.",
      },
      {
        question: "What about images?",
        answer: "Image alt text is preserved, but image references are removed.",
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
    description:
      "Free DOCX to markdown converter. Extract content from Word documents to markdown format.",
    introText:
      "Convert Microsoft Word documents to clean Markdown format. Perfect for migrating content to markdown-based systems.",
    howToSteps: [
      "Upload your Word (.docx) file",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        question: "Does it preserve formatting?",
        answer: "Basic formatting like headings, bold, italic, lists, and tables are converted to markdown equivalents.",
      },
      {
        question: "What about images?",
        answer: "Images are referenced with markdown image syntax, but you'll need to save images separately.",
      },
      {
        question: "Can I convert Google Docs?",
        answer: "Export your Google Doc as .docx first, then use this converter.",
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
    description:
      "Free HTML to PDF converter. Convert web pages and HTML documents to PDF format instantly.",
    introText:
      "Convert HTML content to PDF format. Ideal for archiving web pages or creating printable versions of web content.",
    howToSteps: ["Paste your HTML content", 'Click "Convert to PDF"', "Download your PDF document"],
    faqs: [
      {
        question: "Are styles preserved?",
        answer: "Basic HTML styling is preserved, though complex CSS may not render perfectly.",
      },
      {
        question: "Can I convert a live website?",
        answer: "Copy the HTML source code from your browser and paste it here.",
      },
      {
        question: "What about page breaks?",
        answer: "The PDF will be generated with automatic page breaks based on content length.",
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
        question: "What is reStructuredText?",
        answer: "reStructuredText (RST) is a markup language commonly used in Python documentation and Sphinx.",
      },
      {
        question: "Are directives converted?",
        answer: "Common directives are converted to their markdown equivalents where possible.",
      },
      {
        question: "Is this useful for Sphinx docs?",
        answer: "Yes, if you're migrating from Sphinx to a markdown-based documentation system.",
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
    description:
      "Free markdown to EPUB converter. Create e-books from your markdown content instantly.",
    introText:
      "Convert Markdown documents to EPUB format for e-readers. Perfect for creating e-books from your markdown content.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to EPUB"',
      "Download and open in your e-reader",
    ],
    faqs: [
      {
        question: "What is EPUB?",
        answer: "EPUB is a standard e-book format supported by most e-readers like Kindle, Kobo, and Apple Books.",
      },
      {
        question: "Can I add a cover image?",
        answer: "This converter creates a basic EPUB. You can add covers and metadata using e-book editing tools.",
      },
      {
        question: "Does it support chapters?",
        answer: "Yes, markdown headings are converted to chapter divisions in the EPUB.",
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
        question: "What is ODT?",
        answer: "ODT is the OpenDocument Text format, an open standard used by LibreOffice, OpenOffice, and Google Docs.",
      },
      {
        question: "Can I edit the ODT file?",
        answer: "Yes, ODT files are fully editable in LibreOffice Writer, OpenOffice Writer, and compatible applications.",
      },
      {
        question: "Is ODT better than DOCX?",
        answer: "ODT is an open standard, while DOCX is Microsoft's format. Both work well for most use cases.",
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
    introText:
      "Strip HTML tags and convert to plain text. Useful for extracting content from web pages.",
    howToSteps: [
      "Paste your HTML content",
      'Click "Convert to Plain Text"',
      "Copy or download the plain text",
    ],
    faqs: [
      {
        question: "Are line breaks preserved?",
        answer: "Yes, paragraph breaks and line breaks in the HTML are preserved in the text output.",
      },
      {
        question: "What happens to links?",
        answer: "Link text is preserved, but the URLs are removed.",
      },
      {
        question: "Can I extract text from a website?",
        answer: "Yes, copy the HTML source and paste it here to extract just the text content.",
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
    description:
      "Free RST to HTML converter. Convert Python documentation and RST files to HTML format.",
    introText:
      "Convert reStructuredText to HTML. Perfect for rendering Python documentation as web pages.",
    howToSteps: [
      "Paste your reStructuredText content",
      'Click "Convert to HTML"',
      "Copy the HTML or download the file",
    ],
    faqs: [
      {
        question: "Will Sphinx directives work?",
        answer: "Common RST directives are converted, though Sphinx-specific extensions may not be fully supported.",
      },
      {
        question: "Is syntax highlighting preserved?",
        answer: "Code blocks are converted with proper HTML structure, but you'll need to add CSS for syntax highlighting.",
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
    description:
      "Free markdown to MediaWiki converter. Convert markdown to Wikipedia-style wiki markup.",
    introText:
      "Convert Markdown to MediaWiki format. Useful for contributing to Wikipedia or other MediaWiki-based wikis.",
    howToSteps: [
      "Paste your Markdown content",
      'Click "Convert to MediaWiki"',
      "Copy and paste the wiki markup into your wiki",
    ],
    faqs: [
      {
        question: "What is MediaWiki?",
        answer: "MediaWiki is the wiki software used by Wikipedia and thousands of other wikis.",
      },
      {
        question: "Can I use this for Wikipedia?",
        answer: "Yes, the output is compatible with Wikipedia's markup syntax.",
      },
      {
        question: "Are tables converted?",
        answer: "Yes, markdown tables are converted to MediaWiki table syntax.",
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
    howToSteps: [
      "Paste your HTML content",
      'Click "Convert to DOCX"',
      "Download and open in Microsoft Word",
    ],
    faqs: [
      {
        question: "Are styles preserved?",
        answer: "Basic HTML formatting is converted to Word styles, though complex CSS may not translate perfectly.",
      },
      {
        question: "Can I convert web pages?",
        answer: "Yes, copy the HTML source from a web page and convert it to a Word document.",
      },
      {
        question: "Is the DOCX editable?",
        answer: "Yes, the converted file is fully editable in Microsoft Word and compatible applications.",
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
        question: "Are styles preserved?",
        answer: "Yes, Word styles are converted to inline HTML styles.",
      },
      {
        question: "What about images?",
        answer: "Images are embedded in the HTML, but you may want to extract and host them separately for web use.",
      },
      {
        question: "Is the HTML clean?",
        answer: "The HTML is semantic and relatively clean, though some Word-specific formatting may be verbose.",
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
        question: "What is reStructuredText used for?",
        answer: "RST is commonly used in Python documentation and with the Sphinx documentation generator.",
      },
      {
        question: "Will it work with Sphinx?",
        answer: "Yes, the converted RST is compatible with Sphinx documentation systems.",
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
    howToSteps: [
      "Upload your ODT file",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        question: "What is ODT?",
        answer: "ODT is the OpenDocument Text format used by LibreOffice, OpenOffice, and other open-source office suites.",
      },
      {
        question: "Is formatting preserved?",
        answer: "Basic formatting like headings, bold, italic, and lists are converted to markdown syntax.",
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
    description:
      "Free Textile to markdown converter. Migrate from Textile markup to Markdown format.",
    introText:
      "Convert Textile markup to Markdown. Useful for migrating legacy content to markdown-based systems.",
    howToSteps: [
      "Paste your Textile content",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        question: "What is Textile?",
        answer: "Textile is a lightweight markup language similar to Markdown, once popular in blogging platforms.",
      },
      {
        question: "Why convert to Markdown?",
        answer: "Markdown has become the de facto standard for documentation and content, with wider tool support.",
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
    howToSteps: [
      "Paste your Org Mode content",
      'Click "Convert to Markdown"',
      "Download your markdown file",
    ],
    faqs: [
      {
        question: "What is Org Mode?",
        answer: "Org Mode is a powerful markup language and organization system for Emacs.",
      },
      {
        question: "Are TODO items converted?",
        answer: "Basic TODO structures are converted, though advanced Org features may not have markdown equivalents.",
      },
      {
        question: "What about tables?",
        answer: "Yes, Org tables are converted to markdown table syntax.",
      },
    ],
    keywords: ["org to markdown", "org mode to markdown", "convert org to md"],
    relatedSlugs: ["markdown-to-html", "rst-to-markdown", "html-to-markdown"],
  },
];
