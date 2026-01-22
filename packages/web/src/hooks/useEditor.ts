import { useAtomValue } from "jotai"
import { documentEditorAtom, titleEditorAtom } from "@/atoms/editor"

/**
 * Hook to access the current document editor instance from anywhere in the app.
 * Only components using this hook will re-render when the editor changes.
 * 
 * @returns The current document editor instance or null if not available
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const editor = useDocumentEditor()
 *   
 *   const handleBold = () => {
 *     editor?.chain().focus().toggleBold().run()
 *   }
 *   
 *   return <button onClick={handleBold}>Bold</button>
 * }
 * ```
 */
export function useDocumentEditor() {
  return useAtomValue(documentEditorAtom)
}

/**
 * Hook to access the current title editor instance from anywhere in the app.
 * Only components using this hook will re-render when the editor changes.
 * 
 * @returns The current title editor instance or null if not available
 */
export function useTitleEditor() {
  return useAtomValue(titleEditorAtom)
}
