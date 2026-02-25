import * as pulumi from "@pulumi/pulumi";

const cfg = new pulumi.Config();
const stack = pulumi.getStack();

// Domain configuration (all derived from base domain)
export const domainName = cfg.get("domainName") || "lydie.co";
export const appDomain = `app.${domainName}`;
export const apiDomain = `api.${domainName}`;
export const assetsDomain = `assets.${domainName}`;
export const zeroDomain = `zero.${domainName}`;
export const eventsDomain = `e.${domainName}`;

// Container configuration
export const backendCpu = cfg.getNumber("backendCpu") || 512;
export const backendMemory = cfg.getNumber("backendMemory") || 1024;
export const zeroCpu = cfg.getNumber("zeroCpu") || 1024;
export const zeroMemory = cfg.getNumber("zeroMemory") || 2048;

// Environment
export const isProduction = stack === "production";
export const stackName = stack;
