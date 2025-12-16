/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    return {
      name: "lydie",
      // protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          region: "us-east-1",
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
