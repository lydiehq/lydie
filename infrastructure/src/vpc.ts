import * as awsx from "@pulumi/awsx";

import { stackName } from "./config.js";

export const vpc = new awsx.ec2.Vpc(`lydie-vpc-${stackName}`, {
  numberOfAvailabilityZones: 2,
  natGateways: { strategy: awsx.ec2.NatGatewayStrategy.Single },
  tags: { Name: `lydie-vpc-${stackName}` },
});

export const vpcId = vpc.vpcId;
export const publicSubnetIds = vpc.publicSubnetIds;
export const privateSubnetIds = vpc.privateSubnetIds;
