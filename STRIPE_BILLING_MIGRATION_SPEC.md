# Stripe Billing Migration Spec - REVISED

## Overview

This document outlines the migration from Polar.sh to Stripe for Lydie's billing system.

**CORRECTION**: After initial implementation review, the architecture was revised to use **per-user-per-workspace credits** instead of shared pools.

- **Migration Date**: February 2026
- **Previous System**: Polar.sh with seat-based pricing
- **New System**: Stripe with per-user-per-workspace credits
- **Legacy Data**: None (clean migration, no backwards compatibility needed)

---

## Architecture

### Credit System (REVISED)

Each user gets their own credits in each workspace they're a member of. Credits are NOT shared between members.

| Plan | Credits/Month per Member | Price | Billing Interval |
|------|-------------------------|-------|------------------|
| **Free** | 30 credits | $0 | N/A |
| **Pro Monthly** | 800 credits | $18/month | Monthly |
| **Pro Yearly** | 800 credits | $14/month | Yearly ($168/year) |

**Key Behaviors:**
- Credits are **per user per workspace** (not shared pool)
- If a user is in 3 workspaces, they have 3 separate credit accounts
- Credits reset monthly for monthly plan, yearly for yearly plan
- All members in a workspace get the same credit allowance based on workspace tier
- Hard limits at credit cap (no overages)

### Stripe Object Model (REVISED)

```
Product: "Lydie Pro Monthly"
├── Price: $18.00/month per member
└── Usage type: Licensed (flat fee per seat)

Product: "Lydie Pro Yearly"
├── Price: $168.00/year per member ($14/mo equivalent)
└── Usage type: Licensed (flat fee per seat)
```

**Note:** Simple licensed pricing (no meters, no overages). Each member is a "seat" in Stripe terms.

### Customer Strategy

- **Free workspaces**: No Stripe objects
- **Paid workspaces**: One Stripe Customer per billing owner, one subscription per workspace
- **Subscription items**: Quantity = number of members (seats)
- **Subscription metadata**: Contains `organizationId` and `billingOwnerUserId`

---

## Database Schema (REVISED)

### Modified Tables

#### `workspace_billing` (Simplified)
Tracks workspace-level billing state only (no credit tracking here anymore).

```typescript
{
  id: string;
  organizationId: string;          // References organizations.id
  
  // Plan type (determines credits per member)
  plan: 'free' | 'monthly' | 'yearly';
  
  // Stripe IDs (null for free workspaces)
  stripeSubscriptionId: string?;
  stripeSubscriptionStatus: string?; // 'active', 'past_due', 'canceled'
  
  // Billing owner (who pays)
  billingOwnerUserId: string;
  
  // Current period tracking (all members reset together)
  currentPeriodStart: Date?;
  currentPeriodEnd: Date?;
  
  // Metadata
  canceledAt: Date?;
  cancelAtPeriodEnd: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}
```

### New Tables

#### `user_workspace_credits` (NEW)
Tracks credits per user per workspace. This is the key revision.

```typescript
{
  id: string;
  
  // Composite unique key
  userId: string;              // References users.id
  organizationId: string;       // References organizations.id
  
  // Credit tracking (per user per workspace)
  creditsIncludedMonthly: number;  // 30 (free) or 800 (paid)
  creditsUsedThisPeriod: number;   // How many used this period
  creditsAvailable: number;        // Current available balance
  
  // Period tracking (synced with workspace billing)
  currentPeriodStart: Date?;
  currentPeriodEnd: Date?;
  
  createdAt: Date;
  updatedAt: Date;
}
```

**Indexes:**
- Unique: `(userId, organizationId)` - one credit record per user per workspace
- `userId` index for quick lookup of all workspaces for a user
- `organizationId` index for quick lookup of all members in a workspace

#### `stripe_customers` (Unchanged)
```typescript
{
  id: string;              // Stripe customer ID (cus_xx)
  userId: string;          // References users.id
  email: string;
  createdAt: Date;
  updatedAt: Date;
}
```

#### `credit_usage_log` (Unchanged)
Audit trail for credit consumption.

