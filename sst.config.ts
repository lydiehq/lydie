/// <reference path="./.sst/platform/config.d.ts" />
export default $config({
  app(input) {
    const useAwsProfile = !process.env.CI && !process.env.GITHUB_ACTIONS;

    return {
      name: "lydie",
      // protect: ["production"].includes(input?.stage),
      home: "aws",
      providers: {
        aws: {
          ...(useAwsProfile ? { profile: "lydie" } : {}),
          region: "us-east-1",
        },
        command: true,
      },
    };
  },
  async run() {
    await import("./infra/onboarding");
    await import("./infra/workspace-export");
    await import("./infra/backend");
    await import("./infra/web");
    await import("./infra/zero");
    await import("./infra/events");
    return {};
  },
});
