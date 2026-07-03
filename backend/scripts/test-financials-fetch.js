require('dotenv').config();
const https = require('https');
const {
  parseMakePayload,
  extractPortalDataFromPayload,
  filterNormalizedPayments,
} = require('../portalDataMapper');

function fetchMake(body) {
  return new Promise((resolve, reject) => {
    const url = process.env.MAKE_PAYMENTS_WEBHOOK_URL;
    const payload = JSON.stringify(body);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function buildFinancialsFromSources(portalData = {}) {
  const payments = filterNormalizedPayments(portalData.payments || []);
  return {
    totalPayments: payments.length,
    payments,
    pledges: portalData.pledges || [],
    recurring: portalData.recurring || [],
  };
}

async function main() {
  const email = 'rohitjainltp59@gmail.com';
  const contactId = '003Jx00001ZtMGAIA3';
  const raw = await fetchMake({
    email,
    contactId,
    fetchPayments: true,
    fetchFinancials: true,
  });
  const payload = parseMakePayload(raw);
  const portal = extractPortalDataFromPayload(payload);
  const financials = buildFinancialsFromSources({ ...portal, fromSalesforce: true });

  console.log('portal pledges:', portal.pledges.length);
  console.log('portal recurring:', portal.recurring.length);
  console.log('financials pledges:', financials.pledges.length);
  console.log('financials recurring:', financials.recurring.length);
  console.log(JSON.stringify({ pledges: financials.pledges, recurring: financials.recurring.slice(0, 3) }, null, 2));
}

main().catch(console.error);
