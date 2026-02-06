# Billing Architecture

## Overview

**Model**: One user (Polar customer) can own multiple workspaces. Each workspace has one subscription. Credits are granted per-seat and stored locally, synced via Zero.

**Billing entities**:
- **User** = Polar Customer (who pays, can have multiple subscriptions)
- **Workspace** = Subscription (what is paid for, one per workspace)  
- **Seat** = Access slot + Credits (stored locally, synced via webhooks)

**Key principle**: All credit data is **local** - synced via Zero from webhooks, not queried on-demand.

## Resource Mapping

```
User (polarCustomerId)
  ├─ owns ─→ Workspace A ── Subscription
  │              ├─ Seat 1 (claimed by User A) ── Credits (local, synced via Zero)
  │              └─ Seat 2 (claimed by User B) ── Credits (local, synced via Zero)
  │
  └─ owns ─→ Workspace B ── Subscription
                 ├─ Seat 1 (claimed by User A) ── Credits (local, synced via Zero)
                 └─ Seat 2 (claimed by User C) ── Credits (local, synced via Zero)
```

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
   └─→ Seats tracked internally

4. Claim Seat → Credits Synced Locally
   └─→ User clicks claim link
   └─→ Polar grants Credits benefit
   └─→ benefit_grant.created webhook fires
   └─→ Server updates seat.creditBalance in database
   └─→ Zero syncs credit_balance to client (real-time)
   └─→ UI updates instantly (no API call needed)

5. Use Credits → Local Check, Remote Deduct
   ├─→ Check: Read credit_balance locally from Zero (instant)
   ├─→ Deduct: Decrement credit_balance locally
   └─→ Ingest usage to Polar (async, updates meter)
        └─→ Next benefit_grant cycle refreshes credits
```

## Data Flow

**Credits are LOCAL data:**
- Stored in `seats.creditBalance` (PostgreSQL)
- Synced via Zero to all clients (real-time replication)
- No API calls needed to check credits
- Works offline, instant updates

**Sync happens via webhooks:**
```
Polar ──webhook──→ Server ──Zero──→ All Clients
   benefit_grant      Update DB     Real-time sync
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
  claimedByUserId: string?;      // User who claimed
  creditBalance: number;         // Credits stored locally (synced via Zero)
}
```

## Credits

**Per-seat allocation**: When a user claims a seat, Polar grants Credits benefit via webhook.

- User A can have 800 credits in Workspace A and 650 credits in Workspace B
- Credits are isolated per workspace
- Credits are **local data** - queried instantly from Zero

**Example (UsageStats component):**
```typescript
// Query seat credits locally via Zero
const [seat] = useQuery(
  z.query.seats
    .where("organization_id", orgId)
    .where("claimed_by_user_id", userId)
    .one()
);
const credits = seat?.credit_balance ?? 0; // Instant, offline-capable
```

## Webhooks

| Webhook | Purpose |
|---------|---------|
| **benefit_grant.created** | Syncs credit balance to seat (from Polar → local DB → Zero) |
| **benefit_grant.revoked** | Resets credit balance when seat revoked |
| **customer.state_changed** | Syncs subscription status/plan per workspace |
| **order.created** | Syncs seats for one-time purchases |

## Architecture Benefits

1. **⚡ Instant** - No API latency when checking credits
2. **🔌 Offline** - Works without internet connection
3. **🔄 Real-time** - Updates sync to all clients immediately
4. **💰 Efficient** - No Polar API calls for read operations

## Key Rules

1. **One user** = one Polar customer
2. **One workspace** = one subscription  
3. **Seats never** = Polar customers
4. **Credits are** = local data (per-seat, synced via Zero)
5. **Billing is** = per workspace, grouped by customer
