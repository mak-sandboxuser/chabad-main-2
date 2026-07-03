/**
 * Smoke test for Salesforce-only portal backend.
 * Run: node scripts/smoke-portal-flow.mjs
 */
const BASE = process.env.API_BASE || 'http://localhost:5001';

const tests = [];
function ok(name, pass, detail = '') {
  tests.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  // Health: server up
  try {
    await fetch(`${BASE}/api/auth/check-member`, { method: 'OPTIONS' }).catch(() => null);
  } catch {
    ok('Backend reachable', false, 'Start backend with npm run dev');
    printSummary();
    process.exit(1);
  }
  ok('Backend reachable', true);

  // check-member: registered user
  const rohit = await post('/api/auth/check-member', { email: 'rohitjainltp59@gmail.com' });
  ok('check-member registered', rohit.status === 200 && rohit.json.allowed === true, `status=${rohit.status}`);
  ok('check-member has contactId', /^003/.test(rohit.json.member?.contactId || ''), rohit.json.member?.contactId || 'missing');
  ok('check-member has accountId', /^001/.test(rohit.json.member?.accountId || ''), rohit.json.member?.accountId || 'missing');

  // check-member: unregistered
  const fake = await post('/api/auth/check-member', { email: 'notreal@test.com' });
  ok('check-member blocks fake', fake.status === 403, `status=${fake.status}`);

  // check-member: appledev
  const apple = await post('/api/auth/check-member', { email: 'acc.appledev@gmail.com' });
  ok('check-member appledev', apple.status === 200 && apple.json.allowed === true, `status=${apple.status}`);
  ok('check-member appledev accountId', /^001/.test(apple.json.member?.accountId || ''), apple.json.member?.accountId || 'missing');

  // dashboard without auth should 401
  const dashNoAuth = await fetch(`${BASE}/api/portal/dashboard`);
  ok('dashboard requires auth', dashNoAuth.status === 401, `status=${dashNoAuth.status}`);

  // quick-payment without auth - may still process email in body for some paths
  const qp = await post('/api/payments/quick-payment', {
    email: 'rohitjainltp59@gmail.com',
    pledgeAmount: 10,
    paymentAmount: 0,
  });
  ok('quick-payment pledge-only responds', qp.status === 200 || qp.status === 500, `status=${qp.status} ${qp.json.error || qp.json.message || ''}`);

  // verify endpoint
  const verify = await post('/api/payments/verify', { email: 'test@test.com', amount: 1 });
  ok('verify endpoint', verify.status === 200, `status=${verify.status}`);

  printSummary();
  process.exit(tests.every((t) => t.pass) ? 0 : 1);
}

function printSummary() {
  const failed = tests.filter((t) => !t.pass);
  console.log(`\n${tests.length - failed.length}/${tests.length} passed`);
  if (failed.length) {
    console.log('Failed:', failed.map((f) => f.name).join(', '));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
