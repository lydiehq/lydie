import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { formatDistanceToNow } from "date-fns"

type Props = {
	editor: Editor
	lastSaved: Date
}

export function BottomBar({ editor, lastSaved }: Props) {
	const editorState = useEditorState({
		editor,
		selector: (state) => {
			return {
				wordCount: state.editor.storage.characterCount.words(),
				characterCount: state.editor.storage.characterCount.characters(),
			}
		},
	})

	return (
		<div className="border-t border-black/8 px-4 justify-between flex rounded-b-lg bg-surface">
			<div className="flex items-center">
				<span className="text-xs text-gray-400">
					Saved {formatDistanceToNow(lastSaved, { addSuffix: true })}
				</span>
			</div>
			<div className="flex gap-x-4 py-1">
				<span className="text-xs text-gray-500">Characters: {editorState.characterCount}</span>
				<span className="text-xs text-gray-500">Words: {editorState.wordCount}</span>
			</div>
		</div>
	)
}
