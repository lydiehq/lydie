import { Image } from "@tiptap/extension-image";
import type { HonoClient } from "hono/client";

export const ImageUpload = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alt: {
        default: "",
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setImage: (options) => {
        return ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        };
      },
    };
  },
});

export async function uploadImage(
  file: File,
  apiClient: HonoClient<any>
): Promise<string> {
  // Get presigned URL
  const uploadResponse = await apiClient.internal.images["upload-url"].$post({
    json: {
      filename: file.name,
      contentType: file.type,
    },
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to get upload URL");
  }

  const { uploadUrl, url } = await uploadResponse.json();

  // Upload file to S3
  const uploadResult = await fetch(uploadUrl, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!uploadResult.ok) {
    throw new Error("Failed to upload image");
  }

  return url;
}
