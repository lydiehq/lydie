import { atom } from "jotai"

export type CommandMenuState = {
	isOpen: boolean
	initialPage?: string
}

export const commandMenuStateAtom = atom<CommandMenuState>({
	isOpen: false,
	initialPage: undefined,
})

// Helper atoms for easier access
export const commandMenuOpenAtom = atom(
	(get) => get(commandMenuStateAtom).isOpen,
	(get, set, isOpen: boolean) => {
		set(commandMenuStateAtom, {
			...get(commandMenuStateAtom),
			isOpen,
			// Reset initialPage when closing
			initialPage: isOpen ? get(commandMenuStateAtom).initialPage : undefined,
		})
	},
)

export const commandMenuInitialPageAtom = atom(
	(get) => get(commandMenuStateAtom).initialPage,
	(get, set, initialPage: string | undefined) => {
		set(commandMenuStateAtom, {
			...get(commandMenuStateAtom),
			initialPage,
		})
	},
)
