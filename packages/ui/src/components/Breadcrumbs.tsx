import type { BreadcrumbProps, BreadcrumbsProps, LinkProps } from "react-aria-components";
import {
  Breadcrumb as AriaBreadcrumb,
  Breadcrumbs as AriaBreadcrumbs,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { RightRegular } from "../icons/mingcute";
import { Link } from "./Link";
import { composeTailwindRenderProps, focusRingClass } from "./utils";

export function Breadcrumbs<T extends object>(props: BreadcrumbsProps<T>) {
  return <AriaBreadcrumbs {...props} className={twMerge("flex gap-1", props.className)} />;
}

export function Breadcrumb(props: BreadcrumbProps & Omit<LinkProps, "className">) {
  return (
    <AriaBreadcrumb
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        `flex items-center gap-1 rounded-xs ${focusRingClass}`,
      )}
    >
      <Link variant="secondary" {...props} />
      {props.href && <RightRegular className="w-3 h-3 text-gray-100" />}
    </AriaBreadcrumb>
  );
}
