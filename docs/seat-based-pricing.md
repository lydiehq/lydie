# Billing Architecture

## Overview

**Model**: One user (Polar customer) can own multiple workspaces. Each workspace has one subscription. Invited users consume seats but are not billed entities.

**Billing entities**:
- **User** = Polar Customer (who pays, can have multiple subscriptions)
- **Workspace** = Subscription (what is paid for, one per workspace)  
- **Seat** = Access slot (internal only, no Polar identity)

## Resource Mapping

```
User (polarCustomerId)
  └─ owns ─→ Workspace A ── Subscription ── Credits Pool
  │              └─ Seats (claimed by users)
  │
  └─ owns ─→ Workspace B ── Subscription ── Credits Pool
                 └─ Seats (claimed by users)
```

**Key rule**: One human = one Polar customer. One workspace = one subscription.

## Flow

```
1. User Creates Workspace
   └─→ Ensure user has Polar customer (create if missing)
   └─→ Create subscription for workspace (free tier)
   └─→ Workspace gets polarSubscriptionId

2. User Purchases Paid Plan
   └─→ Polar checkout
   └─→ Same customer, new/updated subscription for that workspace

3. Assign Seats
   └─→ Assign seats to emails via Polar API
   └─→ Seats tracked internally, no Polar customer created

4. Claim Seat
   └─→ User claims via invitation
   └─→ Credits granted to workspace (via subscription benefits)

5. Use Credits
   └─→ Check: Query workspace's subscription meters
   └─→ Deduct: Ingest to workspace's customer meter
```

## Database Schema

### `users`
```typescript
{
  id: string;
  email: string;
  polarCustomerId: string?;  // One per user, billing identity
}
```

### `organizations` (workspaces)
```typescript
{
  id: string;
  subscriptionStatus: string;    // 'free', 'active', 'canceled'
  subscriptionPlan: string;      // 'free', 'monthly', 'yearly'
  polarSubscriptionId: string?;  // One per workspace
  billingOwnerUserId: string?;   // Who pays (references users.polarCustomerId)
}
```

### `seats`
```typescript
{
  id: string;
  organizationId: string;
  polarSeatId: string;           // Polar's seat identifier
  polarSubscriptionId: string?;  // Which subscription this seat belongs to
  status: 'pending' | 'claimed' | 'revoked';
  assignedEmail: string;
  claimedByUserId: string?;      // User who claimed (no Polar relation)
}
```

**No polarCustomerId on seats or workspaces.**

## Credits

**Workspace-level pooling**: Credits belong to the workspace subscription, not individual seats.

```typescript
// Check workspace credits
await checkWorkspaceCreditBalance(orgId, requiredCredits);

// Deduct from workspace
await ingestWorkspaceCreditUsage(orgId, creditsUsed, metadata);
```

Credits are queried from the workspace owner's `polarCustomerId` via subscription meters.

## Multi-Workspace

- User owns Workspace A (monthly, 800 credits) and Workspace B (yearly, 650 credits)
- Same `polarCustomerId`, different `polarSubscriptionId` per workspace
- Credits are isolated per workspace
- Invited users in each workspace consume that workspace's credits

## Webhooks

`customer.state_changed`: Syncs subscription status/plan per workspace using `metadata.referenceId` (workspace ID).

## Key Rules

1. **One user** = one Polar customer
2. **One workspace** = one subscription  
3. **Seats never** = Polar customers
4. **Credits are** = workspace-level (subscription meters)
5. **Billing is** = per workspace, grouped by customer
