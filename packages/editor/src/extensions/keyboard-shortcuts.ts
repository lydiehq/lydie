import { Extension } from "@tiptap/core"

export interface KeyboardShortcutOptions {
	onAddLink?: () => void
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		keyboardShortcuts: {
			openLinkDialog: () => ReturnType
		}
	}
}

export const KeyboardShortcutExtension = Extension.create<KeyboardShortcutOptions>({
	name: "keyboardShortcuts",

	addOptions() {
		return {
			onAddLink: undefined,
		}
	},

	addCommands() {
		return {
			openLinkDialog: () => () => {
				this.options.onAddLink?.()
				return true
			},
		}
	},
})
