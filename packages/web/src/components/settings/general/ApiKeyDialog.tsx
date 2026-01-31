import { CopyRegular, EyeOffRegular, EyeRegular } from "@fluentui/react-icons";
import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Heading } from "@lydie/ui/components/generic/Heading";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { DialogTrigger, Form } from "react-aria-components";

type ApiKeyDialogStep = "create" | "success";

type ApiKeyDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  step: ApiKeyDialogStep;
  apiKeyForm: any; // Form type from useAppForm is complex to type properly
  newApiKey: string;
  showKey: boolean;
  copied: boolean;
  onShowKeyChange: (show: boolean) => void;
  onCopyKey: (key: string) => void;
  onClose: () => void;
};

export function ApiKeyDialog({
  isOpen,
  onOpenChange,
  step,
  apiKeyForm,
  newApiKey,
  showKey,
  copied,
  onShowKeyChange,
  onCopyKey,
  onClose,
}: ApiKeyDialogProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal isDismissable>
        <Dialog>
          {step === "create" ? (
            <Form
              onSubmit={(e) => {
                e.preventDefault();
                apiKeyForm.handleSubmit();
              }}
            >
              <div className="p-4 flex flex-col gap-y-4">
                <Heading level={2}>Create API Key</Heading>
                <apiKeyForm.AppField
                  name="name"
                  children={(field: any) => (
                    <field.TextField
                      placeholder="e.g., Production API, Development Key"
                      isRequired
                    />
                  )}
                />
                <div className="flex justify-end gap-1.5">
                  <Button
                    intent="secondary"
                    onPress={() => {
                      onOpenChange(false);
                      apiKeyForm.reset();
                    }}
                    type="button"
                    size="sm"
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    type="submit"
                    isPending={apiKeyForm.state.isSubmitting}
                    isDisabled={apiKeyForm.state.isSubmitting}
                  >
                    {apiKeyForm.state.isSubmitting ? "Creating..." : "Create API Key"}
                  </Button>
                </div>
              </div>
            </Form>
          ) : (
            <div className="p-6">
              <Heading level={2} className="text-lg font-semibold mb-4">
                API Key Created Successfully
              </Heading>

              <div className="mb-6">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                  <p className="text-sm text-amber-800">
                    <strong>Important:</strong> This is the only time you will be able to see the
                    full API key. Make sure to copy it and store it securely before closing this
                    dialog.
                  </p>
                </div>

                <div className="relative">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border">
                    <code className="flex-1 font-mono text-sm break-all">
                      {showKey ? newApiKey : `${newApiKey.slice(0, 12)}${"•".repeat(24)}`}
                    </code>
                    <div className="flex gap-1">
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => onShowKeyChange(!showKey)}
                        className="px-2"
                      >
                        {showKey ? (
                          <EyeOffRegular className="size-4" />
                        ) : (
                          <EyeRegular className="size-4" />
                        )}
                      </Button>
                      <Button
                        intent="secondary"
                        size="sm"
                        onPress={() => onCopyKey(newApiKey)}
                        className="px-2"
                      >
                        <CopyRegular className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {copied && (
                    <div className="absolute -bottom-6 left-0 text-xs text-green-600">
                      Copied to clipboard!
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button onPress={onClose}>Done</Button>
              </div>
            </div>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
