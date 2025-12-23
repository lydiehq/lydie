import { isLocalOrganization } from './local-organization';

export type Feature = 
  | 'assistant' 
  | 'document-chat' 
  | 'integrations' 
  | 'sharing' 
  | 'components'
  | 'settings'
  | 'billing';

const LOCAL_DISABLED_FEATURES: Feature[] = [
  'assistant',
  'document-chat',
  'integrations',
  'sharing',
  'components',
  'settings',
  'billing',
];

export function hasFeatureAccess(
  feature: Feature,
  organizationId?: string
): boolean {
  if (isLocalOrganization(organizationId)) {
    return !LOCAL_DISABLED_FEATURES.includes(feature);
  }
  // For authenticated users, check subscription plan here if needed
  return true;
}

