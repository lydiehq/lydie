import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ProposedChangeOptions {
  onAccept?: () => void;
  onReject?: () => void;
}

export interface ProposedChangeStorage {
  from: number | null;
  to: number | null;
  proposedHTML: string;
  isActive: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    proposedChange: {
      /**
       * Show a proposed change in the document
       */
      showProposedChange: (from: number, to: number, proposedHTML: string) => ReturnType;
      /**
       * Clear the proposed change
       */
      clearProposedChange: () => ReturnType;
      /**
       * Accept the proposed change
       */
      acceptProposedChange: () => ReturnType;
      /**
       * Reject the proposed change
       */
      rejectProposedChange: () => ReturnType;
    };
  }
}

export const ProposedChangePluginKey = new PluginKey("proposedChange");

export const ProposedChange = Extension.create<ProposedChangeOptions, ProposedChangeStorage>({
  name: "proposedChange",

  addOptions() {
    return {
      onAccept: undefined,
      onReject: undefined,
    };
  },

  addStorage() {
    return {
      from: null,
      to: null,
      proposedHTML: "",
      isActive: false,
    };
  },

  addCommands() {
    return {
      showProposedChange: (from: number, to: number, proposedHTML: string) => (): boolean => {
        this.storage.from = from;
        this.storage.to = to;
        this.storage.proposedHTML = proposedHTML;
        this.storage.isActive = true;
        return true;
      },

      clearProposedChange: () => (): boolean => {
        this.storage.from = null;
        this.storage.to = null;
        this.storage.proposedHTML = "";
        this.storage.isActive = false;
        return true;
      },

      acceptProposedChange:
        () =>
        ({ chain }: { chain: () => any }): boolean => {
          const { from, to, proposedHTML } = this.storage;

          if (from === null || to === null || !proposedHTML) {
            return false;
          }

          try {
            // Clear the storage first to remove decorations
            this.storage.from = null;
            this.storage.to = null;
            this.storage.proposedHTML = "";
            this.storage.isActive = false;

            // Apply the change using collaborative-friendly commands
            chain().deleteRange({ from, to }).insertContentAt(from, proposedHTML).run();

            // Call the callback if provided
            this.options.onAccept?.();

            return true;
          } catch (error) {
            console.error("Failed to accept proposed change:", error);
            return false;
          }
        },

      rejectProposedChange: () => (): boolean => {
        // Clear the proposed change without applying
        this.storage.from = null;
        this.storage.to = null;
        this.storage.proposedHTML = "";
        this.storage.isActive = false;

        // Call the callback if provided
        this.options.onReject?.();

        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const extension = this;

    return [
      new Plugin({
        key: ProposedChangePluginKey,
        props: {
          decorations(state) {
            const { from, to, isActive, proposedHTML } = extension.storage;

            if (!isActive || from === null || to === null) {
              return DecorationSet.empty;
            }

            const decorations: Decoration[] = [];

            // Add highlight decoration for the range to be replaced
            decorations.push(
              Decoration.inline(from, to, {
                class: "proposed-change-deletion",
                style:
                  "background-color: rgba(239, 68, 68, 0.15); text-decoration: line-through; text-decoration-color: rgba(239, 68, 68, 0.5); border-radius: 2px;",
              }),
            );

            // Add a widget decoration after the range to show what will replace it
            // Use a wrapper span to ensure the content is properly contained and styled
            const widget = document.createElement("span");
            widget.className = "proposed-change-insertion";
            widget.setAttribute("data-proposed-change", "true");
            widget.style.cssText = `
              background-color: rgba(34, 197, 94, 0.15) !important;
              border-radius: 2px;
              padding: 1px 3px;
              color: inherit;
              display: inline;
            `;

            // Create a container for the HTML content
            const contentContainer = document.createElement("span");
            contentContainer.style.cssText = `
              background-color: rgba(34, 197, 94, 0.15) !important;
            `;
            contentContainer.innerHTML = proposedHTML;
            widget.appendChild(contentContainer);

            decorations.push(Decoration.widget(to, () => widget, { side: 1 }));

            // Add a decoration at the start of the range for the action buttons
            const buttonWidget = document.createElement("span");
            buttonWidget.className = "proposed-change-actions";
            buttonWidget.style.cssText = `
              position: absolute;
              transform: translateY(-100%);
              margin-top: -4px;
              display: flex;
              gap: 4px;
              z-index: 50;
              background: white;
              padding: 4px 8px;
              border-radius: 6px;
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
              border: 1px solid #e5e7eb;
              font-size: 12px;
              align-items: center;
            `;

            // Accept button
            const acceptBtn = document.createElement("button");
            acceptBtn.textContent = "Accept";
            acceptBtn.style.cssText = `
              background: #10b981;
              color: white;
              border: none;
              padding: 4px 12px;
              border-radius: 4px;
              cursor: pointer;
              font-weight: 500;
              white-space: nowrap;
            `;
            acceptBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              // Use setTimeout to avoid transaction conflicts
              setTimeout(() => {
                extension.editor.commands.acceptProposedChange();
              }, 0);
            };

            // Reject button
            const rejectBtn = document.createElement("button");
            rejectBtn.textContent = "Reject";
            rejectBtn.style.cssText = `
              background: transparent;
              color: #6b7280;
              border: 1px solid #e5e7eb;
              padding: 4px 12px;
              border-radius: 4px;
              cursor: pointer;
              font-weight: 500;
              white-space: nowrap;
            `;
            rejectBtn.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              setTimeout(() => {
                extension.editor.commands.rejectProposedChange();
              }, 0);
            };

            // Label
            const label = document.createElement("span");
            label.textContent = "Proposed change:";
            label.style.cssText = `
              color: #6b7280;
              margin-right: 8px;
              font-weight: 500;
              white-space: nowrap;
            `;

            buttonWidget.appendChild(label);
            buttonWidget.appendChild(acceptBtn);
            buttonWidget.appendChild(rejectBtn);

            decorations.push(Decoration.widget(from, () => buttonWidget, { side: -1 }));

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export default ProposedChange;
