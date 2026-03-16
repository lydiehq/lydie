import type { Locator, Page } from "@playwright/test";

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

    test.skip("should create a new collection from sidebar", async ({ page, organization }) => {
      await page.goto(`/w/${organization.slug}`);

      await page.getByRole("button", { name: "New Collection", exact: true }).click();

      await expect(page).toHaveURL(/\/collections\//);
      // Wait for Zero sync to populate the collection data
      await expect(page.getByRole("textbox", { name: "Collection name" })).toBeVisible({
        timeout: 10000,
      });
      // The collection name should be set (could be "Untitled Collection" or already synced)
      const nameInput = page.getByRole("textbox", { name: "Collection name" });
      await expect(nameInput).not.toHaveValue("");
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
        await expect(page.getByRole("textbox", { name: "Collection name" })).toHaveValue(
          "Navigation Test Collection",
        );
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should not render collection entries as nested sidebar tree", async ({
      page,
      organization,
    }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Flat Sidebar Collection",
        handle: "flat-sidebar-collection",
        properties: [
          { name: "slug", type: "text", required: false, unique: true },
          {
            name: "parent",
            type: "relation",
            required: false,
            unique: false,
            relation: { targetCollectionId: "self" },
          },
        ],
      });

      const { document: parentDocument } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Nested Parent Entry",
          published: true,
          fieldValues: { slug: "parent", parent: null },
        },
      );

      const { document: childDocument } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Nested Child Entry",
          published: true,
          fieldValues: { slug: "child", parent: parentDocument.id },
        },
      );

      try {
        await page.goto(`/w/${organization.slug}`);

        await expect(page.getByText("Flat Sidebar Collection")).toBeVisible();
        // Documents should not appear in the Collections section of the sidebar
        const collectionsGrid = page.getByRole("grid", { name: "Collections" });
        await expect(collectionsGrid.getByText("Nested Parent Entry")).not.toBeVisible();
        await expect(collectionsGrid.getByText("Nested Child Entry")).not.toBeVisible();
      } finally {
        await deleteTestDocument(childDocument.id);
        await deleteTestDocument(parentDocument.id);
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
            options: [
              { id: "opt_draft", label: "draft", order: 0 },
              { id: "opt_published", label: "published", order: 1 },
            ],
          },
        ],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await expect(page.getByRole("textbox", { name: "Collection name" })).toHaveValue(
          "Details Test Collection",
        );
        await expect(page.getByText("/details-test")).toBeVisible();
        await expect(page.getByText("Manage reusable views for this collection.")).toHaveCount(0);
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should rename a view from the view tab menu", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "View Rename Test",
        handle: "view-rename-test",
        properties: [
          {
            name: "status",
            type: "status",
            required: false,
            unique: false,
            options: [
              {
                id: "status_backlog",
                label: "Backlog",
                color: "gray",
                order: 0,
                stage: "NOT_STARTED",
              },
              {
                id: "status_done",
                label: "Done",
                color: "green",
                order: 1,
                stage: "COMPLETE",
              },
            ],
          },
        ],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await createKanbanView(page, "Roadmap");

        await page.getByRole("button", { name: "Open Roadmap view menu" }).click();
        await page.getByRole("menuitem", { name: "Edit view settings" }).click();
        await page.getByLabel(/^Name$/).fill("Sprint Board");
        await page.getByLabel("Filter field").selectOption("status");
        await page.getByLabel("Filter value").fill("active");
        await page.getByRole("button", { name: "Save view" }).click();
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await page.reload();

        await expect(
          page.getByRole("button", { name: /^Sprint Board\s+kanban$/i }),
        ).toBeVisible();
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
        await nameInput.blur();

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
        // Navigate to collection page first to ensure data is synced
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);
        await expect(page.getByRole("textbox", { name: "Collection name" })).toBeVisible();

        // Then navigate to settings page
        await page.goto(`/w/${organization.slug}/collections/${collection.id}/settings`);

        // Wait for settings page to load
        const handleInput = page.getByRole("textbox", { name: "Handle" });
        await expect(handleInput).toBeVisible({ timeout: 10000 });
        await handleInput.fill("new-handle");

        await page.getByRole("button", { name: "Save" }).click();

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

      // Navigate to collection page first to ensure data is synced
      await page.goto(`/w/${organization.slug}/collections/${collection.id}`);
      await expect(page.getByRole("textbox", { name: "Collection name" })).toBeVisible();

      // Then navigate to settings page
      await page.goto(`/w/${organization.slug}/collections/${collection.id}/settings`);

      // Wait for delete button to be visible
      const deleteButton = page.getByRole("button", { name: "Delete collection" });
      await expect(deleteButton).toBeVisible({ timeout: 10000 });

      page.on("dialog", (dialog) => dialog.accept());
      await deleteButton.click();

      await expect(page).toHaveURL(`/w/${organization.slug}`);
      await expect(page.getByText("Delete Test Collection")).not.toBeVisible();
    });

    test("should delete referenced collection and disconnect collection view blocks", async ({
      page,
      organization,
    }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Referenced Delete Collection",
        handle: "referenced-delete-test",
      });

      const editorDocument = await createEditorDocument(page, organization.slug, {
        title: "Referenced Collection Block Document",
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);
        await createKanbanView(page, "Board");

        await page.goto(`/w/${organization.slug}/${editorDocument.id}`);
        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();

        const collectionSearch = page.getByPlaceholder("Search collections...");
        await expect(collectionSearch).toBeVisible();
        await collectionSearch.fill(collection.name);
        const escapedCollectionName = collection.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await page
          .getByRole("button", { name: new RegExp(`^${escapedCollectionName}(?:\\s|$)`, "i") })
          .first()
          .click();

        await page.getByRole("button", { name: /^Board\s+kanban$/i }).click();
        await expect(page.getByText("Referenced Delete Collection").first()).toBeVisible();

        await page.goto(`/w/${organization.slug}/collections/${collection.id}/settings`);

        let confirmMessage = "";
        page.once("dialog", async (dialog) => {
          confirmMessage = dialog.message();
          await dialog.accept();
        });

        await page.getByRole("button", { name: "Delete collection", exact: true }).click();
        await expect(page).toHaveURL(`/w/${organization.slug}`);

        expect(confirmMessage).toContain("referenced by 1 view block");
        expect(confirmMessage).toContain("Referenced in:");
        expect(confirmMessage).toContain("Referenced Collection Block Document");

        await page.goto(`/w/${organization.slug}/${editorDocument.id}`);
        await expect(page.getByText("Create your new collection")).toBeVisible({ timeout: 15000 });
      } finally {
        await deleteTestDocument(editorDocument.id);
        await deleteTestCollection(collection.id);
      }
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

        // Click the "+ Add property" button in the table header
        await page.getByRole("button", { name: "+ Add property" }).click();
        await page.getByPlaceholder("e.g., status, priority, dueDate").fill("Category");
        await page.locator("#collection-property-type").selectOption("text");
        // Use exact match to avoid conflict with the trigger button
        await page.getByRole("button", { name: "Add Property", exact: true }).click();

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

        // Properties are displayed as column headers in the table
        const propertyHeader = page.getByRole("columnheader", { name: "tempField" });
        await expect(propertyHeader).toBeVisible();

        // Open the column menu and delete the property
        await propertyHeader.getByRole("button", { name: "Open tempField column menu" }).click();
        await page.getByRole("menuitem", { name: "Delete property" }).click();
        await page.getByRole("button", { name: "Confirm" }).click();

        // Wait for the property to be removed
        await expect(propertyHeader).not.toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });

    test("should add a self relation property", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Relation Property Collection",
        handle: "relation-property",
        properties: [],
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await page.getByRole("button", { name: "+ Add property" }).click();
        await page.locator("#collection-property-name").fill("parent");
        await page.locator("#collection-property-type").selectOption("relation");
        await page.locator("#collection-property-relation-target").selectOption("self");
        await page.getByRole("button", { name: "Add Property", exact: true }).click();

        await expect(page.getByRole("columnheader", { name: "parent" })).toBeVisible();
      } finally {
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe("collection entries", () => {
    test.skip("should create a new document in collection", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Entry Test Collection",
        handle: "entry-test",
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await page.getByRole("button", { name: "+ New entry", exact: true }).click();

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

        // Find the cell by looking for the row with the document title, then find the priority column cell
        const row = page.locator("tr").filter({ hasText: "Edit Test Document" }).first();
        const cell = row.locator("td").nth(2); // priority is the 3rd column (after select and title)

        // Verify initial value
        await expect(cell).toContainText("low");

        // Click to enter edit mode
        await cell.click();

        // Find the input that appears and fill it
        const input = cell.locator('input[type="text"]');
        await input.fill("high");
        await input.press("Enter");

        // Verify the updated value
        await expect(cell).toContainText("high");
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

  test.describe("kanban status labels", () => {
    test("should edit status labels in collection page kanban view", async ({ page, organization }) => {
      const initialLabel = `Queue ${Date.now()}`;
      const nextLabel = `${initialLabel} Updated`;
      const collection = await createTestCollection(organization.id, {
        name: "Kanban Label Route Test",
        handle: `kanban-label-route-${Date.now()}`,
        properties: [
          {
            name: "status",
            type: "status",
            required: false,
            unique: false,
            options: [
              {
                id: "status_queue",
                label: initialLabel,
                color: "gray",
                order: 0,
                stage: "NOT_STARTED",
              },
              {
                id: "status_done",
                label: "Done",
                color: "green",
                order: 1,
                stage: "COMPLETE",
              },
            ],
          },
        ],
      });

      const { document } = await createTestCollectionDocument(organization.id, collection.id, {
        title: "Route Kanban Label Document",
        fieldValues: { status: "status_queue" },
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);

        await createKanbanView(page, "Board");

        await renameKanbanColumn(page, initialLabel, nextLabel);
        await page.reload();

        await expect(page.getByRole("button", { name: nextLabel })).toBeVisible();
      } finally {
        await deleteTestDocument(document.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should edit status labels in embedded collection kanban view", async ({ page, organization }) => {
      const initialLabel = `Backlog ${Date.now()}`;
      const nextLabel = `${initialLabel} Updated`;
      const collection = await createTestCollection(organization.id, {
        name: "Kanban Label Block Test",
        handle: `kanban-label-block-${Date.now()}`,
        properties: [
          {
            name: "status",
            type: "status",
            required: false,
            unique: false,
            options: [
              {
                id: "status_backlog",
                label: initialLabel,
                color: "gray",
                order: 0,
                stage: "NOT_STARTED",
              },
              {
                id: "status_progress",
                label: "In progress",
                color: "blue",
                order: 1,
                stage: "IN_PROGRESS",
              },
            ],
          },
        ],
      });

      const { document: collectionDocument } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Block Kanban Label Document",
          fieldValues: { status: "status_backlog" },
        },
      );

      const editorDocument = await createEditorDocument(page, organization.slug, {
        title: "Collection Block Kanban Label Test",
      });

      try {
        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);
        await createKanbanView(page, "Board");

        await page.goto(`/w/${organization.slug}/${editorDocument.id}`);

        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();

        const collectionSearch = page.getByPlaceholder("Search collections...");
        await expect(collectionSearch).toBeVisible();
        await collectionSearch.fill(collection.name);
        const escapedCollectionName = collection.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        await page
          .getByRole("button", { name: new RegExp(`^${escapedCollectionName}(?:\\s|$)`, "i") })
          .first()
          .click();

        const boardKanbanView = page.getByRole("button", { name: /^Board\s+kanban$/i });
        await expect(boardKanbanView).toBeVisible();
        await boardKanbanView.click();

        const block = page.locator("[data-doc-widget]").filter({ hasText: collection.name }).first();
        await renameKanbanColumn(block, initialLabel, nextLabel);

        await page.goto(`/w/${organization.slug}/collections/${collection.id}`);
        await expect(page.getByRole("button", { name: nextLabel })).toBeVisible();
      } finally {
        await deleteTestDocument(editorDocument.id);
        await deleteTestDocument(collectionDocument.id);
        await deleteTestCollection(collection.id);
      }
    });
  });

  test.describe.skip("collection block", () => {
    test("should insert collection block in editor", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Block Test Collection",
        handle: "block-test",
      });

      const { document: collectionDocument } = await createTestCollectionDocument(
        organization.id,
        collection.id,
        {
          title: "Block Test Entry",
          published: true,
        },
      );

      const editorDocument = await createEditorDocument(page, organization.slug, {
        title: "Collection Block Insert Test",
      });

      try {
        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();

        await expect(page.getByText("Select a collection to embed its documents")).toBeVisible();

        await page.getByText("Block Test Collection").click();

        await expect(
          page.getByText("Block Test Collection", { exact: true }).first(),
        ).toBeVisible();
        await expect(page.getByText("Block Test Entry")).toBeVisible();
      } finally {
        await deleteTestDocument(editorDocument.id);
        await deleteTestDocument(collectionDocument.id);
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

      const editorDocument = await createEditorDocument(page, organization.slug, {
        title: "Collection Block Filter Test",
      });

      try {
        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();

        await page.getByRole("button", { name: "Search for a collection" }).click();
        await page.getByPlaceholder("Search collections...").fill("Collection 2");

        await expect(page.getByText("Block Filter Collection 2")).toBeVisible();
        await expect(page.getByText("Block Filter Collection 1")).not.toBeVisible();
      } finally {
        await deleteTestDocument(editorDocument.id);
        await deleteTestCollection(collection1.id);
        await deleteTestCollection(collection2.id);
      }
    });

    test("should remove collection block from editor", async ({ page, organization }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Remove Block Test",
        handle: "remove-block-test",
      });

      const editorDocument = await createEditorDocument(page, organization.slug, {
        title: "Collection Block Remove Test",
      });

      try {
        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();
        await page.getByText("Remove Block Test").click();

        await expect(page.getByText("Remove Block Test", { exact: true }).first()).toBeVisible();

        await page.getByRole("button", { name: "Remove block" }).click();

        await expect(page.getByText("Remove Block Test", { exact: true })).not.toBeVisible();
      } finally {
        await deleteTestDocument(editorDocument.id);
        await deleteTestCollection(collection.id);
      }
    });

    test("should add relation property from embedded collection block", async ({
      page,
      organization,
    }) => {
      const collection = await createTestCollection(organization.id, {
        name: "Block Relation Property",
        handle: "block-relation-property",
        properties: [],
      });

      const editorDocument = await createEditorDocument(page, organization.slug, {
        title: "Collection Block Relation Property Test",
      });

      try {
        await page.locator("[data-testid='editor-content']").click();
        await page.keyboard.type("/collection");
        await page.getByText("Collection View").click();
        await page.getByText("Block Relation Property").click();

        await page.getByRole("button", { name: "+ Add property" }).click();
        await page.locator("#collection-property-name").fill("parent");
        await page.locator("#collection-property-type").selectOption("relation");
        await page.locator("#collection-property-relation-target").selectOption("self");
        await page.getByRole("button", { name: "Add Property" }).click();

        await expect(page.getByRole("columnheader", { name: "PARENT" })).toBeVisible();
      } finally {
        await deleteTestDocument(editorDocument.id);
        await deleteTestCollection(collection.id);
      }
    });
  });

});

