import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import { domainName, stackName } from "./config.js";

// Look up the Route53 hosted zone
export const hostedZone = aws.route53.getZone({ name: domainName });

// ACM Certificate (wildcard + apex)
export const certificate = new aws.acm.Certificate("lydie-cert", {
  domainName: domainName,
  subjectAlternativeNames: [`*.${domainName}`],
  validationMethod: "DNS",
  tags: { Name: `lydie-cert-${stackName}` },
});

// DNS validation records
const certValidationRecords = certificate.domainValidationOptions.apply((options) =>
  options.map(
    (option, index) =>
      new aws.route53.Record(`lydie-cert-validation-${index}`, {
        zoneId: hostedZone.then((z) => z.zoneId),
        name: option.resourceRecordName,
        type: option.resourceRecordType,
        records: [option.resourceRecordValue],
        ttl: 60,
      }),
  ),
);

// Wait for certificate validation
export const certValidation = new aws.acm.CertificateValidation("lydie-cert-validation", {
  certificateArn: certificate.arn,
  validationRecordFqdns: certValidationRecords.apply((records) => records.map((r) => r.fqdn)),
});

export const certificateArn = certValidation.certificateArn;
