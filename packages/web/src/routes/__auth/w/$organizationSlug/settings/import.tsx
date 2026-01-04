import { Button } from "@/components/generic/Button";
import { useAuthenticatedApi } from "@/services/api";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useOrganization } from "@/context/organization.context";
import { toast } from "sonner";
import { Form } from "react-aria-components";
import { useState, useRef, useCallback } from "react";
import {
  Upload,
  FileText,
  CheckCircle,
  AlertCircle,
  Folder,
} from "lucide-react";

export const Route = createFileRoute(
  "/__auth/w/$organizationSlug/settings/import"
)({
  component: RouteComponent,
});

interface ImportResult {
  success: boolean;
  documentId?: string;
  title?: string;
  slug?: string;
  componentsFound?: number;
  newComponentsCreated?: string[];
  error?: string;
}

interface FileWithPath {
  file: File;
  folderPath: string | null; // Relative path from root folder (e.g., "folder1/subfolder2")
}

function RouteComponent() {
  const { createClient } = useAuthenticatedApi();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<ImportResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });

  // Helper to extract folder path from file's webkitRelativePath or full path
  const extractFolderPath = (
    file: File,
    stripRootFolder: boolean = true
  ): string | null => {
    // If file has webkitRelativePath (from folder input or drop), use it
    if ((file as any).webkitRelativePath) {
      const path = (file as any).webkitRelativePath;
      // Remove filename and any leading folder name
      const parts = path.split("/");
      if (parts.length > 1) {
        parts.pop(); // Remove filename
        // Always strip the root folder name when uploading a folder
        // This ensures files maintain their relative structure without the uploaded folder name
        if (stripRootFolder && parts.length > 0) {
          parts.shift(); // Remove the root folder name (e.g., "MyDocs")
        }
        return parts.length > 0 ? parts.join("/") : null;
      }
    }
    return null;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const filesWithPaths: FileWithPath[] = [];
    const input = event.target;
    const isFolder =
      input.hasAttribute("webkitdirectory") ||
      (input as any).webkitdirectory === true;

    Array.from(files).forEach((file) => {
      // Try to extract folder path
      let folderPath: string | null = null;

      if (isFolder && (file as any).webkitRelativePath) {
        folderPath = extractFolderPath(file);
      }

      filesWithPaths.push({ file, folderPath });
    });

    setSelectedFiles(filesWithPaths);
    setUploadResults([]); // Clear previous results
  };

  // Process dropped items (files or folders)
  const processDroppedItems = async (
    items: DataTransferItemList
  ): Promise<FileWithPath[]> => {
    const filesWithPaths: FileWithPath[] = [];

    // Process each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Check if it's a directory entry
      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();

        if (entry?.isDirectory) {
          // It's a folder - read all files recursively
          const folderEntry = entry as FileSystemDirectoryEntry;

          const readDirectory = async (
            dirEntry: FileSystemDirectoryEntry,
            currentPath: string = "",
            isRootFolder: boolean = false
          ): Promise<void> => {
            return new Promise((resolve, reject) => {
              const reader = dirEntry.createReader();
              const allEntries: FileSystemEntry[] = [];

              // readEntries may need to be called multiple times to get all entries
              const readAllEntries = (): Promise<void> => {
                return new Promise((innerResolve, innerReject) => {
                  reader.readEntries((entries) => {
                    if (entries.length === 0) {
                      innerResolve();
                      return;
                    }
                    allEntries.push(...entries);
                    readAllEntries().then(innerResolve).catch(innerReject);
                  }, innerReject);
                });
              };

              readAllEntries()
                .then(async () => {
                  try {
                    for (const entry of allEntries) {
                      if (entry.isFile) {
                        const fileEntry = entry as FileSystemFileEntry;
                        const file = await new Promise<File>(
                          (resolve, reject) => {
                            fileEntry.file(resolve, reject);
                          }
                        );

                        // Only process MDX/MD files
                        if (file.name.match(/\.(mdx?|md)$/i)) {
                          const folderPath = currentPath ? currentPath : null;
                          filesWithPaths.push({ file, folderPath });
                        }
                      } else if (entry.isDirectory) {
                        const subDirEntry = entry as FileSystemDirectoryEntry;
                        // Don't include the root folder name in the path
                        const newPath = isRootFolder
                          ? subDirEntry.name
                          : currentPath
                          ? `${currentPath}/${subDirEntry.name}`
                          : subDirEntry.name;
                        await readDirectory(subDirEntry, newPath, false);
                      }
                    }
                    resolve();
                  } catch (error) {
                    reject(error);
                  }
                })
                .catch(reject);
            });
          };

          // Start reading from the root, but don't include its name in paths
          await readDirectory(folderEntry, "", true);
        } else if (entry?.isFile) {
          // It's a file
          const fileEntry = entry as FileSystemFileEntry;
          const file = await new Promise<File>((resolve, reject) => {
            fileEntry.file(resolve, reject);
          });

          if (file.name.match(/\.(mdx?|md)$/i)) {
            filesWithPaths.push({ file, folderPath: null });
          }
        }
      } else {
        // Fallback: treat as file
        const file = item.getAsFile();
        if (file && file.name.match(/\.(mdx?|md)$/i)) {
          filesWithPaths.push({ file, folderPath: null });
        }
      }
    }

    return filesWithPaths;
  };

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    try {
      const filesWithPaths = await processDroppedItems(items);
      if (filesWithPaths.length > 0) {
        setSelectedFiles(filesWithPaths);
        setUploadResults([]);
      } else {
        toast.error("No MDX files found in dropped folder");
      }
    } catch (error) {
      console.error("Error processing dropped items:", error);
      toast.error("Failed to process dropped folder");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const preCreatePages = async (
    files: FileWithPath[]
  ): Promise<Map<string, string>> => {
    const client = await createClient();
    const pageCache = new Map<string, string>();

    // Get unique page paths (excluding null/undefined)
    const uniquePagePaths = [
      ...new Set(
        files
          .map((f) => f.folderPath)
          .filter((path): path is string => path !== null && path !== undefined)
      ),
    ];

    // Sort by depth (shortest first) to ensure parent pages are created before children
    uniquePagePaths.sort((a, b) => {
      const depthA = a.split("/").length;
      const depthB = b.split("/").length;
      return depthA - depthB;
    });

    // Create pages sequentially to ensure proper ordering
    for (const pagePath of uniquePagePaths) {
      try {
        const response = await client.internal["mdx-import"]["create-page"]
          .$post({
            json: { pagePath },
          })
          .then((res) => res.json());

        if (response.pageId) {
          pageCache.set(pagePath, response.pageId);
        }
      } catch (error) {
        console.error(`Failed to create page ${pagePath}:`, error);
        // Continue with other pages even if one fails
      }
    }

    return pageCache;
  };

  const processFilesInBatches = async (
    files: FileWithPath[],
    pageCache: Map<string, string>,
    batchSize: number = 5
  ): Promise<ImportResult[]> => {
    const results: ImportResult[] = [];
    const client = await createClient();

    // Process files in batches
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      // Process batch in parallel
      const batchPromises = batch.map(async ({ file, folderPath }) => {
        // Validate file type
        if (!file.name.match(/\.(mdx?|md)$/i)) {
          return {
            success: false,
            error: `${file.name}: Invalid file type. Only .md and .mdx files are supported.`,
          } as ImportResult;
        }

        try {
          // Read file content
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });

          // Get parentId from cache if available
          const parentId = folderPath ? pageCache.get(folderPath) : undefined;

          // Upload to API with parentId (preferred) or pagePath (fallback)
          const response = await client.internal["mdx-import"]
            .$post({
              json: {
                mdxContent: content,
                filename: file.name,
                parentId: parentId || null,
                pagePath: folderPath || null,
              },
            })
            .then((res) => res.json());

          const result: ImportResult = {
            success: true,
            documentId: response.documentId,
            title: response.title,
            slug: response.slug,
            componentsFound: response.componentsFound,
            newComponentsCreated: response.newComponentsCreated,
          };

          toast.success(`Successfully imported: ${file.name}`);
          return result;
        } catch (error) {
          console.error(`Error importing ${file.name}:`, error);
          const result: ImportResult = {
            success: false,
            error: `${file.name}: Failed to import - ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          };
          toast.error(`Failed to import: ${file.name}`);
          return result;
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Update progress
      setUploadProgress({
        completed: Math.min(i + batchSize, files.length),
        total: files.length,
      });
    }

    return results;
  };

  const handleUpload = async () => {
    if (!selectedFiles || selectedFiles.length === 0) {
      toast.error("Please select at least one MDX file");
      return;
    }

    if (!organization) {
      toast.error("Organization not found");
      return;
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: selectedFiles.length });
    setUploadResults([]);

    try {
      // Step 1: Pre-create all unique pages to avoid duplicates
      toast.info("Creating page structure...");
      const pageCache = await preCreatePages(selectedFiles);

      // Step 2: Import files with pre-created page IDs
      toast.info("Importing files...");
      const results = await processFilesInBatches(selectedFiles, pageCache, 5);
      setUploadResults(results);

      // Show summary toast
      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      if (failureCount === 0) {
        toast.success(`Successfully imported all ${successCount} file(s)`);
      } else {
        toast.warning(
          `Imported ${successCount} file(s), ${failureCount} failed`
        );
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("An error occurred during upload");
    } finally {
      setIsUploading(false);
      setUploadProgress({ completed: 0, total: 0 });
    }
  };

  const handleViewDocument = (documentId: string) => {
    navigate({
      to: "/w/$organizationSlug/$id",
      params: {
        organizationSlug: organization.slug,
        id: documentId,
      },
    });
  };

  const clearFiles = () => {
    setSelectedFiles([]);
    setUploadResults([]);
    setUploadProgress({ completed: 0, total: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import MDX Files</h1>
        <p className="text-gray-600 mt-2">
          Upload MDX files to create new documents. Custom components will be
          automatically detected and created.
        </p>
      </div>

      {/* Upload Section */}
      <div
        className="p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 transition-colors hover:border-blue-400"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <div className="text-center space-y-4">
          <Upload className="mx-auto h-12 w-12 text-gray-400" />
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Select MDX Files
            </h3>
            <p className="text-gray-500">
              Choose .md or .mdx files, or drop a folder to preserve page
              hierarchy
            </p>
          </div>

          <Form
            onSubmit={(e) => {
              e.preventDefault();
              handleUpload();
            }}
            className="space-y-4"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.mdx"
              multiple
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-medium
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />

            {selectedFiles && selectedFiles.length > 0 && (
              <div className="text-left space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Selected files ({selectedFiles.length}):
                </p>
                <ul className="text-sm text-gray-600 space-y-1 max-h-64 overflow-y-auto">
                  {selectedFiles.map((fileWithPath, index) => (
                    <li
                      key={index}
                      className="flex items-center space-x-2 py-1"
                    >
                      {fileWithPath.folderPath ? (
                        <Folder className="h-4 w-4 text-blue-500" />
                      ) : (
                        <FileText className="h-4 w-4" />
                      )}
                      <span className="flex-1 truncate">
                        {fileWithPath.folderPath && (
                          <span className="text-blue-600 mr-1">
                            {fileWithPath.folderPath}/
                          </span>
                        )}
                        {fileWithPath.file.name}
                      </span>
                      <span className="text-gray-400 text-xs">
                        ({(fileWithPath.file.size / 1024).toFixed(1)} KB)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {isUploading && uploadProgress.total > 0 && (
              <div className="w-full">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Progress</span>
                  <span>
                    {uploadProgress.completed} / {uploadProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (uploadProgress.completed / uploadProgress.total) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <Button
                type="submit"
                isPending={isUploading}
                isDisabled={!selectedFiles || selectedFiles.length === 0}
              >
                {isUploading
                  ? `Importing... (${uploadProgress.completed}/${uploadProgress.total})`
                  : "Import Files"}
              </Button>

              {selectedFiles && selectedFiles.length > 0 && (
                <Button
                  intent="secondary"
                  onPress={clearFiles}
                  isDisabled={isUploading}
                >
                  Clear
                </Button>
              )}
            </div>
          </Form>
        </div>
      </div>

      {/* Results Section */}
      {uploadResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Import Results
          </h2>

          <div className="space-y-3">
            {uploadResults.map((result, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${
                  result.success
                    ? "bg-green-50 border-green-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-start space-x-3">
                  {result.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                  )}

                  <div className="flex-1">
                    {result.success ? (
                      <div className="space-y-2">
                        <div>
                          <h4 className="font-medium text-green-900">
                            {result.title}
                          </h4>
                          <p className="text-sm text-green-700">
                            Successfully imported as document
                          </p>
                        </div>

                        {(result.componentsFound || 0) > 0 && (
                          <div className="text-sm text-green-700">
                            <p>
                              Found {result.componentsFound} custom components
                            </p>
                            {result.newComponentsCreated &&
                              result.newComponentsCreated.length > 0 && (
                                <p>
                                  Created new components:{" "}
                                  {result.newComponentsCreated.join(", ")}
                                </p>
                              )}
                          </div>
                        )}

                        <Button
                          size="sm"
                          onPress={() => handleViewDocument(result.documentId!)}
                        >
                          View Document
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <h4 className="font-medium text-red-900">
                          Import Failed
                        </h4>
                        <p className="text-sm text-red-700">{result.error}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