async function createEditorDocument(page: Page, organizationSlug: string, options: { title: string }) {
  await page.goto(`/w/${organizationSlug}`);
  await page.getByRole("button", { name: "Create new document" }).click();

  const titleEditor = page.getByLabel("Document title").locator('[contenteditable="true"]').first();
  await expect(titleEditor).toBeVisible({ timeout: 10000 });
  await titleEditor.click();
  await titleEditor.fill(options.title);
  await titleEditor.blur();

  const match = page.url().match(/\/w\/[^/]+\/([a-zA-Z0-9_-]+)/);
  if (!match) {
    throw new Error(`Failed to parse document ID from URL: ${page.url()}`);
  }

  return {
    id: match[1],
  };
}

async function createKanbanView(page: Page, viewName: string): Promise<void> {
  await page.getByRole("button", { name: "New view" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/^Name$/).fill(viewName);
  await dialog.getByRole("combobox").first().selectOption("kanban");
  await dialog.getByRole("button", { name: "Save view" }).click();
  const escapedViewName = viewName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await page
    .getByRole("button", { name: new RegExp(`^${escapedViewName}\\s+kanban$`, "i") })
    .click();

  const unsupportedState = page.getByText("Kanban requires a `status` or `select` property with options.");
  const emptyState = page.getByText("Drop cards here").first();
  const kanbanList = page.getByRole("listbox").first();

  if ((await unsupportedState.count()) > 0) {
    await expect(unsupportedState).toBeVisible();
    return;
  }

  await expect(kanbanList).toBeVisible();
  if ((await emptyState.count()) > 0) {
    await expect(emptyState).toBeVisible();
  }
}

async function renameKanbanColumn(
  container: Page | Locator,
  currentLabel: string,
  nextLabel: string,
): Promise<void> {
  await container.getByRole("button", { name: currentLabel }).first().click();
  const nameInput = container.getByRole("textbox", { name: "Edit column name" }).first();
  await nameInput.fill(nextLabel);
  await nameInput.press("Enter");
  await expect(container.getByRole("button", { name: nextLabel }).first()).toBeVisible({
    timeout: 10000,
  });
}
