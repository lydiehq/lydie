import {
  CreateScheduleCommand,
  DeleteScheduleCommand,
  SchedulerClient,
} from "@aws-sdk/client-scheduler";
import { Resource } from "sst";

import { sendEmail } from "./email";

const schedulerClient = new SchedulerClient({});

interface UserOnboardingData {
  userId: string;
  email: string;
  fullName: string;
}

interface ScheduledEmailEvent {
  userId: string;
  email: string;
  fullName: string;
  emailType: "checkin" | "feedback";
}

export async function cancelOnboardingEmails(userId: string) {
  const feedbackScheduleName = `onboarding-feedback-${userId}`;
  const checkinScheduleName = `onboarding-checkin-${userId}`;

  const deletePromises = [
    deleteSchedule(feedbackScheduleName),
    deleteSchedule(checkinScheduleName),
  ];

  const results = await Promise.allSettled(deletePromises);

  const deleted = results.filter((r) => r.status === "fulfilled").length;
  console.log(`Cancelled ${deleted} scheduled emails for user ${userId}`);

  return { deleted };
}

async function deleteSchedule(name: string) {
  try {
    await schedulerClient.send(
      new DeleteScheduleCommand({
        Name: name,
      }),
    );
    console.log(`Deleted schedule: ${name}`);
  } catch (error) {
    console.error(`Failed to delete schedule ${name}:`, error);
    // Don't throw - schedule might not exist
  }
}

export async function scheduleOnboardingEmails(userData: UserOnboardingData) {
  const { email, fullName } = userData;
  const firstName = fullName.split(" ")[0] || "there";

  await sendWelcomeEmail(email, firstName);
  await scheduleFollowupEmails(userData);
}

async function scheduleFollowupEmails(userData: UserOnboardingData) {
  const { userId, email, fullName } = userData;

  const now = new Date();
  const day1 = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
  const day2 = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  await createSchedule({
    name: `onboarding-feedback-${userId}`,
    scheduleTime: day1,
    emailType: "feedback",
    userId,
    email,
    fullName,
  });

  await createSchedule({
    name: `onboarding-checkin-${userId}`,
    scheduleTime: day2,
    emailType: "checkin",
    userId,
    email,
    fullName,
  });
}

async function createSchedule({
  name,
  scheduleTime,
  emailType,
  userId,
  email,
  fullName,
}: {
  name: string;
  scheduleTime: Date;
  emailType: "checkin" | "feedback";
  userId: string;
  email: string;
  fullName: string;
}) {
  const scheduleExpression = `at(${scheduleTime.toISOString().split(".")[0]})`;

  const input: ScheduledEmailEvent = {
    userId,
    email,
    fullName,
    emailType,
  };

  const lambdaArn = Resource.OnboardingEmailProcessorFunctionLinkable.arn;
  const roleArn = Resource.OnboardingSchedulerRoleLinkable.arn;

  try {
    await schedulerClient.send(
      new CreateScheduleCommand({
        Name: name,
        ScheduleExpression: scheduleExpression,
        ScheduleExpressionTimezone: "UTC",
        FlexibleTimeWindow: {
          Mode: "OFF",
        },
        Target: {
          Arn: lambdaArn,
          RoleArn: roleArn,
          Input: JSON.stringify(input),
        },
        ActionAfterCompletion: "DELETE",
      }),
    );

    console.log(`Scheduled ${emailType} email for ${email} at ${scheduleTime.toISOString()}`);
  } catch (error) {
    console.error(`Failed to schedule ${emailType} email:`, error);
    // Don't throw - we don't want to fail user registration if scheduling fails
  }
}

export async function processScheduledEmail(event: ScheduledEmailEvent) {
  const { email, fullName, emailType } = event;

  const firstName = fullName.split(" ")[0] || "there";

  if (emailType === "checkin") {
    await sendCheckInEmail(email, firstName);
  } else if (emailType === "feedback") {
    await sendFeedbackEmail(email, firstName);
  }
}

async function sendCheckInEmail(email: string, firstName: string) {
  const subject = "How's Lydie working for you?";
  const html = `
    <p>Hi ${firstName},</p>
    <p>It's been a couple days since you joined Lydie, and I wanted to check in.</p>
    <p>I'd love to hear:</p>
    <ul>
      <li>What brought you to Lydie?</li>
      <li>How has your experience been so far?</li>
      <li>Is there anything confusing or anything you're struggling with?</li>
    </ul>
    <p>Just reply to this email - I read and respond to every message personally.</p>
    <p>If you want to chat, you can also join our <a href="https://discord.gg/gHzKhW9vzg">Discord community</a> where I'm pretty active.</p>
    <p>Thanks for giving Lydie a try!</p>
    <p>Best,<br>Lars<br><a href="https://lydie.co">lydie.co</a></p>
  `;

  await sendEmail({
    to: email,
    subject,
    html,
    from: "lars@lydie.co",
    fromName: "Lars from Lydie",
  });
}

async function sendWelcomeEmail(email: string, firstName: string) {
  const subject = "Welcome to Lydie!";
  const html = `
    <p>Hi ${firstName},</p>
    <p>Welcome to Lydie! I'm excited to have you on board.</p>
    <p>Lydie is still an early project, but I'm working hard to make it better every day. I welcome any feedback or suggestions you have - just reply to this email, I read and respond to every one personally.</p>
    <p>You can also join our <a href="https://discord.gg/gHzKhW9vzg">Discord server</a> to connect.</p>
    <p>Best,<br>Lars</p>
  `;

  await sendEmail({
    to: email,
    subject,
    html,
    from: "lars@lydie.co",
    fromName: "Lars from Lydie",
  });
}

async function sendFeedbackEmail(email: string, firstName: string) {
  const subject = "Quick favor? I'd love your feedback on Lydie";
  const html = `
    <p>Hi ${firstName},</p>
    <p>You signed up for Lydie about a day ago, and I'm hoping you can help me out.</p>
    <p>Since we're in open beta, your feedback is incredibly valuable. I want to know what's working, what's not, and what features would make Lydie more useful for you.</p>
    <p>I'd love to hear any feedback about how you found the product and what improvements I could make to fit Lydie into your writing workflows.</p>
    <p>Just reply to this email - I read and respond to every one personally.</p>
    <p>Thanks,<br>Lars<br><a href="https://lydie.co">lydie.co</a></p>
  `;

  await sendEmail({
    to: email,
    subject,
    html,
    from: "lars@lydie.co",
    fromName: "Lars from Lydie",
  });
}
