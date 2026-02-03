import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Resource } from "sst";

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  from?: string;
  /** Display name for the sender (e.g. "Lars from Lydie"). Uses RFC 5322 format. */
  fromName?: string;
}

const sesClient = new SESv2Client({});

function formatFromAddress(email: string, displayName?: string): string {
  if (!displayName) return email;
  return `"${displayName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" <${email}>`;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  from = "no-reply@lydie.co",
  fromName,
}: EmailParams) {
  const fromAddress = formatFromAddress(from, fromName);

  if (Resource.App.stage !== "production") {
    console.log(`[Info] Skipping email sending in non-production stage`);
    console.log(`[Info] Email details:`, { to, subject, from: fromAddress });
    return;
  }

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: fromAddress,
      Destination: {
        ToAddresses: [to],
      },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: {
            ...(text && { Text: { Data: text } }),
            ...(html && { Html: { Data: html } }),
          },
        },
      },
    }),
  );
}