```typescript
{
  id: string;
  organizationId: string;
  userId: string?;
  creditsConsumed: number;
  actionType: string;        // 'ai_assistant', 'document_create', etc.
  resourceId: string?;       // conversation_id, document_id
  stripeMeterEventId: string?;  // Not used with licensed pricing
  createdAt: Date;
}
```

### Removed Tables

- `seatsTable` - Polar seat-based pricing
- `pendingSeatMembersTable` - Seat claim system

---

## API Endpoints (REVISED)

### Credit Endpoints

All credit endpoints now require both `userId` (from auth) and `organizationId`.

#### Get My Credits in a Workspace
```
GET /internal/billing/credits/:organizationId
```

**Response:**
```json
{
  "userId": "user_123",
  "organizationId": "org_456",
  "plan": "monthly",
  "creditsIncluded": 800,
  "creditsUsed": 150,
  "creditsAvailable": 650,
  "currentPeriodStart": "2026-02-01T00:00:00Z",
  "currentPeriodEnd": "2026-03-01T00:00:00Z"
}
```

#### Check Credits (Without Consuming)
```
POST /internal/billing/credits/check/:organizationId
{
  "creditsRequested": 10,
  "actionType": "ai_assistant"
}
```

**Response:**
```json
{
  "allowed": true,
  "creditsAvailable": 650,
  "creditsRequired": 10,
  "requiresUpgrade": false
}
```

#### Consume Credits
```
POST /internal/billing/credits/consume/:organizationId
{
  "creditsRequested": 10,
  "actionType": "ai_assistant",
  "resourceId": "conversation_123"  // optional
}
```

**Response:**
```json
{
  "allowed": true,
  "remaining": 640,
  "requiresUpgrade": false
}
```

#### Get All Members' Credits (Admin Only)
```
GET /internal/billing/credits/members/:organizationId
```

**Response:**
```json
{
  "organizationId": "org_456",
  "plan": "monthly",
  "creditsPerMember": 800,
  "totalCreditsUsed": 450,
  "totalCreditsAvailable": 1950,
  "members": [
    {
      "userId": "user_123",
      "userName": "John Doe",
      "userEmail": "john@example.com",
      "creditsUsed": 150,
      "creditsAvailable": 650
    },
    {
      "userId": "user_789",
      "userName": "Jane Smith",
      "userEmail": "jane@example.com",
      "creditsUsed": 300,
      "creditsAvailable": 500
    }
  ],
  "currentPeriodStart": "2026-02-01T00:00:00Z",
  "currentPeriodEnd": "2026-03-01T00:00:00Z"
}
```

### Billing Management (Admin Only)

#### Get Subscription Details
```
GET /internal/billing/subscription/:organizationId
```

#### Create Checkout Session
```
POST /internal/billing/checkout/:organizationId
```

#### Create Customer Portal Session
```
POST /internal/billing/portal/:organizationId
```

#### Cancel Subscription
```
POST /internal/billing/cancel/:organizationId
```

#### Resume Subscription
```
POST /internal/billing/resume/:organizationId
```

---

## Key Implementation Flows (REVISED)

### 1. Workspace Creation (Free Tier)

When a workspace is created:
1. Create `workspace_billing` with `plan: 'free'`
2. Create `user_workspace_credits` for the creator with 30 credits

When a new member joins:
1. Create `user_workspace_credits` for the new member
2. Credits = 30 (based on free plan)

### 2. Credit Consumption (Per-User)

```typescript
async function checkAndConsumeCredits(
  userId: string,
  organizationId: string,
  creditsRequested: number
) {
  // 1. Get or create user's credits for this workspace
  const credits = await getOrCreateUserWorkspaceCredits(userId, organizationId);
  
  // 2. Check if monthly/yearly reset needed
  if (credits.currentPeriodEnd && now >= credits.currentPeriodEnd) {
    await resetUserCredits(userId, organizationId);
  }
  
  // 3. Hard limit check (no overages)
  if (credits.creditsAvailable < creditsRequested) {
    return { allowed: false, remaining: credits.creditsAvailable };
  }
  
  // 4. Deduct credits
  await db.update(userWorkspaceCreditsTable)
    .set({
      creditsAvailable: credits.creditsAvailable - creditsRequested,
      creditsUsedThisPeriod: credits.creditsUsedThisPeriod + creditsRequested,
    });
  
  // 5. Log usage
  await db.insert(creditUsageLogTable).values({
    userId,
    organizationId,
    creditsConsumed: creditsRequested,
  });
  
  return { allowed: true, remaining: newAvailable };
}
```

