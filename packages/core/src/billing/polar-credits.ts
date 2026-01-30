import { db, schema } from "@lydie/database";
import { Polar } from "@polar-sh/sdk";
import { eq, and } from "drizzle-orm";
import { Resource } from "sst";

const polarClient = new Polar({
  accessToken: Resource.PolarApiKey.value,
  server: Resource.App.stage === "production" ? "production" : "sandbox",
});

/**
 * Configuration for the credits meter
 * This should match the meter name configured in Polar dashboard
 */
const CREDITS_METER_NAME = "llm_credits";

/**
 * Get the Polar customer ID for a user's seat in an organization
 */
async function getSeatPolarCustomerId(
  organizationId: string,
  userId: string
): Promise<string | null> {
  const seat = await db
    .select({
      polarCustomerId: schema.seatsTable.polarCustomerId,
    })
    .from(schema.seatsTable)
    .where(
      and(
        eq(schema.seatsTable.organizationId, organizationId),
        eq(schema.seatsTable.claimedByUserId, userId),
        eq(schema.seatsTable.status, "claimed")
      )
    )
    .limit(1);

  return seat[0]?.polarCustomerId || null;
}

/**
 * Helper function to fetch all customer meters from the paginated API
 * Uses the raw fetch API to avoid SDK type issues
 */
