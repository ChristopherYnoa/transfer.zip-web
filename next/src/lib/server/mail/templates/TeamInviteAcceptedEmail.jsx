import { Button, Heading, Hr, Text } from '@react-email/components';
import EmailLayout from './EmailLayout.jsx';

export default function TeamInviteAcceptedEmail({ teamName, memberEmail, link }) {
  return (
    <EmailLayout>
      <Heading style={h1}>{memberEmail} joined your team</Heading>
      <Text style={text}>
        {memberEmail} accepted your invitation and is now a member of "{teamName}".
      </Text>
      <Button style={button} href={link}>Manage Team</Button>
      <Hr style={{ marginTop: '24px' }} />
      <Text style={{ color: '#2563eb', textDecoration: 'underline' }}>
        <a href={link}>{link}</a>
      </Text>
    </EmailLayout>
  );
}

const h1 = { fontSize: '20px', marginBottom: '12px', fontWeight: '600' };
const text = { fontSize: '16px', lineHeight: '22px' };
const button = {
  backgroundColor: '#2563eb',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
  padding: '10px',
};