### 3. Upgrade to Paid Plan

When workspace upgrades:
1. Create Stripe checkout session for subscription
2. After payment, update `workspace_billing.plan` to 'monthly' or 'yearly'
3. Reset ALL members' credits to 800

### 4. Monthly/Yearly Reset

Triggered by `invoice.finalized` webhook:
```typescript
async function handleInvoiceFinalized(invoice) {
  const billing = await getWorkspaceBilling(invoice.subscription);
  
  // Reset ALL members' credits
  await db.update(userWorkspaceCreditsTable)
    .set({
      creditsUsedThisPeriod: 0,
      creditsAvailable: billing.plan === 'yearly' ? 800 : 800,
      currentPeriodStart: newPeriodStart,
      currentPeriodEnd: newPeriodEnd,
    })
    .where({ organizationId: billing.organizationId });
}
```

### 5. Downgrade to Free

When subscription is canceled:
1. Update `workspace_billing.plan` to 'free'
2. Cap ALL members' credits at 30 (keep current if less, cap if more)

---

## Setup Guide (REVISED)

### Step 1: Create Stripe Products (Dashboard)

**Product 1: Lydie Pro Monthly**
- Name: "Lydie Pro Monthly"
- Price: $18.00 per unit (monthly)
- Usage type: Licensed

**Product 2: Lydie Pro Yearly**
- Name: "Lydie Pro Yearly"
- Price: $168.00 per unit (yearly)
- Usage type: Licensed

**Note:** No meters needed - this is simple seat-based licensed pricing.

### Step 2: Configure SST Secrets

```bash
StripeSecretKey=sk_test_xxxxx
StripeMonthlyPriceId=price_xxxxx
StripeYearlyPriceId=price_xxxxx
StripeWebhookSecret=whsec_xxxxx
```

### Step 3: Configure Stripe Webhook

- **Endpoint URL**: `https://api.lydie.ai/public/webhooks/stripe`
- **Events**:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_failed`
  - `invoice.finalized`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

### Step 4: Run Database Migration

```bash
bun run db:push
```

### Step 5: Deploy

```bash
bun run deploy:prod
```

---

## Changes from Original Spec

### What Changed

1. **Credit Model**: Shared pool → Per-user-per-workspace
2. **Pricing Tiers**: $20+overage → $18/month or $14/month (no overages)
3. **Stripe Pricing**: Metered → Licensed (simple seat-based)
4. **Database**: Added `user_workspace_credits` table
5. **API**: Credit endpoints now require user context

### Why It Changed

- Miscommunication about credit sharing (should be per-user, not shared)
- Pricing structure clarification (3 tiers, no overages)
- Simpler Stripe integration (licensed vs metered)
- Better UX (each user has their own budget)

---

## Testing Checklist (REVISED)

- [ ] Create free workspace - creator gets 30 credits
- [ ] Invite member to free workspace - new member gets 30 credits
- [ ] User in 3 workspaces has 3 separate credit accounts
- [ ] Credit consumption only affects calling user
- [ ] Upgrade to monthly - all members reset to 800 credits
- [ ] Upgrade to yearly - all members reset to 800 credits (yearly period)
- [ ] Monthly reset triggers for monthly plan members
- [ ] Yearly reset triggers for yearly plan members
- [ ] Cancel subscription - all members capped at 30 credits
- [ ] Downgraded member can still use remaining credits (up to 30)
- [ ] New member joining paid workspace gets 800 credits
- [ ] Billing owner can see all members' credit usage
- [ ] Regular member can only see own credits
