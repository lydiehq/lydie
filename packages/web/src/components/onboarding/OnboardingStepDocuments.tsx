import { DocumentIcon, SearchIcon, PlusIcon } from "@/icons"
import { Checkbox } from "@/components/generic/Checkbox"
import { useOnboardingChecklist } from "@/hooks/use-onboarding-checklist"
import { useAtom } from "jotai"
import { commandMenuOpenAtom } from "@/stores/command-menu"
import { cva } from "cva"

const keyboardKeyStyles = cva({
  base: "inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium bg-gray-100 border border-gray-200 rounded shadow-sm",
})

export function OnboardingStepDocuments() {
  const { isChecked } = useOnboardingChecklist()
  const [isCommandMenuOpen] = useAtom(commandMenuOpenAtom)

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center gap-x-3">
        <div className="p-2 bg-gray-50 rounded-lg">
          <DocumentIcon className="size-4 text-gray-500" />
        </div>
        <span className="text-lg font-medium text-gray-900">Documents</span>
      </div>
      <p className="text-gray-700 text-sm/relaxed">
        Learn how to use the command menu and explore the powerful editor features through demo content.
      </p>
      <div className="flex flex-col gap-y-3">
        <Checkbox
          isSelected={isChecked("documents:open-command-menu")}
          onChange={() => { }}
          className="items-start"
          isDisabled={isCommandMenuOpen}
          isReadOnly
        >
          <div className="flex items-start gap-x-3">
            <div className="p-1.5 bg-gray-50 rounded mt-0.5">
              <SearchIcon className="size-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Open the command menu</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Press <kbd className={keyboardKeyStyles()}>⌘</kbd> +{" "}
                <kbd className={keyboardKeyStyles()}>K</kbd> to open the command menu - your central hub for
                navigation and actions
              </p>
            </div>
          </div>
        </Checkbox>
        <Checkbox
          isSelected={isChecked("documents:import-demo-content")}
          onChange={() => { }}
          className="items-start"
          isReadOnly
        >
          <div className="flex items-start gap-x-3">
            <div className="p-1.5 bg-gray-50 rounded mt-0.5">
              <PlusIcon className="size-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Use the Import Demo Content menu item</p>
              <p className="text-xs text-gray-600 mt-0.5">
                In the command menu, click the blue "Import Demo Content" button to add sample documents
              </p>
            </div>
          </div>
        </Checkbox>
        <Checkbox
          isSelected={isChecked("documents:explore-editor")}
          onChange={() => { }}
          className="items-start"
          isReadOnly
        >
          <div className="flex items-start gap-x-3">
            <div className="p-1.5 bg-gray-50 rounded mt-0.5">
              <DocumentIcon className="size-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Explore the editor</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Learn about internal links, custom properties, and rich formatting in the Welcome document
              </p>
            </div>
          </div>
        </Checkbox>
      </div>
    </div>
  )
}
