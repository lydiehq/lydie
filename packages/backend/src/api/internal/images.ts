import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@lydie/core/id";
import { db } from "@lydie/database";
import { assetsTable } from "@lydie/database/schema";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import { env, requireEnv } from "../../env";

type Variables = {
  organizationId: string;
  user: any;
};

export const ImagesRoute = new Hono<{ Variables: Variables }>().post("/upload-url", async (c) => {
  const { filename, contentType, size } = await c.req.json();

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

  if (!contentType.startsWith("image/")) {
    throw new HTTPException(400, {
      message: "File must be an image",
    });
  }

  const organizationId = c.get("organizationId");
  const userId = c.get("user").id;

  const extension = filename.split(".").pop() || "jpg";
  const key = `${organizationId}/${userId}/${createId()}.${extension}`;
  const bucketName = requireEnv(env.S3_BUCKET_ASSETS, "S3_BUCKET_ASSETS");

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(new S3Client({}), command);

  await db.insert(assetsTable).values({
    key,
    filename,
    contentType,
    size: size || null,
    organizationId,
    userId,
  });

  const assetsBaseUrl = requireEnv(env.ASSETS_PUBLIC_BASE_URL, "ASSETS_PUBLIC_BASE_URL");
  const imageUrl = `${assetsBaseUrl.replace(/\/$/, "")}/${key}`;

  return c.json({
    uploadUrl,
    key,
    url: imageUrl,
  });
});
