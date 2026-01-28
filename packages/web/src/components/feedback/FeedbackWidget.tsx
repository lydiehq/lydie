import { ChatFilled } from "@fluentui/react-icons";
import { createId } from "@lydie/core/id";
import { mutators } from "@lydie/zero/mutators";
import { useState } from "react";
import { DialogTrigger, Form, Heading, Button as RACButton } from "react-aria-components";

import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { useZero } from "@/services/zero";

import { Button } from "@lydie/ui/components/generic/Button";
import { Dialog } from "@lydie/ui/components/generic/Dialog";
import { Modal } from "@lydie/ui/components/generic/Modal";
import { sidebarItemStyles, sidebarItemIconStyles } from "@lydie/ui/components/editor/styles";
import { Separator } from "@lydie/ui/components/layout/Separator";

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

  const zero = useZero();
  const { organization } = useOrganization();

  const form = useAppForm({
    defaultValues: {
      message: "",
    },
    onSubmit: async ({ value: values }) => {
      if (!organization) return;

      setSubmitStatus("idle");

      try {
        zero.mutate(
          mutators.feedback.create({
            id: createId(),
            message: values.message.trim(),
            metadata: {
              url: window.location.href,
              userAgent: navigator.userAgent,
              timestamp: new Date().toISOString(),
            },
            organizationId: organization.id,
          }),
        );

        setSubmitStatus("success");

        // Auto-close after success
        setTimeout(() => {
          setIsOpen(false);
          setSubmitStatus("idle");
          form.reset();
        }, 2000);
      } catch (error) {
        console.error("Failed to submit feedback:", error);
        setSubmitStatus("error");
      }
    },
  });

  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
      <RACButton className={sidebarItemStyles({ className: "px-1.5 inline-block" })}>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <ChatFilled className={sidebarItemIconStyles({ className: "size-4" })} />
          <span className="truncate text-start flex-1">Send feedback</span>
        </div>
      </RACButton>
      <Modal isDismissable>
        <Dialog>
          {({ close }) => (
            <>
              <div className="p-3">
                <Heading slot="title" className="text-sm font-medium text-gray-700">
                  Send Feedback
                </Heading>
              </div>
              <Separator />
              <Form
                onSubmit={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  form.handleSubmit();
                }}
                className="flex flex-col"
              >
                <div className="flex flex-col gap-4 p-3">
                  <form.AppField
                    name="message"
                    validators={{
                      onChange: ({ value }) => {
                        if (!value || !value.trim()) {
                          return "Message is required";
                        }
                        return undefined;
                      },
                    }}
                    children={(field) => (
                      <field.TextField
                        label="Message"
                        textarea
                        placeholder="Tell us what you think or how we can help..."
                      />
                    )}
                  />

                  {submitStatus === "success" && (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                      Thank you! Your feedback has been submitted.
                    </div>
                  )}

                  {submitStatus === "error" && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                      Failed to submit. Please try again.
                    </div>
                  )}
                </div>
                <Separator />
                <div className="flex gap-3 justify-end p-3">
                  <Button intent="secondary" onPress={close} isDisabled={form.state.isSubmitting}>
                    Cancel
                  </Button>
                  <form.Subscribe
                    selector={(state) => [state.canSubmit, state.isSubmitting]}
                    children={([canSubmit, isSubmitting]) => (
                      <Button
                        type="submit"
                        intent="primary"
                        isDisabled={!canSubmit || isSubmitting}
                      >
                        {isSubmitting ? "Sending..." : "Send"}
                      </Button>
                    )}
                  />
                </div>
              </Form>
            </>
          )}
        </Dialog>
      </Modal>
    </DialogTrigger>
  );
}
