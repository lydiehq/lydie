import { expect, test } from "./fixtures/auth.fixture";
import {
  createTestCollection,
  createTestCollectionDocument,
  deleteTestCollection,
  deleteTestDocument,
} from "./utils/db";

test.describe("collections", () => {
  test.describe("sidebar", () => {
    test("should display collections section in sidebar", async ({ page, organization }) => {
      await page.goto(`/w/${organization.slug}`);
      await expect(page.getByText("Collections", { exact: true })).toBeVisible();
    });

    test("should create a new collection from sidebar", async ({ page, organization }) => {
      await page.goto(`/w/${organization.slug}`);

      await page.getByRole("button", { name: "New Collection" }).click();

      await expect(page).toHaveURL(/\/collections\//);
      await expect(page.getByRole("textbox", { name: "Collection name" })).toHaveValue("Untitled Collection");
    });

    test("should display existing collections in sidebar", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Sidebar Test Collection",
        handle: "sidebar-test",
      });

      try {
        await page.goto(`/w/${organization.slug}`);
        await expect(page.getByText("Sidebar Test Collection")).toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should navigate to collection page when clicking collection in sidebar", async ({
      page,
      organization,
    }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Navigation Test Collection",
        handle: "nav-test",
      });

      try {
        await page.goto(`/w/${organization.slug}`);
        await page.getByText("Navigation Test Collection").click();

        await expect(page).toHaveURL(`/w/${organization.slug}/collections/${collection.id}`);
        await expect(
          page.getByRole("textbox", { name: "Collection name" }),
        ).toHaveValue("Navigation Test Collection");
      } finally {
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe("collection page", () => {
    test("should display collection details", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Details Test Collection",
        handle: "details-test",
        properties: [
          {
            name: "status",
            type: "select",
            required: false,
            unique: false,
            options: ["draft", "published"],
          },
        ],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await expect(page.getByRole("textbox", { name: "Collection name" })).toHaveValue("Details Test Collection");
        await expect(page.getByRole("textbox", { name: "Collection handle" })).toHaveValue("details-test");
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should update collection name", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Old Collection Name",
        handle: "name-update-test",
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        const nameInput = page.getByRole("textbox", { name: "Collection name" });
        await nameInput.fill("New Collection Name");

        await page
          .locator('form:has(input[aria-label="Collection name"])')
          .getByRole("button", { name: "Save", exact: true })
          .click();

        await expect(page.getByText("Collection name updated")).toBeVisible();
        await expect(nameInput).toHaveValue("New Collection Name");
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should update collection handle", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Handle Update Test",
        handle: "old-handle",
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        const handleInput = page.getByRole("textbox", { name: "Collection handle" });
        await handleInput.fill("new-handle");

        await page
          .locator('form:has(input[aria-label="Collection handle"])')
          .getByRole("button", { name: "Save", exact: true })
          .click();

        await expect(page.getByText("Collection handle updated")).toBeVisible();
        await expect(handleInput).toHaveValue("new-handle");
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should delete collection", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Delete Test Collection",
        handle: "delete-test",
      });

      await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

      page.on("dialog", (dialog) => dialog.accept());
      await page.getByRole("button", { name: "Delete collection" }).click();

      await expect(page).toHaveURL(`/w/${organization.slug}`);
      await expect(page.getByText("Delete Test Collection")).not.toBeVisible();
    });

    test("should show not found state for invalid collection", async ({ page, organization }) => {
      await page.goto(`/w/${organization.slug}/collections/non-existent-id`);

      await expect(page.getByText("Collection not found")).toBeVisible();
      await expect(page.getByRole("link", { name: "Go back" })).toBeVisible();
    });
  });

  test.describe("property management", () => {
    test("should add a new property to collection", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Property Test Collection",
        handle: "property-test",
        properties: [],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        const propertyManager = page.locator(".rounded-xl").filter({ hasText: "Routing" }).locator("..").locator("..").getByRole("button", { name: "Add property" });
        await propertyManager.click();
        await page.getByPlaceholder("e.g., status, priority, dueDate").fill("Category");
        await page.locator("#collection-property-type").selectOption("text");
        await page.getByRole("button", { name: "Add Property" }).click();

        await expect(page.getByText("Category")).toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should remove a property from collection", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Remove Property Test",
        handle: "remove-prop-test",
        properties: [{ name: "tempField", type: "text", required: false, unique: false }],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        const propertyBadge = page.locator("div").filter({ hasText: /^tempField.*\(text\)$/ }).first();
        await expect(propertyBadge).toBeVisible();

        await propertyBadge.getByRole("button", { name: "Remove property" }).click();

        await expect(propertyBadge).not.toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should enable routing by adding route property", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Routing Test Collection",
        handle: "routing-test",
        properties: [],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await expect(
          page.getByText("Routing is enabled through the route field"),
        ).not.toBeVisible();

        await page.getByRole("button", { name: "Enable routing" }).click();

        await expect(page.getByText("Routing enabled")).toBeVisible();
        await expect(page.getByText("Routing is enabled through the route field")).toBeVisible();
        await expect(page.getByText("route")).toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe("collection entries", () => {
    test("should create a new document in collection", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Entry Test Collection",
        handle: "entry-test",
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await page.getByRole("button", { name: "Add entry" }).click();

        await expect(page).toHaveURL(/\/d\//);
        await expect(page.locator('[data-testid="document-collection-badge"]')).toHaveText(
          "Entry Test Collection",
        );
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should show collection and parent breadcrumbs on nested collection documents", async ({
      page,
      organization,
    }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Breadcrumb Collection",
        handle: "breadcrumb-collection",
      });

      const { document: parentDocument } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Parent Breadcrumb Document",
        },
      );

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "Nested Breadcrumb Document",
        parentId: parentDocument.id,
      });

      try {
        await page.goto(`/w/${organization.slug}/${document.id}`);

        const breadcrumbs = page.getByRole("navigation", { name: "Document breadcrumbs" });
        await expect(breadcrumbs).toBeVisible();

        const collectionBreadcrumb = breadcrumbs.getByRole("link", {
          name: "Breadcrumb Collection",
        });

        await expect(collectionBreadcrumb).toBeVisible();
        await expect(collectionBreadcrumb).toHaveAttribute(
          "href",
          `/w/${organization.slug}/collections/${collection.id}`,
        );

        const parentBreadcrumb = breadcrumbs.getByRole("link", {
          name: "Parent Breadcrumb Document",
        });
        await expect(parentBreadcrumb).toBeVisible();
        await expect(parentBreadcrumb).toHaveAttribute(
          "href",
          `/w/${organization.slug}/${parentDocument.id}`,
        );

        await expect(breadcrumbs.getByText("Nested Breadcrumb Document")).toBeVisible();
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestDocument(parentDocument.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should display documents in collection table", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Table Test Collection",
        handle: "table-test",
        properties: [{ name: "status", type: "text", required: false, unique: false }],
      });

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "Table Test Document",
        published: true,
        fieldValues: { status: "active" },
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await expect(page.getByText("Table Test Document")).toBeVisible();
        await expect(page.getByText("status").first()).toBeVisible();
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should edit field values in table", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Edit Field Test",
        handle: "edit-field-test",
        properties: [{ name: "priority", type: "text", required: false, unique: false }],
      });

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "Edit Test Document",
        fieldValues: { priority: "low" },
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        const cell = page.locator('[data-testid="field-priority"]').first();
        await cell.click();
        await cell.locator('input[type="text"]').fill("high");
        await cell.locator('input[type="text"]').press("Enter");

        await expect(cell).toHaveText("high");
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestCollection(collection.id);
      }
    });

    test.skip("should filter documents by property value", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Filter Test Collection",
        handle: "filter-test",
        properties: [{ name: "category", type: "text", required: false, unique: false }],
      });

      const { document: doc1 } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Category A Document",
          published: true,
          fieldValues: { category: "A" },
        },
      );

      const { document: doc2 } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Category B Document",
          published: true,
          fieldValues: { category: "B" },
        },
      );

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await page.getByRole("button", { name: "Filter" }).click();
        await page.getByPlaceholder("Filter by category").fill("A");

        await expect(page.getByText("Category A Document")).toBeVisible();
        await expect(page.getByText("Category B Document")).not.toBeVisible();
      } finally {
        await deleteTestDocument(doc1.id);
        await deleteTestDocument(doc2.id);
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe("collection routing", () => {
    test("should display route tree when routing is enabled", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Route Tree Test",
        handle: "route-tree-test",
        properties: [{ name: "route", type: "text", required: true, unique: true }],
      });

      const { document: parentDoc } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Parent Page",
          published: true,
          fieldValues: { route: "/" },
        },
      );

      const { document: childDoc } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Child Page",
          published: true,
          parentId: parentDoc.id,
          fieldValues: { route: "/child" },
        },
      );

      try {
        await page.goto(`/w/${organization.slug}`);

        const collectionItem = page.locator(`[data-collection-id="${collection.id}"]`);
        await collectionItem.getByRole("button", { name: "Expand" }).click();

        await expect(collectionItem.getByText("Parent Page")).toBeVisible();
        await expect(collectionItem.getByText("Child Page")).toBeVisible();
      } finally {
        await deleteTestDocument(childDoc.id);
        await deleteTestDocument(parentDoc.id);
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe("collection block", () => {
    test("should insert collection block in editor", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Block Test Collection",
        handle: "block-test",
      });

      try {
        await page.goto(`/w/${organization.slug}/d/new`);

        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();

        await expect(page.getByText("Select a collection to embed its documents")).toBeVisible();

        await page.getByText("Block Test Collection").click();

        await expect(
          page.getByText("Block Test Collection", { exact: true }).first(),
        ).toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should filter collection block by collection", async ({ page, organization }) => {
      const collection1 = await createTestCollection(organization.id, {
        name: "Block Filter Collection 1",
        handle: "block-filter-1",
      });

      const collection2 = await createTestCollection(organization.id, {
        name: "Block Filter Collection 2",
        handle: "block-filter-2",
      });

      try {
        await page.goto(`/w/${organization.slug}/d/new`);

        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();

        await page.getByRole("button", { name: "Search for a collection" }).click();
        await page.getByPlaceholder("Search collections...").fill("Collection 2");

        await expect(page.getByText("Block Filter Collection 2")).toBeVisible();
        await expect(page.getByText("Block Filter Collection 1")).not.toBeVisible();
      } finally {
        await deleteTestCollection(collection1.id);
        await deleteTestCollection(collection2.id);
      }
    });

    test("should remove collection block from editor", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Remove Block Test",
        handle: "remove-block-test",
      });

      try {
        await page.goto(`/w/${organization.slug}/d/new`);

        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();
        await page.getByText("Remove Block Test").click();

        await expect(page.getByText("Remove Block Test", { exact: true }).first()).toBeVisible();

        await page.getByRole("button", { name: "Remove block" }).click();

        await expect(page.getByText("Remove Block Test", { exact: true })).not.toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe("external api", () => {
    test("should fetch collection documents via external API", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "API Test Collection",
        handle: "api-test",
        properties: [{ name: "category", type: "text", required: false, unique: false }],
      });

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "API Test Document",
        published: true,
        fieldValues: { category: "test" },
      });

      try {
        const response = await page.request.get(`/api/external/collections/api-test/documents`);

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data.documents).toHaveLength(1);
        expect(data.documents[0].title).toBe("API Test Document");
        expect(data.documents[0].fields.category).toBe("test");
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should filter collection documents via API", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "API Filter Collection",
        handle: "api-filter",
        properties: [{ name: "status", type: "text", required: false, unique: false }],
      });

      const { document: doc1 } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Active Document",
          published: true,
          fieldValues: { status: "active" },
        },
      );

      const { document: doc2 } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Draft Document",
          published: true,
          fieldValues: { status: "draft" },
        },
      );

      try {
        const response = await page.request.get(
          `/api/external/collections/api-filter/documents?filter[status]=active`,
        );

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data.documents).toHaveLength(1);
        expect(data.documents[0].title).toBe("Active Document");
      } finally {
        await deleteTestDocument(doc1.id);
        await deleteTestDocument(doc2.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should return 404 for non-existent collection", async ({ page }) => {
      const response = await page.request.get(`/api/external/collections/non-existent/documents`);

      expect(response.status()).toBe(404);
    });

    test("should fetch document by unique property value", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Unique Property Collection",
        handle: "unique-prop",
        properties: [{ name: "slug", type: "text", required: false, unique: true }],
      });

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "Unique Doc",
        published: true,
        fieldValues: { slug: "my-unique-slug" },
      });

      try {
        const response = await page.request.get(
          `/api/external/collections/documents/my-unique-slug`,
        );

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data.title).toBe("Unique Doc");
        expect(data.fields.slug).toBe("my-unique-slug");
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should fetch document by route", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Route API Collection",
        handle: "route-api",
        properties: [
          { name: "route", type: "text", required: true, unique: true },
          { name: "slug", type: "text", required: false, unique: false },
        ],
      });

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "Getting Started",
        published: true,
        fieldValues: { route: "/getting-started", slug: "getting-started" },
      });

      try {
        const response = await page.request.get(
          `/api/external/collections/route-api/routes/getting-started`,
        );

        expect(response.status()).toBe(200);

        const data = await response.json();
        expect(data.title).toBe("Getting Started");
        expect(data.path).toBe("/getting-started");
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should return 404 for non-existent route", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Missing Route Collection",
        handle: "missing-route",
        properties: [{ name: "route", type: "text", required: true, unique: true }],
      });

      try {
        const response = await page.request.get(
          `/api/external/collections/missing-route/routes/non-existent`,
        );

        expect(response.status()).toBe(404);
      } finally {
        await deleteTestCollection(collection.id);
      }
    });
  });
});
