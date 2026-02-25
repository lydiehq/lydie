import * as pulumi from "@pulumi/pulumi";

// ---------------------------------------------------------------------------
// Database credentials
//
// For production (AWS): set via Pulumi Config secrets:
//   pulumi config set --secret secrets:databaseUrl "postgresql://..."
//   pulumi config set --secret secrets:databaseUrlDirect "postgresql://..."
//
// These are injected into ECS task definitions as environment variables.
//
// To later automate via PlanetScale provider, install it:
//   cd infrastructure && pulumi package add terraform-provider planetscale/planetscale
//
// Then use PostgresBranchRole to generate credentials automatically.
// See config.ts for planetscaleOrg/planetscaleDatabase settings.
// ---------------------------------------------------------------------------

const cfg = new pulumi.Config("secrets");

export const databaseUrl = cfg.getSecret("databaseUrl") ?? pulumi.secret("NOT_CONFIGURED");
export const databaseUrlDirect = cfg.getSecret("databaseUrlDirect") ?? databaseUrl;
