const emails = [
  { email: 'rohitjainltp59@gmail.com', contactId: '003Jx00001ZtMGAIA3' },
  { email: 'acc.appledev@gmail.com', contactId: '003Jx00001ZtPkHIAV' },
];

const loginUrl = 'https://hook.us2.make.com/guntjeaj3jsdnv87xvrnion6x6hcikoq';
const portalUrl = 'https://hook.us2.make.com/4y2hgr2u7lx2lf2q27vpb1tx4p7q6fk4';
const paymentsUrl = 'https://hook.us2.make.com/br7jb7amm2sqdrjq4z51k4mzjeehg1hs';

function readField(text, field) {
  const q = text.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'));
  if (q) return q[1];
  const u = text.match(new RegExp(`"${field}"\\s*:\\s*([^\\r\\n,}{]+)`, 'i'));
  return u ? u[1].replace(/['"]/g, '').trim() : '';
}

for (const { email, contactId } of emails) {
  console.log('\n==========', email, '==========');

  const loginRes = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const loginText = await loginRes.text();
  console.log('LOGIN LOOKUP:');
  console.log('  contactId:', readField(loginText, 'contactId') || '(missing)');
  console.log('  accountId:', readField(loginText, 'accountId') || '(missing)');
  console.log('  name:', [readField(loginText, 'firstName'), readField(loginText, 'lastName')].filter(Boolean).join(' ') || '(missing)');

  const portalRes = await fetch(portalUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, contactId }),
  });
  const portalText = await portalRes.text();
  console.log('PORTAL DATA WEBHOOK:');
  console.log('  accountId:', readField(portalText, 'accountId') || '(missing)');
  console.log('  accountName:', readField(portalText, 'accountName') || '(missing)');
  console.log('  payments empty?:', /"payments"\s*:\s*\[\s*\]/.test(portalText));
  console.log('  pledges empty?:', /"pledges"\s*:\s*\[\s*\]/.test(portalText));

  const payRes = await fetch(paymentsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, contactId, action: 'fetch' }),
  });
  const payText = await payRes.text();
  console.log('PAYMENTS FETCH WEBHOOK (first 400 chars):');
  console.log(' ', payText.slice(0, 400).replace(/\s+/g, ' '));
}
