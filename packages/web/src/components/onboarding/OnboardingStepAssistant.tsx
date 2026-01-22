import { Checkbox } from "@/components/generic/Checkbox"
import { useFloatingAssistant } from "@/context/floating-assistant.context"
import { useOnboardingChecklist } from "@/hooks/use-onboarding-checklist"
import { useOrganization } from "@/context/organization.context"
import { useNavigate } from "@tanstack/react-router"
import { useQuery } from "@rocicorp/zero/react"
import { queries } from "@lydie/zero/queries"
import { BotRegular, FolderRegular, DocumentTextFilled, SparkleRegular } from "@fluentui/react-icons"

export function OnboardingStepAssistant() {
  const { open: openAssistant } = useFloatingAssistant()
  const { isChecked, setChecked } = useOnboardingChecklist()
  const { organization } = useOrganization()
  const navigate = useNavigate()

  const [documents] = useQuery(
    queries.documents.byUpdated({
      organizationId: organization.id,
    }),
  )

  const handleStepClick = async (
    checklistItem: "assistant:organize-documents" | "assistant:create-document" | "assistant:improve-document",
    prompt: string,
    documentId?: string,
  ) => {
    await setChecked(checklistItem, true)

    if (documentId) {
      navigate({
        to: "/w/$organizationSlug/$id",
        params: {
          organizationSlug: organization.slug,
          id: documentId,
        },
      })
    }

    openAssistant({ message: prompt })
  }

  const documentForStep3 = documents?.find(
    (doc) =>
      doc.title === "Project Apollo - Kickoff Notes" ||
      (doc.custom_fields &&
        typeof doc.custom_fields === "object" &&
        "isOnboarding" in doc.custom_fields &&
        doc.custom_fields.isOnboarding === "true"),
  )

  return (
    <div className="flex flex-col gap-y-6">
      <div className="flex items-center gap-x-3">
        <div className="p-2 bg-gray-50 rounded-lg">
          <BotRegular className="size-4 text-gray-500" />
        </div>
        <span className="text-lg font-medium text-gray-900">Assistant</span>
      </div>
      <p className="text-gray-700 text-sm/relaxed">
        The AI assistant can help you organize, create, and improve your documents. Try these tasks to see it in action.
      </p>
      <div className="flex flex-col gap-y-3">
        <Checkbox
          isSelected={isChecked("assistant:organize-documents")}
          onChange={() =>
            handleStepClick(
              "assistant:organize-documents",
              "Please help me organize these messy documents from the demo data",
            )
          }
          className="items-start"
        >
          <div className="flex items-start gap-x-3">
            <div className="p-1.5 bg-gray-50 rounded mt-0.5">
              <FolderRegular className="size-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Organize documents</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Ask the assistant to organize the messy demo documents
              </p>
            </div>
          </div>
        </Checkbox>
        <Checkbox
          isSelected={isChecked("assistant:create-document")}
          onChange={() =>
            handleStepClick(
              "assistant:create-document",
              "Please create a new document based on the information in my workspace",
            )
          }
          className="items-start"
        >
          <div className="flex items-start gap-x-3">
            <div className="p-1.5 bg-gray-50 rounded mt-0.5">
              <DocumentTextFilled className="size-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Create a new document</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Ask the assistant to create an original document from your workspace content
              </p>
            </div>
          </div>
        </Checkbox>
        <Checkbox
          isSelected={isChecked("assistant:improve-document")}
          onChange={() =>
            handleStepClick(
              "assistant:improve-document",
              "Please improve the introduction of this document",
              documentForStep3?.id,
            )
          }
          className="items-start"
        >
          <div className="flex items-start gap-x-3">
            <div className="p-1.5 bg-gray-50 rounded mt-0.5">
              <SparkleRegular className="size-4 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">Improve a document</p>
              <p className="text-xs text-gray-600 mt-0.5">
                Navigate to a document and ask the assistant to improve its introduction
              </p>
            </div>
          </div>
        </Checkbox>
      </div>
    </div>
  )
}
