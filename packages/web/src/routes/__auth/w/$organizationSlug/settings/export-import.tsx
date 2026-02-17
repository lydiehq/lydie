import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  CheckmarkCircleRegular,
  ErrorCircleRegular,
  FolderRegular,
} from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { DocumentIcon } from "@lydie/ui/components/icons/DocumentIcon";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { Form } from "react-aria-components";
import { toast } from "sonner";

import { useOrganization } from "@/context/organization.context";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useAuthenticatedApi } from "@/services/api";

export const Route = createFileRoute("/__auth/w/$organizationSlug/settings/export-import")({
  component: RouteComponent,
});

interface ExportJob {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  downloadUrl?: string;
  documentCount?: number;
  createdAt: string;
  error?: string;
}

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
  folderPath: string | null;
}

function RouteComponent() {
  useDocumentTitle("Export & Import");

  const { createClient } = useAuthenticatedApi();
  const { organization } = useOrganization();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [currentJob, setCurrentJob] = useState<ExportJob | null>(null);

  // Import state
  const [selectedFiles, setSelectedFiles] = useState<FileWithPath[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<ImportResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    completed: number;
    total: number;
  }>({ completed: 0, total: 0 });

  // ===== EXPORT FUNCTIONS =====
  const handleExport = async () => {
    setIsExporting(true);
    setCurrentJob(null);

    try {
      const client = await createClient();

      const response = await client.internal["workspace-export"].$post().then((res) => res.json());

      if (response.success) {
        setCurrentJob({
          id: response.exportId,
          status: "completed",
          downloadUrl: response.downloadUrl,
          documentCount: response.documentCount,
          createdAt: new Date().toISOString(),
        });
        toast.success(`Export completed! ${response.documentCount} documents exported.`);
      } else {
        throw new Error("Export failed");
      }
    } catch (error) {
      console.error("Export error:", error);
      setCurrentJob({
        id: "",
        status: "failed",
        error: error instanceof Error ? error.message : "Export failed",
        createdAt: new Date().toISOString(),
      });
      toast.error("Export failed. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload = () => {
    if (currentJob?.downloadUrl) {
      window.open(currentJob.downloadUrl, "_blank");
    }
  };

  // ===== IMPORT FUNCTIONS =====
  const extractFolderPath = (file: File, stripRootFolder: boolean = true): string | null => {
    if ((file as any).webkitRelativePath) {
      const path = (file as any).webkitRelativePath;
      const parts = path.split("/");
      if (parts.length > 1) {
        parts.pop();
        if (stripRootFolder && parts.length > 0) {
          parts.shift();
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
      input.hasAttribute("webkitdirectory") || (input as any).webkitdirectory === true;

    Array.from(files).forEach((file) => {
      let folderPath: string | null = null;
      if (isFolder && (file as any).webkitRelativePath) {
        folderPath = extractFolderPath(file);
      }
      filesWithPaths.push({ file, folderPath });
    });

    setSelectedFiles(filesWithPaths);
    setUploadResults([]);
  };

  const processDroppedItems = async (items: DataTransferItemList): Promise<FileWithPath[]> => {
    const filesWithPaths: FileWithPath[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.webkitGetAsEntry) {
        const entry = item.webkitGetAsEntry();

        if (entry?.isDirectory) {
          const folderEntry = entry as FileSystemDirectoryEntry;

          const readDirectory = async (
            dirEntry: FileSystemDirectoryEntry,
            currentPath: string = "",
            isRootFolder: boolean = false,
          ): Promise<void> => {
            return new Promise((resolve, reject) => {
              const reader = dirEntry.createReader();
              const allEntries: FileSystemEntry[] = [];

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
                        const file = await new Promise<File>((resolve, reject) => {
                          fileEntry.file(resolve, reject);
                        });

                        if (file.name.match(/\.(mdx?|md)$/i)) {
                          const folderPath = currentPath ? currentPath : null;
                          filesWithPaths.push({ file, folderPath });
                        }
                      } else if (entry.isDirectory) {
                        const subDirEntry = entry as FileSystemDirectoryEntry;
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

          await readDirectory(folderEntry, "", true);
        } else if (entry?.isFile) {
          const fileEntry = entry as FileSystemFileEntry;
          const file = await new Promise<File>((resolve, reject) => {
            fileEntry.file(resolve, reject);
          });

          if (file.name.match(/\.(mdx?|md)$/i)) {
            filesWithPaths.push({ file, folderPath: null });
          }
        }
      } else {
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

  const preCreatePages = async (files: FileWithPath[]): Promise<Map<string, string>> => {
    const client = await createClient();
    const pageCache = new Map<string, string>();

    const uniquePagePaths = [
      ...new Set(
        files
          .map((f) => f.folderPath)
          .filter((path): path is string => path !== null && path !== undefined),
      ),
    ];

    uniquePagePaths.sort((a, b) => {
      const depthA = a.split("/").length;
      const depthB = b.split("/").length;
      return depthA - depthB;
    });

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
      }
    }

    return pageCache;
  };

  const processFilesInBatches = async (
    files: FileWithPath[],
    pageCache: Map<string, string>,
    batchSize: number = 5,
  ): Promise<ImportResult[]> => {
    const results: ImportResult[] = [];
    const client = await createClient();

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      const batchPromises = batch.map(async ({ file, folderPath }) => {
        if (!file.name.match(/\.(mdx?|md)$/i)) {
          return {
            success: false,
            error: `${file.name}: Invalid file type. Only .md and .mdx files are supported.`,
          } as ImportResult;
        }

        try {
          const content = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target?.result as string);
            reader.onerror = reject;
            reader.readAsText(file);
          });

          const parentId = folderPath ? pageCache.get(folderPath) : undefined;

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

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

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
      toast.info("Creating page structure...");
      const pageCache = await preCreatePages(selectedFiles);

      toast.info("Importing files...");
      const results = await processFilesInBatches(selectedFiles, pageCache, 5);
      setUploadResults(results);

      const successCount = results.filter((r) => r.success).length;
      const failureCount = results.length - successCount;

      if (failureCount === 0) {
        toast.success(`Successfully imported all ${successCount} file(s)`);
      } else {
        toast.warning(`Imported ${successCount} file(s), ${failureCount} failed`);
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
        <h1 className="text-2xl font-bold text-gray-900">Export & Import</h1>
        <p className="text-gray-600 mt-2">
          Export your workspace documents or import MDX files to create new content.
        </p>
      </div>

      {/* Export Section */}
      <div className="p-6 border border-gray-200 rounded-lg bg-white">
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <ArrowDownloadRegular className="h-6 w-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">Export Workspace</h3>
              <p className="text-gray-600 mt-1">
                Export all documents as Markdown files with YAML frontmatter containing document
                properties, database schemas, and page configuration.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Button onPress={handleExport} isPending={isExporting} isDisabled={isExporting}>
              {isExporting ? "Exporting..." : "Export Workspace"}
            </Button>
          </div>
        </div>

        {/* Export Results */}
        {currentJob && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div
              className={`p-4 rounded-lg border ${
                currentJob.status === "completed"
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="flex items-start space-x-3">
                {currentJob.status === "completed" ? (
                  <CheckmarkCircleRegular className="h-5 w-5 text-green-500 mt-0.5" />
                ) : (
                  <ErrorCircleRegular className="h-5 w-5 text-red-500 mt-0.5" />
                )}

                <div className="flex-1">
                  {currentJob.status === "completed" ? (
                    <div className="space-y-3">
                      <div>
                        <h4 className="font-medium text-green-900">Export Completed</h4>
                        <p className="text-sm text-green-700">
                          Successfully exported {currentJob.documentCount} document(s)
                        </p>
                      </div>

                      {currentJob.downloadUrl && (
                        <Button size="sm" onPress={handleDownload}>
                          Download Export
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-medium text-red-900">Export Failed</h4>
                      <p className="text-sm text-red-700">{currentJob.error}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import Section */}
      <div className="p-6 border border-gray-200 rounded-lg bg-white">
        <div className="space-y-6">
          <div className="flex items-start space-x-4">
            <div className="p-3 bg-purple-50 rounded-lg">
              <ArrowUploadRegular className="h-6 w-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-medium text-gray-900">Import MDX Files</h3>
              <p className="text-gray-600 mt-1">
                Upload MDX files to create new documents. Custom components will be automatically
                detected and created. You can drag and drop a folder to preserve the page hierarchy.
              </p>
            </div>
          </div>

          <div
            className="p-6 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50 transition-colors hover:border-purple-400"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="text-center space-y-4">
              <ArrowUploadRegular className="mx-auto h-12 w-12 text-gray-400" />
              <div>
                <h4 className="text-lg font-medium text-gray-900">Select MDX Files</h4>
                <p className="text-gray-500">
                  Choose .md or .mdx files, or drop a folder to preserve page hierarchy
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
                    file:bg-purple-50 file:text-purple-700
                    hover:file:bg-purple-100"
                />

                {selectedFiles && selectedFiles.length > 0 && (
                  <div className="text-left space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      Selected files ({selectedFiles.length}):
                    </p>
                    <ul className="text-sm text-gray-600 space-y-1 max-h-64 overflow-y-auto">
                      {selectedFiles.map((fileWithPath, index) => (
                        <li key={index} className="flex items-center space-x-2 py-1">
                          {fileWithPath.folderPath ? (
                            <FolderRegular className="h-4 w-4 text-purple-500" />
                          ) : (
                            <DocumentIcon className="h-4 w-4" />
                          )}
                          <span className="flex-1 truncate">
                            {fileWithPath.folderPath && (
                              <span className="text-purple-600 mr-1">
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
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${(uploadProgress.completed / uploadProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="flex space-x-3 justify-center">
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
                    <Button intent="secondary" onPress={clearFiles} isDisabled={isUploading}>
                      Clear
                    </Button>
                  )}
                </div>
              </Form>
            </div>
          </div>

          {/* Import Results */}
          {uploadResults.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-gray-900">Import Results</h4>

              <div className="space-y-3">
                {uploadResults.map((result, index) => (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border ${
                      result.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {result.success ? (
                        <CheckmarkCircleRegular className="h-5 w-5 text-green-500 mt-0.5" />
                      ) : (
                        <ErrorCircleRegular className="h-5 w-5 text-red-500 mt-0.5" />
                      )}

                      <div className="flex-1">
                        {result.success ? (
                          <div className="space-y-2">
                            <div>
                              <h5 className="font-medium text-green-900">{result.title}</h5>
                              <p className="text-sm text-green-700">
                                Successfully imported as document
                              </p>
                            </div>

                            {(result.componentsFound || 0) > 0 && (
                              <div className="text-sm text-green-700">
                                <p>Found {result.componentsFound} custom components</p>
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
                            <h5 className="font-medium text-red-900">Import Failed</h5>
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
      </div>

      {/* Info Section */}
      <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h3 className="text-sm font-medium text-gray-900 mb-2">About Exports & Imports</h3>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Exports are stored temporarily and available for 7 days</li>
          <li>Each document is exported as a separate Markdown file</li>
          <li>Folder structure is preserved in the file paths</li>
          <li>Exported files can be imported back into any workspace</li>
          <li>Custom components are automatically created during import</li>
        </ul>
      </div>
    </div>
  );
}
