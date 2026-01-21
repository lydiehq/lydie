import { useState } from "react";
import { Button } from "../generic/Button";
import { DialogTrigger, Form } from "react-aria-components";
import { Dialog } from "../generic/Dialog";
import { Modal } from "../generic/Modal";
import { RadioGroup, Radio } from "../generic/RadioGroup";
import { MessageCircleIcon, LifeBuoyIcon, XIcon } from "@/icons";
import { useZero } from "@/services/zero";
import { createId } from "@lydie/core/id";
import { useOrganization } from "@/context/organization.context";
import { useAppForm } from "@/hooks/use-app-form";
import { mutators } from "@lydie/zero/mutators";

export function FeedbackWidget() {
    const [isOpen, setIsOpen] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");

    const zero = useZero();
    const { organization } = useOrganization();

    const form = useAppForm({
        defaultValues: {
            type: "feedback" as "feedback" | "help",
            message: "",
        },
        onSubmit: async ({ value: values }) => {
            if (!organization) return;

            setSubmitStatus("idle");

            try {
                zero.mutate(
                    mutators.feedback.create({
                        id: createId(),
                        type: values.type,
                        message: values.message.trim(),
                        metadata: {
                            url: window.location.href,
                            userAgent: navigator.userAgent,
                            timestamp: new Date().toISOString(),
                        },
                        organizationId: organization.id,
                    })
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
        validators: {
            onChange: ({ value }) => {
                if (!value.message.trim()) {
                    return "Message is required";
                }
                return undefined;
            }
        }
    });

    return (
        <DialogTrigger isOpen={isOpen} onOpenChange={setIsOpen}>
            <Button
                intent="secondary"
                size="sm"
                className="w-full flex items-center justify-start gap-x-2"
            >
                <MessageCircleIcon className="size-4" />
                <span>Send Feedback</span>
            </Button>
            <Modal isDismissable>
                <Dialog className="p-6 outline-none">
                    {({ close }) => (
                        <>
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-lg font-semibold">Send Feedback</h2>
                                <Button
                                    intent="ghost"
                                    size="sm"
                                    onPress={close}
                                    aria-label="Close"
                                    className="p-1 text-gray-500 hover:text-gray-900"
                                >
                                    <XIcon className="size-4" />
                                </Button>
                            </div>

                            <Form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    form.handleSubmit();
                                }}
                                className="flex flex-col gap-4"
                            >
                                <form.AppField
                                    name="type"
                                    children={(field) => (
                                        <RadioGroup
                                            label="Type"
                                            value={field.state.value}
                                            onChange={(val) => field.handleChange(val as "feedback" | "help")}
                                            orientation="horizontal"
                                        >
                                            <Radio value="feedback">
                                                <div className="flex items-center gap-1.5">
                                                    <MessageCircleIcon className="size-4 text-gray-600" />
                                                    <span>Feedback</span>
                                                </div>
                                            </Radio>
                                            <Radio value="help">
                                                <div className="flex items-center gap-1.5">
                                                    <LifeBuoyIcon className="size-4 text-gray-600" />
                                                    <span>Help Request</span>
                                                </div>
                                            </Radio>
                                        </RadioGroup>
                                    )}
                                />

                                <form.AppField
                                    name="message"
                                    children={(field) => (
                                        <field.TextField
                                            label="Message"
                                            textarea
                                            placeholder={
                                                form.getFieldValue("type") === "feedback"
                                                    ? "Tell us what you think..."
                                                    : "How can we help you?"
                                            }
                                            className="w-full"
                                        />
                                    )}
                                />

                                {submitStatus === "success" && (
                                    <div className="p-3 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                                        ✓ Thank you! Your {form.getFieldValue("type")} has been submitted.
                                    </div>
                                )}

                                {submitStatus === "error" && (
                                    <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                                        Failed to submit. Please try again.
                                    </div>
                                )}

                                <div className="flex gap-3 justify-end mt-2">
                                    <Button
                                        intent="secondary"
                                        onPress={close}
                                        isDisabled={form.state.isSubmitting}
                                    >
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
