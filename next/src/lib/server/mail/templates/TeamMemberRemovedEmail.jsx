import { Heading, Hr, Text } from '@react-email/components';
import EmailLayout from './EmailLayout.jsx';

export default function TeamMemberRemovedEmail({ teamName }) {
  return (
    <EmailLayout>
      <Heading style={h1}>You've been removed from {teamName}</Heading>
      <Text style={text}>
        You no longer have access to "{teamName}". Your account is still active, but you've been signed out of all sessions.
      </Text>
      <Text style={text}>
        If you believe this was a mistake, please contact the team owner directly.
      </Text>
      <Hr style={{ marginTop: '24px' }} />
    </EmailLayout>
  );
}

const h1 = { fontSize: '20px', marginBottom: '12px', fontWeight: '600' };
const text = { fontSize: '16px', lineHeight: '22px' };
