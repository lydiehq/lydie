export const LOCAL_ORG_ID = 'local';
export const LOCAL_ORG_NAME = 'Local Workspace';

export function isLocalOrganization(orgId: string | undefined): boolean {
  return orgId === LOCAL_ORG_ID;
}

