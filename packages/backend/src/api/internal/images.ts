import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Resource } from "sst";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@lydie/core/id";

type Variables = {
  organizationId: string;
  user: any;
};

const s3Client = new S3Client({
  region: "us-east-1",
});

export const ImagesRoute = new Hono<{ Variables: Variables }>()
  .post("/upload-url", async (c) => {
    const { filename, contentType } = await c.req.json();

    if (!filename || typeof filename !== "string") {
      throw new HTTPException(400, {
        message: "Filename is required",
      });
    }

    if (!contentType || typeof contentType !== "string") {
      throw new HTTPException(400, {
        message: "Content type is required",
      });
    }

    // Validate content type is an image
    if (!contentType.startsWith("image/")) {
      throw new HTTPException(400, {
        message: "File must be an image",
      });
    }

    const organizationId = c.get("organizationId");
    const userId = c.get("user").id;

    // Generate a unique key for the image
    const extension = filename.split(".").pop() || "jpg";
    const key = `${organizationId}/${userId}/${createId()}.${extension}`;

    // Generate presigned URL for upload
    const command = new PutObjectCommand({
      Bucket: Resource.Images.name,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    // Get the bucket domain URL for the image
    const imageUrl = `https://${Resource.Images.domain}/${key}`;

    return c.json({
      uploadUrl,
      key,
      url: imageUrl,
    });
  })
  .get("/:key", async (c) => {
    const key = c.req.param("key");
    const organizationId = c.get("organizationId");

    // Verify the key belongs to this organization
    if (!key.startsWith(`${organizationId}/`)) {
      throw new HTTPException(403, {
        message: "Access denied",
      });
    }

    // Generate presigned URL for viewing (if needed)
    const command = new GetObjectCommand({
      Bucket: Resource.Images.name,
      Key: key,
    });

    const viewUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    return c.redirect(viewUrl);
  });

