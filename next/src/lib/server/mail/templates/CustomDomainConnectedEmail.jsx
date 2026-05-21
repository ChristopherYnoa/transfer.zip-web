import { Button, Heading, Hr, Text } from '@react-email/components';
import EmailLayout from './EmailLayout.jsx';

export default function CustomDomainConnectedEmail({ domain, link }) {
  return (
    <EmailLayout>
      <Heading style={h1}>Your custom domain is live</Heading>
      <Text style={text}>
        <strong>{domain}</strong> is now connected. Your transfers will be
        delivered from this domain from here on.
      </Text>
      <Button style={button} href={link}>Open Branding settings</Button>
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