async function fetchCustomerMeters(polarCustomerId: string): Promise<any[]> {
  try {
    // Use direct API call to avoid SDK pagination complexities
    const baseUrl = Resource.App.stage === "production" 
      ? "https://api.polar.sh" 
      : "https://sandbox-api.polar.sh";
    
    const response = await fetch(
      `${baseUrl}/v1/customer-meters/?customer_id=${polarCustomerId}&limit=100`,
      {
        headers: {
          "Authorization": `Bearer ${Resource.PolarApiKey.value}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("Failed to fetch customer meters:", response.status, response.statusText);
      return [];
    }

    const data = await response.json();
    return data.items || [];
  } catch (error) {
    console.error("Error fetching customer meters:", error);
    return [];
  }
}

/**
 * Get the credit balance for a specific seat from Polar
 * Uses the Customer Meters API to fetch the current balance
 */
export async function getSeatCreditBalance(
  organizationId: string,
  userId: string
): Promise<number> {
  try {
    const polarCustomerId = await getSeatPolarCustomerId(organizationId, userId);
    
    if (!polarCustomerId) {
      console.log("No polar customer ID found for seat, returning 0 credits:", {
        organizationId,
        userId,
      });
      return 0;
    }

    // Fetch customer meters from Polar API
    const customerMeters = await fetchCustomerMeters(polarCustomerId);

    // Find the credits meter by name
    const creditsMeter = customerMeters.find(
      (meter: any) => meter.meter?.name === CREDITS_METER_NAME || meter.meterName === CREDITS_METER_NAME
    );

    if (!creditsMeter) {
      console.log("Credits meter not found for customer:", {
        polarCustomerId,
        meterName: CREDITS_METER_NAME,
        availableMeters: customerMeters.map((m: any) => m.meter?.name || m.meterName),
      });
      return 0;
    }

    // Return the balance (credited - consumed)
    // The balance field represents remaining credits
    return creditsMeter.balance || 0;
  } catch (error) {
    console.error("Error getting seat credit balance from Polar:", error);
    // Return 0 on error to be safe - don't block usage if API fails
    return 0;
  }
}

/**
 * Check if a user has sufficient credits for an operation
 * Queries Polar for the current balance
 */
export async function checkSeatCreditBalance(
  organizationId: string,
  userId: string,
  requiredCredits: number
): Promise<{
  allowed: boolean;
  creditsAvailable: number;
  creditsRequired: number;
}> {
  const creditsAvailable = await getSeatCreditBalance(organizationId, userId);

  return {
    allowed: creditsAvailable >= requiredCredits,
    creditsAvailable,
    creditsRequired: requiredCredits,
  };
}

/**
 * Ingest a usage event to deduct credits from a seat
 * This should be called when LLM credits are consumed
 */
export async function ingestCreditUsage(
  organizationId: string,
  userId: string,
  creditsUsed: number,
  metadata?: {
    documentId?: string;
    model?: string;
    operation?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const polarCustomerId = await getSeatPolarCustomerId(organizationId, userId);
    
    if (!polarCustomerId) {
      return {
        success: false,
        error: "No Polar customer ID found for this seat",
      };
    }

    // Ingest the usage event to Polar
    // This will deduct credits from the customer's meter balance
    await polarClient.events.ingest({
      events: [
        {
          name: CREDITS_METER_NAME,
          externalCustomerId: polarCustomerId,
          metadata: {
            credits: creditsUsed,
            ...metadata,
          },
        },
      ],
    });

    console.log("Credit usage ingested:", {
      polarCustomerId,
      creditsUsed,
      metadata,
    });

    return { success: true };
  } catch (error: any) {
    console.error("Error ingesting credit usage:", error);
    return {
      success: false,
      error: error.message || "Failed to ingest usage",
    };
  }
}

/**
 * Get the total credits available across all seats in an organization
 * This aggregates the balance from all claimed seats with Polar customer IDs
 */
export async function getOrganizationCreditBalance(
  organizationId: string
): Promise<number> {
  try {
    // Get all claimed seats with their Polar customer IDs
    const seats = await db
      .select({
        polarCustomerId: schema.seatsTable.polarCustomerId,
      })
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.organizationId, organizationId),
          eq(schema.seatsTable.status, "claimed")
        )
      );

    const seatsWithCustomerIds = seats.filter((s) => s.polarCustomerId);
    
    if (seatsWithCustomerIds.length === 0) {
      return 0;
    }

    // Fetch balances for all seats
    let totalCredits = 0;
    for (const seat of seatsWithCustomerIds) {
      try {
        const customerMeters = await fetchCustomerMeters(seat.polarCustomerId!);
        
        const creditsMeter = customerMeters.find(
          (meter: any) => meter.meter?.name === CREDITS_METER_NAME || meter.meterName === CREDITS_METER_NAME
        );

        if (creditsMeter) {
          totalCredits += creditsMeter.balance || 0;
        }
      } catch (error) {
        console.error("Error fetching credits for seat:", {
          polarCustomerId: seat.polarCustomerId,
          error,
        });
      }
    }

    return totalCredits;
  } catch (error) {
    console.error("Error getting organization credit balance:", error);
    return 0;
  }
}

/**
 * Get detailed credit status for an organization
 * Returns both total credits and per-seat breakdown
 */
export async function getOrganizationCreditStatus(
  organizationId: string
): Promise<{
  totalSeats: number;
  seatsWithCredits: number;
  totalCreditsAvailable: number;
}> {
  try {
    // Get all claimed seats with their Polar customer IDs
    const seats = await db
      .select({
        polarCustomerId: schema.seatsTable.polarCustomerId,
      })
      .from(schema.seatsTable)
      .where(
        and(
          eq(schema.seatsTable.organizationId, organizationId),
          eq(schema.seatsTable.status, "claimed")
        )
      );

    const seatsWithCustomerIds = seats.filter((s) => s.polarCustomerId);
    
    if (seatsWithCustomerIds.length === 0) {
      return {
        totalSeats: seats.length,
        seatsWithCredits: 0,
        totalCreditsAvailable: 0,
      };
    }

    // Fetch balances for all seats
    let totalCredits = 0;
    for (const seat of seatsWithCustomerIds) {
      try {
        const customerMeters = await fetchCustomerMeters(seat.polarCustomerId!);
        
        const creditsMeter = customerMeters.find(
          (meter: any) => meter.meter?.name === CREDITS_METER_NAME || meter.meterName === CREDITS_METER_NAME
        );

        if (creditsMeter) {
          totalCredits += creditsMeter.balance || 0;
        }
      } catch (error) {
        console.error("Error fetching credits for seat:", {
          polarCustomerId: seat.polarCustomerId,
          error,
        });
      }
    }

    return {
      totalSeats: seats.length,
      seatsWithCredits: seatsWithCustomerIds.length,
      totalCreditsAvailable: totalCredits,
    };
  } catch (error) {
    console.error("Error getting organization credit status:", error);
    return {
      totalSeats: 0,
      seatsWithCredits: 0,
      totalCreditsAvailable: 0,
    };
  }
}
