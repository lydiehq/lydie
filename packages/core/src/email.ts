import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2"
import { Resource } from "sst"

interface EmailParams {
  to: string
  subject: string
  text?: string
  html?: string
  from?: string
}

const sesClient = new SESv2Client({})

export async function sendEmail({ to, subject, text, html, from = "no-reply@lydie.co" }: EmailParams) {
  if (Resource.App.stage !== "production") {
    console.log(`[Info] Skipping email sending in non-production stage`)
    console.log(`[Info] Email details:`, { to, subject, from })
    return
  }

  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: from,
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
  )
}
