import { useRouteContext } from "@tanstack/react-router";

export const useZero = () => {
  const context = useRouteContext({
    from: "__root__",
  });

  return context.zero;
};
