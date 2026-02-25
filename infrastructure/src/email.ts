import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { domainName, stackName } from "./config.js";
import { hostedZone } from "./certificate.js";

// SES Domain Identity
export const sesDomainIdentity = new aws.ses.DomainIdentity("lydie-ses", {
  domain: domainName,
});

// SES DKIM verification
export const sesDomainDkim = new aws.ses.DomainDkim("lydie-ses-dkim", {
  domain: sesDomainIdentity.domain,
});

// Create DKIM DNS records
sesDomainDkim.dkimTokens.apply((tokens) =>
  tokens.map(
    (token, index) =>
      new aws.route53.Record(`lydie-ses-dkim-${index}`, {
        zoneId: hostedZone.then((z) => z.zoneId),
        name: `${token}._domainkey.${domainName}`,
        type: "CNAME",
        records: [`${token}.dkim.amazonses.com`],
        ttl: 600,
      }),
  ),
);

// Mail From domain
export const sesMailFrom = new aws.ses.MailFrom("lydie-ses-mail-from", {
  domain: sesDomainIdentity.domain,
  mailFromDomain: `mail.${domainName}`,
});

// Mail From MX record
new aws.route53.Record("lydie-ses-mail-from-mx", {
  zoneId: hostedZone.then((z) => z.zoneId),
  name: `mail.${domainName}`,
  type: "MX",
  records: ["10 feedback-smtp.us-east-1.amazonses.com"],
  ttl: 600,
});

// Mail From SPF record
new aws.route53.Record("lydie-ses-mail-from-spf", {
  zoneId: hostedZone.then((z) => z.zoneId),
  name: `mail.${domainName}`,
  type: "TXT",
  records: ["v=spf1 include:amazonses.com ~all"],
  ttl: 600,
});

// Configuration Set for tracking
export const sesConfigSet = new aws.ses.ConfigurationSet("lydie-ses-config", {
  name: `lydie-${stackName}`,
});

// DMARC record
new aws.route53.Record("lydie-ses-dmarc", {
  zoneId: hostedZone.then((z) => z.zoneId),
  name: `_dmarc.${domainName}`,
  type: "TXT",
  records: ["v=DMARC1; p=quarantine; adkim=s; aspf=s;"],
  ttl: 600,
});

export const sesDomain = sesDomainIdentity.domain;
export const sesConfigSetName = sesConfigSet.name;
