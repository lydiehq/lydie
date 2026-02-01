import type { ReactNode } from "react";

type HeadingProps = {
  children?: ReactNode;
  className?: string;
};

export function H1({ children, className }: HeadingProps) {
  return (
    <h1
      className={`text-xl font-semibold text-gray-900 mt-4 mb-3 leading-tight ${className || ""}`}
    >
      {children}
    </h1>
  );
}

export function H2({ children, className }: HeadingProps) {
  return (
    <h2
      className={`text-lg font-semibold text-gray-800 mt-3 mb-2 leading-tight ${className || ""}`}
    >
      {children}
    </h2>
  );
}

export function H3({ children, className }: HeadingProps) {
  return (
    <h3
      className={`text-base font-semibold text-gray-800 mt-3 mb-2 leading-snug ${className || ""}`}
    >
      {children}
    </h3>
  );
}

export function H4({ children, className }: HeadingProps) {
  return (
    <h4
      className={`text-sm font-semibold text-gray-700 mt-2 mb-1.5 leading-snug ${className || ""}`}
    >
      {children}
    </h4>
  );
}

export function H5({ children, className }: HeadingProps) {
  return (
    <h5
      className={`text-xs font-semibold text-gray-600 mt-2 mb-1 uppercase tracking-wide ${className || ""}`}
    >
      {children}
    </h5>
  );
}

export function H6({ children, className }: HeadingProps) {
  return (
    <h6
      className={`text-xs font-medium text-gray-500 mt-2 mb-1 italic ${className || ""}`}
    >
      {children}
    </h6>
  );
}

export const streamdownHeadings = {
  h1: H1,
  h2: H2,
  h3: H3,
  h4: H4,
  h5: H5,
  h6: H6,
};
