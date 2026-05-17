import { Button, Heading, Hr, Text } from '@react-email/components';
import EmailLayout from './EmailLayout.jsx';

export default function TeamOverCapacityEmail({ teamName, memberCount, seats, link }) {
  const surplus = Math.max(memberCount - seats, 0);
  return (
    <EmailLayout>
      <Heading style={h1}>{teamName} is over its seat limit</Heading>
      <Text style={text}>
        Your team now has <strong>{memberCount} members</strong> but only <strong>{seats} paid {seats === 1 ? "seat" : "seats"}</strong>. You're {surplus} {surplus === 1 ? "seat" : "seats"} over capacity.
      </Text>
      <Text style={text}>
        To stay within your subscription, either add more seats or remove team members. Members keep access until you take action.
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
