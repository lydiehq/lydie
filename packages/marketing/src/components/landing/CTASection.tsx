import { ChevronRightRegular } from "@fluentui/react-icons";

import { Button } from "../generic/Button";
import { SectionHeader } from "./SectionHeader";

type Props = {
  title?: string;
  description?: string;
};

export function CTASection({
  title = "Ready to try it yourself?",
  description = "Create your first document in seconds. No credit card required.",
}: Props) {
  return (
    <div className="flex flex-col gap-y-6 p-16 items-center text-center">
      <SectionHeader title={title} description={description} centered />
      <Button href="https://app.lydie.co/auth" size="lg" intent="primary">
        <span>Get started for free</span>
        <ChevronRightRegular className="size-3.5 translate-y-px group-hover:translate-x-0.5 transition-transform duration-200" />
      </Button>
    </div>
  );
}
