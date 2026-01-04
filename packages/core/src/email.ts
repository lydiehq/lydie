import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { Resource } from "sst";

interface EmailParams {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

const sesClient = new SESv2Client({});

export async function sendEmail({ to, subject, text, html }: EmailParams) {
  if (Resource.App.stage !== "production") {
    console.log(`[Info] Skipping email sending in non-production stage`);
    console.log(`[Info] Email details:`, { to, subject });
    return;
  }

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: "no-reply@lydie.co",
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
    })
  );
}
