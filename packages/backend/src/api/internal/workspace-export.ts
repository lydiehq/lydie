import { S3Client } from "@aws-sdk/client-s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createId } from "@lydie/core/id";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { Resource } from "sst";

const s3Client = new S3Client({ region: "us-east-1" });

// In-memory store for export jobs (replace with database table for production)
const exportJobs = new Map<
  string,
  {
    id: string;
    organizationId: string;
    userId: string;
    status: "pending" | "processing" | "completed" | "failed";
    createdAt: Date;
    completedAt?: Date;
    error?: string;
    manifestKey?: string;
    downloadUrl?: string;
  }
>();

export const WorkspaceExportRoute = new Hono<{
  Variables: {
    user: any;
    session: any;
    organizationId: string;
  };
}>()
  // POST /workspace-export - Start a new export
  .post("/", async (c) => {
    const organizationId = c.get("organizationId");
    const userId = c.get("user").id;

    const exportId = createId();

    // Create job record
    exportJobs.set(exportId, {
      id: exportId,
      organizationId,
      userId,
      status: "pending",
      createdAt: new Date(),
    });

    // For now, do synchronous export (can be made async later with Lambda)
    // In production, this would invoke the Lambda function
    try {
      exportJobs.set(exportId, {
        ...exportJobs.get(exportId)!,
        status: "processing",
      });

      // Import and call handler directly
      const { handler } = await import("../../handlers/workspace-export");
      await handler({ organizationId, userId, exportId });

      const bucketName = process.env.SST_RESOURCE_WorkspaceExports_NAME;
      const manifestKey = `exports/${organizationId}/${exportId}/manifest.json`;

      // Generate presigned URL for download
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: manifestKey,
      });
      const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

      exportJobs.set(exportId, {
        ...exportJobs.get(exportId)!,
        status: "completed",
        completedAt: new Date(),
        manifestKey,
        downloadUrl,
      });

      return c.json({
        success: true,
        exportId,
        status: "completed",
        downloadUrl,
      });
    } catch (error) {
      console.error("Export failed:", error);
      exportJobs.set(exportId, {
        ...exportJobs.get(exportId)!,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      throw new HTTPException(500, {
        message: "Export failed",
      });
    }
  })
  // GET /workspace-export/:exportId - Get export status
  .get("/:exportId", async (c) => {
    const { exportId } = c.req.param();
    const organizationId = c.get("organizationId");

    const job = exportJobs.get(exportId);

    if (!job || job.organizationId !== organizationId) {
      throw new HTTPException(404, { message: "Export not found" });
    }

    return c.json({
      id: job.id,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      completedAt: job.completedAt?.toISOString(),
      error: job.error,
      downloadUrl: job.downloadUrl,
    });
  })
  // GET /workspace-export/:exportId/download - Get download URL for specific file
  .get("/:exportId/download", async (c) => {
    const { exportId } = c.req.param();
    const organizationId = c.get("organizationId");
    const filePath = c.req.query("path");

    const job = exportJobs.get(exportId);

    if (!job || job.organizationId !== organizationId || job.status !== "completed") {
      throw new HTTPException(404, { message: "Export not found or not ready" });
    }

    const bucketName = process.env.SST_RESOURCE_WorkspaceExports_NAME;
    const key = filePath ? `exports/${organizationId}/${exportId}/${filePath}` : job.manifestKey;

    if (!key) {
      throw new HTTPException(400, { message: "No file path specified" });
    }

    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return c.json({
      downloadUrl,
      expiresIn: 3600,
    });
  });
