// Pulumi entrypoint — imports all modules to register resources and exports stack outputs.

import { appDomain, apiDomain, assetsDomain, zeroDomain, eventsDomain } from "./src/config.js";
import { backendEcrRepoUrl, zeroEcrRepoUrl } from "./src/services.js";
import { webBucket, webDistribution } from "./src/web.js";

// dns.ts transitively imports everything (certificate, vpc, services, storage,
// events, lambdas, database, secrets, email, config) so all resources are
// registered by the time this module finishes loading.
import "./src/dns.js";

// ---------------------------------------------------------------------------
// Stack Outputs
// ---------------------------------------------------------------------------

export const appUrl = `https://${appDomain}`;
export const apiUrl = `https://${apiDomain}`;
export const assetsUrl = `https://${assetsDomain}`;
export const zeroUrl = `https://${zeroDomain}`;
export const eventsUrl = `https://${eventsDomain}`;
export { backendEcrRepoUrl, zeroEcrRepoUrl };
export const webBucketName = webBucket.id;
export const webDistributionId = webDistribution.id;
