// oxlint-disable typescript/triple-slash-reference
/// <reference path="../.sst/platform/config.d.ts" />

export const eventsRouter =
  $app.stage === "production"
    ? new sst.aws.Router("EventsRouter", {
        domain: "e.lydie.co",
        // Custom cache policy to forward required headers and query strings
        transform: {
          cachePolicy: (args) => {
            args.name = "PostHogCachePolicy";
            args.parametersInCacheKeyAndForwardedToOrigin = {
              headersConfig: {
                headerBehavior: "whitelist",
                headers: {
                  items: ["Origin", "Authorization"],
                },
              },
              queryStringsConfig: {
                queryStringBehavior: "all",
              },
              cookiesConfig: {
                cookieBehavior: "none",
              },
            };
          },
        },
      })
    : undefined;

if (eventsRouter) {
  eventsRouter.route("*", "https://us.i.posthog.com");
  eventsRouter.route("/static/*", "https://us-assets.i.posthog.com/static");
  eventsRouter.route("/array/*", "https://us-assets.i.posthog.com/array");
}
