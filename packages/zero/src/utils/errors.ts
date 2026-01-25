// Standardized error messages for mutators and queries

export function notFoundError(entity: string, id: string): Error {
  return new Error(`${entity} not found: ${id}`);
}

export function unauthorizedError(message = "Unauthorized"): Error {
  return new Error(message);
}

export function accessDeniedError(
  message = "Access denied: You do not have permission to access this workspace",
): Error {
  return new Error(message);
}
