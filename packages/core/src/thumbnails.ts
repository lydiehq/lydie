import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Resource } from "sst";

const THUMBNAIL_WIDTH = 800;
const THUMBNAIL_HEIGHT = 450;

const PASTEL_COLORS = [
  "#FFE4E1", // Misty Rose
  "#E6E6FA", // Lavender
  "#F0FFFF", // Azure
  "#F5F5DC", // Beige
  "#FFF8DC", // Cornsilk
  "#F0FFF0", // Honeydew
  "#F5FFFA", // Mint Cream
  "#FFF5EE", // Seashell
  "#F5F5F5", // White Smoke
  "#E0FFFF", // Light Cyan
  "#FFFACD", // Lemon Chiffon
  "#FFE4B5", // Moccasin
  "#FFDAB9", // Peach Puff
  "#E6F3FF", // Light Blue
  "#FFF0F5", // Lavender Blush
  "#F0F8FF", // Alice Blue
  "#F5F5F0", // Ivory
  "#FFFAF0", // Floral White
  "#FFF5E1", // Cream
  "#E8F5E9", // Light Green
];

function getRandomColor(): string {
  const color = PASTEL_COLORS[Math.floor(Math.random() * PASTEL_COLORS.length)];
  return color ?? "#F5F5F5";
}

function getContrastColor(backgroundColor: string): string {
  const r = Number.parseInt(backgroundColor.slice(1, 3), 16);
  const g = Number.parseInt(backgroundColor.slice(3, 5), 16);
  const b = Number.parseInt(backgroundColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "#374151" : "#F9FAFB";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTextFromContent(content: unknown): string {
  if (!content) return "";

  if (typeof content === "string") {
    return stripHtml(content).slice(0, 200);
  }

  if (Array.isArray(content)) {
    return content
      .map((node) => {
        if (typeof node === "string") return stripHtml(node);
        if (node?.text) return node.text;
        if (node?.content) return extractTextFromContent(node.content);
        return "";
      })
      .join(" ")
      .slice(0, 200);
  }

  if (typeof content === "object" && content !== null) {
    const obj = content as Record<string, unknown>;
    if (obj.text && typeof obj.text === "string") return obj.text;
    if (obj.content) return extractTextFromContent(obj.content);
  }

  return "";
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateTextLines(text: string, color: string): string {
  const words = text.split(" ").filter((w) => w.length > 0);
  const lines: string[] = [];
  let currentLine = "";
  const maxCharsPerLine = 45;

  for (const word of words.slice(0, 80)) {
    if ((currentLine + " " + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + " " + word).trim();
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return lines
    .slice(0, 8)
    .map((line, index) => {
      const y = 180 + index * 28;
      return `<text x="140" y="${y}" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="${color}">${escapeXml(line)}</text>`;
    })
    .join("");
}

export interface ThumbnailGenerationResult {
  s3Key: string;
  publicUrl: string;
  width: number;
  height: number;
}

/**
 * Generates a template thumbnail SVG and uploads it to S3.
 *
 * @param templateName - The name of the template
 * @param documentTitle - The title of the root document
 * @param documentContent - The content of the document (TipTap JSON or string)
 * @param templateSlug - The unique slug for the template (used for S3 key)
 * @returns Object containing the S3 key and public URL for the thumbnail
 */
export async function generateAndUploadThumbnail(
  templateName: string,
  documentTitle: string,
  documentContent: unknown,
  templateSlug: string,
): Promise<ThumbnailGenerationResult> {
  const backgroundColor = getRandomColor();
  const textColor = getContrastColor(backgroundColor);

  const titleText = documentTitle || templateName;
  const bodyText = extractTextFromContent(documentContent);

  const svg = `
    <svg width="${THUMBNAIL_WIDTH}" height="${THUMBNAIL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="4" stdDeviation="8" flood-opacity="0.15"/>
        </filter>
      </defs>
      
      <!-- Background -->
      <rect width="100%" height="100%" fill="${backgroundColor}"/>
      
      <!-- Document Container -->
      <g filter="url(#shadow)">
        <!-- Document Paper -->
        <rect 
          x="100" 
          y="40" 
          width="600" 
          height="370" 
          fill="#FFFFFF" 
          rx="8"
          ry="8"
        />
        
        <!-- Document Header Line -->
        <rect x="140" y="80" width="520" height="4" fill="#E5E7EB" rx="2"/>
        
        <!-- Title -->
        <text 
          x="140" 
          y="130" 
          font-family="system-ui, -apple-system, sans-serif" 
          font-size="28" 
          font-weight="600" 
          fill="#111827"
        >${escapeXml(titleText.slice(0, 50))}</text>
        
        <!-- Body Text Lines -->
        ${generateTextLines(bodyText, textColor)}
      </g>
    </svg>
  `;

  // Convert SVG to PNG using sharp
  const sharp = await import("sharp");
  const pngBuffer = await sharp
    .default(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 90 })
    .toBuffer();

  // Upload to S3
  const s3Key = `templates/thumbnails/${templateSlug}.png`;
  const s3Client = new S3Client({});

  const putCommand = new PutObjectCommand({
    Bucket: Resource.OrganizationAssets.name,
    Key: s3Key,
    Body: pngBuffer,
    ContentType: "image/png",
  });

  await s3Client.send(putCommand);

  // Construct public URL
  const routerUrl = Resource.AssetsRouter.url;
  const assetDomain = routerUrl.startsWith("http")
    ? new URL(routerUrl).hostname
    : routerUrl;
  const publicUrl = `https://${assetDomain}/${s3Key}`;

  return {
    s3Key,
    publicUrl,
    width: THUMBNAIL_WIDTH,
    height: THUMBNAIL_HEIGHT,
  };
}
