/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "lydie",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
          // profile: "lydie-production",
        },
        command: true,
      },
    };
  },
  async run() {
    await import("./infra/embedding");
    await import("./infra/backend");
    await import("./infra/web");
    await import("./infra/zero");
    return {};
  },
});
