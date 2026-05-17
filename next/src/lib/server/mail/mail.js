import { Resend } from 'resend';
import { render } from '@react-email/render';
import TransferDownloadedEmail from './templates/TransferDownloadedEmail.jsx';
import TransferRequestReceivedEmail from './templates/TransferRequestReceivedEmail.jsx';
import TransferShareEmail from './templates/TransferShareEmail.jsx';
import TransferRequestShareEmail from './templates/TransferRequestShareEmail.jsx';
import PasswordResetEmail from './templates/PasswordResetEmail.jsx';
import MagicLinkEmail from './templates/MagicLinkEmail.jsx';
import TeamInviteEmail from './templates/TeamInviteEmail.jsx';
import TeamInviteAcceptedEmail from './templates/TeamInviteAcceptedEmail.jsx';
import TeamMemberRemovedEmail from './templates/TeamMemberRemovedEmail.jsx';
import TeamRoleChangedEmail from './templates/TeamRoleChangedEmail.jsx';
import TeamSeatCapacityReachedEmail from './templates/TeamSeatCapacityReachedEmail.jsx';
import TeamOverCapacityEmail from './templates/TeamOverCapacityEmail.jsx';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

async function sendMail(reactElement, { from, to, subject }) {
  const finalSubject = process.env.NODE_ENV !== "production" ? `[RKT-DEV] ${subject}` : subject;
  if (resend) {
    await resend.emails.send({
      from: from || `noreply@${process.env.RESEND_DOMAIN || `transfer.zip`}`,
      to,
      subject: finalSubject,
      react: reactElement,
    });
  } else {
    console.log('[MOCK] Sending email to', to, 'from', from, 'subject', finalSubject);
    console.log(await render(reactElement));
  }
}

export async function sendTransferDownloaded(email, { name, link, brand }) {
  await sendMail(TransferDownloadedEmail({ name, link, brand }), {
    to: email,
    subject: `Transfer downloaded - ${brand?.name || process.env.NEXT_PUBLIC_SITE_NAME} | ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
  });
}

export async function sendTransferRequestReceived(email, { name, link, brand }) {
  await sendMail(TransferRequestReceivedEmail({ name, link, brand }), {
    to: email,
    subject: `Files received - ${brand?.name || process.env.NEXT_PUBLIC_SITE_NAME} | ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
  });
}

export async function sendTransferRequestShare(email, { name, description, link, brand }) {
  await sendMail(TransferRequestShareEmail({ name, description, link, brand }), {
    to: email,
    subject: `Transfer request - ${brand?.name || process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}

export async function sendTransferShare(email, { name, description, link, brand }) {
  await sendMail(TransferShareEmail({ name, description, link, brand }), {
    to: email,
    subject: `Files available - ${brand?.name || process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}

export async function sendPasswordReset(email, { link }) {
  await sendMail(PasswordResetEmail({ link }), {
    to: email,
    subject: `Reset your password - ${process.env.NEXT_PUBLIC_SITE_NAME} | ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
  });
}

export async function sendMagicLink(email, { link }) {
  await sendMail(MagicLinkEmail({ link }), {
    to: email,
    subject: `Log In - ${process.env.NEXT_PUBLIC_SITE_NAME} | ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
  });
}

export async function sendTeamInvite(email, { teamName, inviterName, link }) {
  await sendMail(TeamInviteEmail({ teamName, inviterName, link }), {
    to: email,
    subject: `You've been invited to join ${teamName} - ${process.env.NEXT_PUBLIC_SITE_NAME} | ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
  });
}

export async function sendTeamInviteAccepted(email, { teamName, memberEmail, link }) {
  await sendMail(TeamInviteAcceptedEmail({ teamName, memberEmail, link }), {
    to: email,
    subject: `${memberEmail} joined ${teamName} - ${process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}

export async function sendTeamMemberRemoved(email, { teamName }) {
  await sendMail(TeamMemberRemovedEmail({ teamName }), {
    to: email,
    subject: `You've been removed from ${teamName} - ${process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}

export async function sendTeamRoleChanged(email, { teamName, role, link }) {
  await sendMail(TeamRoleChangedEmail({ teamName, role, link }), {
    to: email,
    subject: `Your role in ${teamName} has changed - ${process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}

export async function sendTeamSeatCapacityReached(email, { teamName, seats, link }) {
  await sendMail(TeamSeatCapacityReachedEmail({ teamName, seats, link }), {
    to: email,
    subject: `${teamName} has reached its seat limit - ${process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}

export async function sendTeamOverCapacity(email, { teamName, memberCount, seats, link }) {
  await sendMail(TeamOverCapacityEmail({ teamName, memberCount, seats, link }), {
    to: email,
    subject: `${teamName} is over its seat limit - ${process.env.NEXT_PUBLIC_SITE_NAME}`,
  });
}