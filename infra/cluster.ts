export const vpc = new sst.aws.Vpc(`vpc`, { az: 2 });

export const cluster = new sst.aws.Cluster(`cluster`, {
  vpc,
});
