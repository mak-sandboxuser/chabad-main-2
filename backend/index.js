require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { verifyToken, createClerkClient } = require('@clerk/backend');
const db = require('./db');
const {
  parseMakePayload,
  extractPortalDataFromPayload,
  mergePaymentsRemoteAndLocal,
  filterNormalizedPayments,
} = require('./portalDataMapper');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyformagiclinks';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`;
const CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/?payment=cancel`;
const processedCheckoutSessions = new Set();
const SESSION_CLOCK_SKEW_MS = Number.parseInt(process.env.SESSION_CLOCK_SKEW_MS || '300000', 10);
const DEV_LOCALHOST_ORIGIN = /^https?:\/\/localhost(?::\d+)?$/;

async function verifyClerkSessionToken(token) {
  return verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
    clockSkewInMs: SESSION_CLOCK_SKEW_MS,
  });
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || origin === FRONTEND_URL || DEV_LOCALHOST_ORIGIN.test(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
}));
app.use(express.json());

// Global variable to hold last sent link for developer helper banner
let devLastLink = '';
let devLastEmailUrl = '';

// Cache Salesforce member profile details in memory
let userSalesforceData = {};

async function lookupSalesforceMember(email) {
  const emailLower = email.toLowerCase();
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;

  const sanitizeName = (value) => {
    const normalized = (value || '').trim();
    if (normalized.length < 2) return '';
    const blocked = new Set(['firstname', 'lastname', 'contactid', 'found', 'role', 'null', 'undefined']);
    return blocked.has(normalized.toLowerCase()) ? '' : normalized;
  };

  const sanitizeSalesforceId = (value) => {
    const normalized = (value || '').trim();
    return /^[a-zA-Z0-9]{15,18}$/.test(normalized) ? normalized : '';
  };

  if (!webhookUrl) {
    console.error('MAKE_WEBHOOK_URL is not configured — cannot verify Salesforce membership.');
    return { found: false, error: 'membership_check_unavailable' };
  }

  try {
    const makeResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailLower }),
    });

    if (!makeResponse.ok) {
      console.error(`Make.com webhook returned ${makeResponse.status} for ${emailLower}`);
      return { found: false, error: 'membership_check_failed' };
    }

    const makeText = await makeResponse.text();
    console.log(`Make.com raw response for ${emailLower}:`, makeText);

    const payload = parseMakePayload(makeText);

    const readField = (field) => {
      if (payload && payload[field] != null && payload[field] !== '') {
        return String(payload[field]).trim();
      }
      const quoted = makeText.match(new RegExp(`"${field}"\\s*:\\s*"([^"]*)"`, 'i'));
      if (quoted) return quoted[1].trim();
      const unquoted = makeText.match(new RegExp(`"${field}"\\s*:\\s*([^\\r\\n,}{]+)`, 'i'));
      return unquoted ? unquoted[1].replace(/['"]/g, '').trim() : '';
    };

    const foundFlag = payload?.found === true
      || (typeof payload?.found === 'string' && payload.found.toLowerCase() === 'true')
      || /"found"\s*:\s*true/i.test(makeText);

    const foundFalse = payload?.found === false
      || (typeof payload?.found === 'string' && payload.found.toLowerCase() === 'false')
      || /"found"\s*:\s*false/i.test(makeText);

    if (foundFalse || !foundFlag) {
      return { found: false, error: 'unauthorized_member' };
    }

    const firstName = sanitizeName(readField('firstName'));
    const lastName = sanitizeName(readField('lastName'));
    const role = readField('role') || 'Member';
    const contactId = sanitizeSalesforceId(readField('contactId'));
    const name = [firstName, lastName].filter(Boolean).join(' ').trim()
      || emailLower.split('@')[0];

    const phone = readField('mobile') || readField('phone');
    const homePhone = readField('homePhone');
    const street = readField('street') || readField('mailingStreet') || readField('primaryStreet');
    const city = readField('city') || readField('mailingCity') || readField('primaryCity');
    const state = readField('state') || readField('mailingState') || readField('primaryState');
    const postalCode = readField('postalCode') || readField('mailingPostalCode') || readField('primaryPostalCode');
    const country = readField('country') || readField('mailingCountry') || readField('primaryCountry');
    const nickname = readField('nickname');
    const title = readField('title');
    const hebrewName = readField('hebrewName');
    const fathersHebrewName = readField('fathersHebrewName');
    const mothersHebrewName = readField('mothersHebrewName');
    const jewish = readField('jewish');
    const hebrewBirthdate = readField('hebrewBirthdate');
    const nextHebrewBirthday = readField('nextHebrewBirthday');
    const weddingDate = readField('weddingDate');
    const lifecycleStatus = readField('lifecycleStatus') || readField('status');
    const birthdate = readField('birthdate');
    const age = readField('age');
    const gender = readField('gender');

    const lifecycle = {
      hebrewName,
      fathersHebrewName,
      mothersHebrewName,
      jewish,
      hebrewBirthdate,
      nextHebrewBirthday,
      weddingDate,
      lifecycleStatus,
    };

    const additional = { birthdate, age, gender };

    const memberDetails = {
      contactId,
      accountId: sanitizeSalesforceId(readField('accountId')),
      firstName,
      lastName,
      name,
      role: role || 'Member',
      email: emailLower,
      phone,
      mobile: phone,
      homePhone,
      street,
      city,
      state,
      postalCode,
      country,
      nickname,
      title,
      ...lifecycle,
      ...additional,
      profile: {
        phone,
        mobile: phone,
        homePhone,
        street,
        city,
        state,
        postalCode,
        country,
        nickname,
        title,
        accountName: readField('accountName') || name,
        lifecycle,
        ...lifecycle,
        additional,
        ...additional,
      },
    };

    memberDetails.portalData = extractPortalDataFromPayload(payload, memberDetails);

    return {
      found: true,
      memberDetails,
    };
  } catch (err) {
    console.error('Error calling Make.com webhook:', err);
    return { found: false, error: 'membership_check_failed' };
  }
}

function authLog(step, details = {}) {
  const stamp = new Date().toISOString();
  console.log(`[AUTH ${stamp}] ${step}`, details);
}

function pickFirstNonEmpty(...values) {
  for (const value of values) {
    const normalized = (value ?? '').toString().trim();
    if (normalized) return normalized;
  }
  return '';
}

function buildLifecycleFromDetails(details = {}, profile = {}) {
  const lifecycle = profile.lifecycle || {};
  return {
    hebrewName: pickFirstNonEmpty(lifecycle.hebrewName, profile.hebrewName, details.hebrewName),
    fathersHebrewName: pickFirstNonEmpty(lifecycle.fathersHebrewName, profile.fathersHebrewName, details.fathersHebrewName),
    mothersHebrewName: pickFirstNonEmpty(lifecycle.mothersHebrewName, profile.mothersHebrewName, details.mothersHebrewName),
    jewish: pickFirstNonEmpty(lifecycle.jewish, profile.jewish, details.jewish),
    hebrewBirthdate: pickFirstNonEmpty(lifecycle.hebrewBirthdate, profile.hebrewBirthdate, details.hebrewBirthdate),
    nextHebrewBirthday: pickFirstNonEmpty(lifecycle.nextHebrewBirthday, profile.nextHebrewBirthday, details.nextHebrewBirthday),
    weddingDate: pickFirstNonEmpty(lifecycle.weddingDate, profile.weddingDate, details.weddingDate),
    lifecycleStatus: pickFirstNonEmpty(lifecycle.lifecycleStatus, profile.lifecycleStatus, details.lifecycleStatus, details.status),
  };
}

function buildAdditionalFromDetails(details = {}, profile = {}) {
  const additional = profile.additional || {};
  return {
    birthdate: pickFirstNonEmpty(additional.birthdate, profile.birthdate, details.birthdate),
    age: pickFirstNonEmpty(additional.age, profile.age, details.age),
    gender: pickFirstNonEmpty(additional.gender, profile.gender, details.gender),
  };
}

function buildProfileFromDetails(details = {}) {
  const profile = details.profile || {};
  const phone = pickFirstNonEmpty(profile.mobile, profile.phone, details.mobile, details.phone);
  const lifecycle = buildLifecycleFromDetails(details, profile);
  const additional = buildAdditionalFromDetails(details, profile);
  return {
    accountName: pickFirstNonEmpty(profile.accountName, details.name),
    phone,
    mobile: pickFirstNonEmpty(profile.mobile, details.mobile, phone),
    homePhone: pickFirstNonEmpty(profile.homePhone, details.homePhone),
    street: pickFirstNonEmpty(profile.street, details.street, profile.primaryStreet, details.primaryStreet),
    city: pickFirstNonEmpty(profile.city, details.city, profile.primaryCity, details.primaryCity),
    state: pickFirstNonEmpty(profile.state, details.state, profile.primaryState, details.primaryState),
    postalCode: pickFirstNonEmpty(
      profile.postalCode,
      details.postalCode,
      profile.primaryPostalCode,
      details.primaryPostalCode,
    ),
    country: pickFirstNonEmpty(profile.country, details.country, profile.primaryCountry, details.primaryCountry),
    nickname: pickFirstNonEmpty(profile.nickname, details.nickname),
    title: pickFirstNonEmpty(profile.title, details.title),
    lifecycle,
    ...lifecycle,
    additional,
    ...additional,
    householdDonationTotal: profile.householdDonationTotal || '$0.00',
    spiritual: profile.spiritual || {
      kosher: 'No',
      hasPushka: 'No',
      datePushkaLastEmptied: '',
    },
  };
}

function mergeArrayPreferRemote(remote = [], local = []) {
  if (Array.isArray(remote) && remote.length) return remote;
  if (Array.isArray(local) && local.length) return local;
  return [];
}

function parseMoney(value) {
  if (value == null || value === '') return 0;
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatMoney(amount) {
  return `$${amount.toFixed(2)}`;
}

function deriveMembershipSummary(membership, financials, profile) {
  const payments = filterNormalizedPayments(financials?.payments || []);
  const paymentTotal = payments.reduce((sum, item) => sum + parseMoney(item.amount || item.total), 0);
  const pledges = financials?.pledges || [];
  const recurring = financials?.recurring || [];
  const annualFromPledges = pledges.reduce((sum, item) => sum + parseMoney(item.total || item.amount), 0);
  const activeRecurring = recurring.find((item) => (item.status || '').toLowerCase() === 'active') || recurring[0];

  if (membership && Object.keys(membership).length) {
    const annual = parseMoney(membership.annualCommitment) || annualFromPledges;
    const contributed = paymentTotal || parseMoney(membership.contributedYtd);
    return {
      ...membership,
      contributedYtd: formatMoney(contributed),
      outstanding: formatMoney(Math.max(annual - contributed, 0)),
    };
  }

  const annualCommitment = annualFromPledges || parseMoney(profile?.householdDonationTotal);
  const contributed = paymentTotal;

  return {
    tier: 'Member',
    status: profile?.lifecycleStatus || 'Active',
    memberSince: '',
    renewalDate: activeRecurring?.nextDate || '',
    annualCommitment: annualCommitment ? formatMoney(annualCommitment) : '$0.00',
    contributedYtd: formatMoney(contributed),
    outstanding: formatMoney(Math.max(annualCommitment - contributed, 0)),
    autoRenewal: activeRecurring ? 'Enabled' : 'Disabled',
    paymentMethod: activeRecurring?.method || 'Cash',
    paymentMethodExpiry: activeRecurring?.cardExpiry || '',
    notes: '',
  };
}

async function fetchFinancialsFromWebhook(webhookUrl, email, contactId, memberDetails = null) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.toLowerCase(),
      contactId: contactId || '',
      fetchPayments: true,
      fetchFinancials: true,
    }),
  });

  if (!response.ok) {
    console.error(`Make.com financials webhook returned ${response.status} for ${email} (${webhookUrl})`);
    return null;
  }

  const text = await response.text();
  console.log(`Make.com financials for ${email}:`, text.slice(0, 800));
  const payload = parseMakePayload(text);
  if (!payload) {
    console.warn(`Make.com financials JSON parse failed for ${email}`);
    return { fromSalesforce: false, payments: [], pledges: [], recurring: [] };
  }
  const parsed = extractPortalDataFromPayload(payload, memberDetails || {});
  console.log(`Make.com financials parsed for ${email}:`, {
    payments: parsed.payments?.length || 0,
    pledges: parsed.pledges?.length || 0,
    recurring: parsed.recurring?.length || 0,
  });
  return {
    fromSalesforce: Boolean(
      parsed.fromSalesforce
      || parsed.payments.length
      || parsed.pledges.length
      || parsed.recurring.length,
    ),
    payments: parsed.payments || [],
    pledges: parsed.pledges || [],
    recurring: parsed.recurring || [],
  };
}

async function lookupSalesforcePayments(email, contactId, memberDetails = null) {
  const webhookUrl = process.env.MAKE_PAYMENTS_WEBHOOK_URL;
  if (!webhookUrl) {
    return { fromSalesforce: false, payments: [], pledges: [], recurring: [] };
  }

  try {
    let result = await fetchFinancialsFromWebhook(webhookUrl, email, contactId, memberDetails);
    if (!result) return { fromSalesforce: false, payments: [], pledges: [], recurring: [] };

    const hasAny = result.payments.length || result.pledges.length || result.recurring.length;
    if (result.fromSalesforce && !hasAny) {
      console.warn(`Make.com financials webhook returned empty for ${email} — retrying in 3s`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const retry = await fetchFinancialsFromWebhook(webhookUrl, email, contactId, memberDetails);
      if (retry && (retry.payments.length || retry.pledges.length || retry.recurring.length)) {
        result = retry;
      }
    }

    return result;
  } catch (err) {
    console.error(`Error calling Make.com financials webhook for ${email}:`, err);
    return { fromSalesforce: false, payments: [], pledges: [], recurring: [] };
  }
}

async function fetchPortalDataFromWebhook(webhookUrl, email, contactId, memberDetails = null) {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.toLowerCase(),
      contactId: contactId || '',
      fetchPortal: true,
    }),
  });

  if (!response.ok) {
    console.error(`Make.com portal webhook returned ${response.status} for ${email} (${webhookUrl})`);
    return null;
  }

  const text = await response.text();
  console.log(`Make.com portal data for ${email}:`, text.slice(0, 800));
  const payload = parseMakePayload(text);
  return extractPortalDataFromPayload(payload, memberDetails || {});
}

async function lookupSalesforcePortalData(email, contactId, memberDetails = null) {
  const webhookUrls = [...new Set([
    process.env.MAKE_PORTAL_DATA_WEBHOOK_URL,
    process.env.MAKE_WEBHOOK_URL,
  ].filter(Boolean))];

  if (!webhookUrls.length) {
    return extractPortalDataFromPayload(null, memberDetails || {});
  }

  for (const webhookUrl of webhookUrls) {
    try {
      let portalData = await fetchPortalDataFromWebhook(webhookUrl, email, contactId, memberDetails);
      if (!portalData) continue;

      if (portalData.fromSalesforce && !portalData.relationships?.length) {
        console.warn(`Make.com portal webhook returned no relationships for ${email} — retrying in 3s`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const retryData = await fetchPortalDataFromWebhook(webhookUrl, email, contactId, memberDetails);
        if (retryData?.relationships?.length) {
          portalData = retryData;
        }
      }

      if (
        portalData.fromSalesforce
        || portalData.contacts.length > 1
        || portalData.relationships.length
        || portalData.payments.length
        || portalData.pledges.length
        || portalData.recurring.length
      ) {
        return portalData;
      }
    } catch (err) {
      console.error(`Error calling Make.com portal webhook for ${email}:`, err);
    }
  }

  return extractPortalDataFromPayload(null, memberDetails || {});
}

function buildFinancialsFromSources(localFinancials = {}, portalData = {}) {
  const filterPayments = (list = []) => filterNormalizedPayments(list);

  if (portalData.fromSalesforce) {
    const payments = filterPayments(portalData.payments || []);
    const pledges = portalData.pledges || [];
    const recurring = portalData.recurring || [];
    const totalPayments = payments.reduce((sum, item) => sum + parseMoney(item.amount || item.total), 0);

    return { totalPayments, payments, pledges, recurring };
  }

  const payments = filterPayments(mergePaymentsRemoteAndLocal(
    portalData.payments || [],
    localFinancials?.payments || [],
  ));
  const pledges = mergeArrayPreferRemote(portalData.pledges, localFinancials?.pledges);
  const recurring = mergeArrayPreferRemote(portalData.recurring, localFinancials?.recurring);
  const totalPayments = payments.reduce((sum, item) => sum + parseMoney(item.amount || item.total), 0)
    || localFinancials.totalPayments
    || 0;

  return {
    totalPayments,
    payments,
    pledges,
    recurring,
  };
}

function mergeMemberProfile(sfDetails, localMember, portalData = null) {
  const effectivePortal = portalData ?? extractPortalDataFromPayload(null, sfDetails);
  const localProfile = localMember?.profile || {};
  const sfProfile = buildProfileFromDetails(sfDetails);
  const firstName = pickFirstNonEmpty(sfDetails.firstName, localMember?.firstName, localMember?.name?.split(/\s+/)[0]);
  const lastName = pickFirstNonEmpty(
    sfDetails.lastName,
    localMember?.lastName,
    localMember?.name?.split(/\s+/).slice(1).join(' '),
  );
  const name = pickFirstNonEmpty(
    [firstName, lastName].filter(Boolean).join(' '),
    sfDetails.name,
    localMember?.name,
    sfDetails.email?.split('@')[0],
  );

  return {
    contactId: pickFirstNonEmpty(sfDetails.contactId, localMember?.contactId),
    accountId: pickFirstNonEmpty(effectivePortal?.accountId, sfDetails.accountId, localMember?.accountId),
    firstName,
    lastName,
    name,
    email: pickFirstNonEmpty(sfDetails.email, localMember?.email),
    role: pickFirstNonEmpty(sfDetails.role, localMember?.role, 'Member'),
    account: {
      id: pickFirstNonEmpty(effectivePortal?.accountId, sfDetails.accountId, localMember?.accountId),
      name: pickFirstNonEmpty(effectivePortal?.accountName, localProfile.accountName, sfProfile.accountName, name),
      phone: pickFirstNonEmpty(effectivePortal?.phone, sfProfile.phone, localProfile.phone),
      email: pickFirstNonEmpty(effectivePortal?.email, sfDetails.email, localMember?.email),
      street: pickFirstNonEmpty(effectivePortal?.street, sfProfile.street, localProfile.street),
      city: pickFirstNonEmpty(effectivePortal?.city, sfProfile.city, localProfile.city),
      state: pickFirstNonEmpty(effectivePortal?.state, sfProfile.state, localProfile.state),
      postalCode: pickFirstNonEmpty(effectivePortal?.postalCode, sfProfile.postalCode, localProfile.postalCode),
      country: pickFirstNonEmpty(effectivePortal?.country, sfProfile.country, localProfile.country),
    },
    profile: {
      ...sfProfile,
      accountName: pickFirstNonEmpty(effectivePortal?.accountName, sfProfile.accountName, localProfile.accountName, name),
      phone: pickFirstNonEmpty(sfProfile.phone, sfProfile.mobile, localProfile.phone),
      mobile: pickFirstNonEmpty(sfProfile.mobile, sfProfile.phone, localProfile.phone),
      homePhone: pickFirstNonEmpty(sfProfile.homePhone, localProfile.homePhone),
      street: pickFirstNonEmpty(sfProfile.street, localProfile.street),
      city: pickFirstNonEmpty(sfProfile.city, localProfile.city),
      state: pickFirstNonEmpty(sfProfile.state, localProfile.state),
      postalCode: pickFirstNonEmpty(sfProfile.postalCode, localProfile.postalCode),
      country: pickFirstNonEmpty(sfProfile.country, localProfile.country),
      nickname: pickFirstNonEmpty(sfProfile.nickname, localProfile.nickname),
      title: pickFirstNonEmpty(sfProfile.title, localProfile.title),
      lifecycle: {
        hebrewName: pickFirstNonEmpty(sfProfile.lifecycle?.hebrewName, localProfile.lifecycle?.hebrewName, sfProfile.hebrewName),
        fathersHebrewName: pickFirstNonEmpty(sfProfile.lifecycle?.fathersHebrewName, localProfile.lifecycle?.fathersHebrewName, sfProfile.fathersHebrewName),
        mothersHebrewName: pickFirstNonEmpty(sfProfile.lifecycle?.mothersHebrewName, localProfile.lifecycle?.mothersHebrewName, sfProfile.mothersHebrewName),
        jewish: pickFirstNonEmpty(sfProfile.lifecycle?.jewish, localProfile.lifecycle?.jewish, sfProfile.jewish),
        hebrewBirthdate: pickFirstNonEmpty(sfProfile.lifecycle?.hebrewBirthdate, localProfile.lifecycle?.hebrewBirthdate, sfProfile.hebrewBirthdate),
        nextHebrewBirthday: pickFirstNonEmpty(sfProfile.lifecycle?.nextHebrewBirthday, localProfile.lifecycle?.nextHebrewBirthday, sfProfile.nextHebrewBirthday),
        weddingDate: pickFirstNonEmpty(sfProfile.lifecycle?.weddingDate, localProfile.lifecycle?.weddingDate, sfProfile.weddingDate),
        lifecycleStatus: pickFirstNonEmpty(sfProfile.lifecycle?.lifecycleStatus, localProfile.lifecycle?.lifecycleStatus, sfProfile.lifecycleStatus),
      },
      additional: {
        birthdate: pickFirstNonEmpty(sfProfile.additional?.birthdate, localProfile.additional?.birthdate, sfProfile.birthdate),
        age: pickFirstNonEmpty(sfProfile.additional?.age, localProfile.additional?.age, sfProfile.age),
        gender: pickFirstNonEmpty(sfProfile.additional?.gender, localProfile.additional?.gender, sfProfile.gender),
      },
      householdDonationTotal: localProfile.householdDonationTotal || sfProfile.householdDonationTotal || '$0.00',
      spiritual: localProfile.spiritual || sfProfile.spiritual,
    },
    contacts: effectivePortal.contacts || [],
    relationships: effectivePortal.relationships || [],
    financials: buildFinancialsFromSources(localMember?.financials, effectivePortal),
    membership: deriveMembershipSummary(
      effectivePortal.membership,
      buildFinancialsFromSources(localMember?.financials, effectivePortal),
      {
        lifecycleStatus: pickFirstNonEmpty(
          sfProfile.lifecycle?.lifecycleStatus,
          localProfile.lifecycle?.lifecycleStatus,
        ),
        householdDonationTotal: localProfile.householdDonationTotal || sfProfile.householdDonationTotal,
      },
    ),
  };
}

async function buildPortalSfData(email) {
  const lookup = await lookupSalesforceMember(email);
  if (!lookup.found) {
    return { error: 'unauthorized_member', lookup };
  }

  const memberDetails = lookup.memberDetails;
  const localMember = await db.getMemberByEmail(email);
  const portalData = await lookupSalesforcePortalData(email, memberDetails.contactId, memberDetails);
  const financialsData = await lookupSalesforcePayments(email, memberDetails.contactId, memberDetails);

  const mergedPortal = {
    ...portalData,
    payments: financialsData.payments?.length ? financialsData.payments : (portalData.payments || []),
    pledges: financialsData.pledges?.length ? financialsData.pledges : (portalData.pledges || []),
    recurring: financialsData.recurring?.length ? financialsData.recurring : (portalData.recurring || []),
    fromSalesforce: portalData.fromSalesforce || financialsData.fromSalesforce,
  };

  const sfData = mergeMemberProfile(memberDetails, localMember, mergedPortal);

  userSalesforceData[email] = sfData;
  return { sfData, memberDetails, portalData: mergedPortal };
}

async function resolveAuthedEmail(token) {
  const decoded = await verifyClerkSessionToken(token);
  const clerkUser = await clerkClient.users.getUser(decoded.sub);
  return {
    userId: decoded.sub,
    email: clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase() || '',
  };
}

function deriveClerkNames(memberDetails) {
  const firstName = (memberDetails.firstName || memberDetails.name?.split(/\s+/)[0] || 'Member').trim();
  const lastName = (
    memberDetails.lastName
    || memberDetails.name?.split(/\s+/).slice(1).join(' ')
    || 'User'
  ).trim();

  return { firstName, lastName };
}

async function ensureClerkMemberUser(memberDetails) {
  if (!process.env.CLERK_SECRET_KEY) {
    authLog('CLERK_SKIP', { reason: 'CLERK_SECRET_KEY missing', email: memberDetails.email });
    return null;
  }

  const email = memberDetails.email.toLowerCase();
  const { firstName, lastName } = deriveClerkNames(memberDetails);

  try {
    const existing = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
    if (existing.totalCount > 0) {
      authLog('CLERK_USER_EXISTS', {
        email,
        clerkUserId: existing.data[0].id,
        firstName,
        lastName,
      });
      return existing.data[0];
    }

    const created = await clerkClient.users.createUser({
      emailAddress: [email],
      firstName,
      lastName,
      skipPasswordRequirement: true,
    });

    authLog('CLERK_USER_CREATED', { email, clerkUserId: created.id, firstName, lastName });
    return created;
  } catch (err) {
    const clerkErrors = err.errors || [];
    const alreadyExists = clerkErrors.some((e) => e.code === 'form_identifier_exists');
    if (alreadyExists) {
      const existing = await clerkClient.users.getUserList({ emailAddress: [email], limit: 1 });
      authLog('CLERK_USER_EXISTS_RACE', {
        email,
        clerkUserId: existing.data[0]?.id || null,
      });
      return existing.data[0] || null;
    }

    authLog('CLERK_USER_FAILED', {
      email,
      error: clerkErrors.length ? clerkErrors : err.message,
    });
    return null;
  }
}

// Transporter setup
let transporter;

async function getTransporter() {
  if (transporter) return transporter;

  const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

  if (hasSmtpConfig) {
    console.log('Using configured SMTP settings for mail delivery.');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || parseInt(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS ? process.env.SMTP_PASS.replace(/\s+/g, '') : '',
      },
    });
  } else {
    console.log('No SMTP config found. Generating an Ethereal SMTP test account dynamically...');
    try {
      const testAccount = await nodemailer.createTestAccount();
      console.log(`Ethereal Account Created: User: ${testAccount.user}`);
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    } catch (err) {
      console.error('Failed to create Ethereal test account:', err);
      // Fallback dummy transporter to not crash
      transporter = nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }

  return transporter;
}

// Ensure transporter is set up on boot
getTransporter();

// Endpoint to fetch dev helper link
app.get('/api/auth/dev-last-link', (req, res) => {
  res.json({ link: devLastLink, emailUrl: devLastEmailUrl });
});

// Frontend auth flow tracing — logs appear in this terminal
app.post('/api/auth/trace', (req, res) => {
  const { step, email, at, url, path, ...rest } = req.body || {};
  authLog(`FRONTEND → ${step || 'unknown'}`, {
    email: email || null,
    path: path || null,
    url: url || null,
    at: at || null,
    ...rest,
  });
  res.json({ ok: true });
});

// Request magic link
// Verification Endpoint for frontend to check if the member exists in Salesforce/Make.com
app.post('/api/auth/check-member', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    authLog('CHECK_MEMBER_REJECT', { reason: 'invalid_email', email });
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }

  const emailLower = email.toLowerCase();
  authLog('CHECK_MEMBER_START', { email: emailLower });

  const lookup = await lookupSalesforceMember(emailLower);

  if (lookup.error === 'membership_check_unavailable') {
    authLog('CHECK_MEMBER_FAIL', { email: emailLower, error: lookup.error });
    return res.status(503).json({
      allowed: false,
      error: 'membership_check_unavailable',
      message: 'Member verification is temporarily unavailable. Please try again later.',
    });
  }

  if (lookup.error === 'membership_check_failed') {
    authLog('CHECK_MEMBER_FAIL', { email: emailLower, error: lookup.error });
    return res.status(503).json({
      allowed: false,
      error: 'membership_check_failed',
      message: 'Unable to verify membership right now. Please try again later.',
    });
  }

  if (!lookup.found) {
    authLog('CHECK_MEMBER_DENIED', { email: emailLower, error: lookup.error || 'unauthorized_member' });
    return res.status(403).json({
      allowed: false,
      error: lookup.error || 'unauthorized_member',
      message: 'You are not authorised to login to the member portal.',
    });
  }

  authLog('SALESFORCE_OK', {
    email: emailLower,
    name: lookup.memberDetails.name,
    contactId: lookup.memberDetails.contactId || '(empty)',
    firstName: lookup.memberDetails.firstName || '(empty)',
    lastName: lookup.memberDetails.lastName || '(empty)',
  });

  const clerkUser = await ensureClerkMemberUser(lookup.memberDetails);
  if (process.env.CLERK_SECRET_KEY && !clerkUser) {
    authLog('CHECK_MEMBER_FAIL', { email: emailLower, error: 'clerk_provisioning_failed' });
    return res.status(503).json({
      allowed: false,
      error: 'clerk_provisioning_failed',
      message: 'Unable to prepare your login account. Please try again later.',
    });
  }

  authLog('CHECK_MEMBER_OK', {
    email: emailLower,
    clerkUserId: clerkUser?.id || null,
    nextStep: 'frontend sends Clerk magic link',
  });

  res.json({ allowed: true, member: lookup.memberDetails });
});

// Protected portal dashboard data
app.get('/api/portal/dashboard', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = await verifyClerkSessionToken(token);

    const userId = decoded.sub;
    authLog('DASHBOARD_AUTH_OK', { clerkUserId: userId });
    
    // Fetch user details from Clerk to get email
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
    
    if (!email) {
      return res.status(400).json({ error: 'No email address found for this user.' });
    }

    const result = await buildPortalSfData(email);
    if (result.error) {
      authLog('DASHBOARD_DENIED', { email, reason: 'not_in_salesforce' });
      return res.status(403).json({
        error: 'unauthorized_member',
        message: 'You are not authorised to login to the member portal.',
      });
    }

    const { sfData } = result;

    // Fetch portal metrics and items
    const dashboardData = await db.getDashboardData();
    authLog('DASHBOARD_OK', {
      email,
      clerkUserId: userId,
      name: sfData?.name,
      contactId: sfData?.contactId,
      contacts: sfData?.contacts?.length || 0,
      payments: sfData?.financials?.payments?.length || 0,
      city: sfData?.profile?.city || null,
      mobile: sfData?.profile?.mobile || null,
    });
    res.json({
      success: true,
      user: {
        id: userId,
        email: email,
        role: sfData?.role || 'Member',
        name: sfData?.name || 'Chabad Bedford Member',
      },
      sfData,
      ...dashboardData,
    });
  } catch (error) {
    authLog('DASHBOARD_AUTH_FAIL', { error: error.message });
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
});

app.post('/api/portal/refresh', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { email } = await resolveAuthedEmail(token);
    if (!email) {
      return res.status(400).json({ error: 'No email address found for this user.' });
    }

    const result = await buildPortalSfData(email);
    if (result.error) {
      return res.status(403).json({ error: result.error });
    }

    res.json({ success: true, sfData: result.sfData, syncedFromSalesforce: Boolean(result.portalData?.fromSalesforce) });
  } catch (error) {
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
});

// Stripe Checkout Session generation
async function resolveCheckoutContactId(authHeader, email, contactId = '') {
  let resolvedContactId = contactId || '';
  if (authHeader?.startsWith('Bearer ') && !resolvedContactId) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = await verifyClerkSessionToken(token);
      const clerkUser = await clerkClient.users.getUser(decoded.sub);
      const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
      resolvedContactId = userSalesforceData[clerkEmail]?.contactId || '';
    } catch {
      // Non-blocking
    }
  }
  if (!resolvedContactId && email) {
    resolvedContactId = userSalesforceData[email.toLowerCase()]?.contactId || '';
  }
  return resolvedContactId;
}

function pickCachedAccountId(email, accountId = '') {
  if (accountId) return accountId;
  if (email) {
    return userSalesforceData[email.toLowerCase()]?.accountId || '';
  }
  return '';
}

function toSalesforceDateIso(dateStr = '') {
  const dateOnly = (dateStr || new Date().toISOString().split('T')[0]).slice(0, 10);
  return `${dateOnly}T04:00:00.000Z`;
}

function buildCheckoutClientReferenceId(payload) {
  return [
    payload.accountId || '',
    payload.contactId || '',
    String(payload.paymentAmount ?? ''),
    payload.paymentDate || '',
    payload.paymentType || 'Donation',
  ].join('|');
}

function parseCheckoutClientReferenceId(clientReferenceId = '') {
  const parts = String(clientReferenceId || '').split('|');
  if (parts.length < 2) return {};
  return {
    accountId: parts[0] || '',
    contactId: parts[1] || '',
    paymentAmount: parseFloat(parts[2]) || 0,
    paymentDate: parts[3] || '',
    paymentType: parts[4] || 'Donation',
  };
}

async function resolveCheckoutAccountId(authHeader, email, accountId = '') {
  let resolvedAccountId = pickCachedAccountId(email, accountId);
  if (resolvedAccountId) return resolvedAccountId;

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = await verifyClerkSessionToken(token);
      const clerkUser = await clerkClient.users.getUser(decoded.sub);
      const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
      resolvedAccountId = userSalesforceData[clerkEmail]?.accountId || '';
      if (resolvedAccountId) return resolvedAccountId;
    } catch {
      // Non-blocking
    }
  }

  if (email) {
    try {
      const result = await buildPortalSfData(email);
      resolvedAccountId = result.sfData?.accountId || result.sfData?.account?.id || '';
      if (resolvedAccountId) return resolvedAccountId;
    } catch {
      // Non-blocking
    }
  }

  return '';
}

function buildQuickPaymentPayload(body, contactId) {
  const pledgeAmount = parseFloat(body.pledgeAmount) || 0;
  const paymentAmount = parseFloat(body.paymentAmount) || 0;
  const billingMode = body.billingMode === 'recurring' ? 'recurring' : 'regular';
  return {
    email: (body.email || '').toLowerCase(),
    contactId,
    accountId: body.accountId || '',
    purpose: body.purpose || 'portal_payment',
    paymentType: body.paymentType || 'Donation',
    subType: body.subType || 'General',
    memo: body.memo || '',
    pledgeAmount,
    paymentAmount,
    billingMode,
    isRecurring: billingMode === 'recurring' ? 'true' : 'false',
    paymentDate: body.paymentDate || new Date().toISOString().split('T')[0],
    source: 'member_portal',
  };
}

async function triggerQuickPaymentWebhook(payload) {
  const webhookUrl = process.env.MAKE_QUICK_PAYMENT_WEBHOOK_URL
    || process.env.MAKE_STRIPE_PAYMENT_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error('MAKE_QUICK_PAYMENT_WEBHOOK_URL or MAKE_STRIPE_PAYMENT_WEBHOOK_URL is not configured.');
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Make.com quick payment webhook returned ${response.status}`);
  }

  return response.text();
}

async function triggerStripePaymentWebhook(payload) {
  const webhookUrl = process.env.MAKE_STRIPE_PAYMENT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.log('[PAYMENT] MAKE_STRIPE_PAYMENT_WEBHOOK_URL not set — skipping portal webhook (Stripe Dashboard webhook handles sync).');
    return null;
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Make.com Stripe payment webhook returned ${response.status}`);
  }

  console.log(`[PAYMENT] Make webhook sent: accountId=${payload.accountId || '(missing)'}, contactId=${payload.contactId || '(missing)'}, amount=${payload.paymentAmount}`);
  return response.text();
}

function buildPayloadFromCheckoutSession(session) {
  const metadata = session.metadata || {};
  const refData = parseCheckoutClientReferenceId(session.client_reference_id);
  const email = (metadata.email || session.customer_email || session.customer_details?.email || '').toLowerCase();
  const paymentAmount = parseFloat(metadata.paymentAmount)
    || refData.paymentAmount
    || (session.amount_total ? session.amount_total / 100 : 0);
  const pledgeAmount = parseFloat(metadata.pledgeAmount) || 0;
  const billingMode = metadata.billingMode === 'recurring' ? 'recurring' : 'regular';

  return {
    email,
    contactId: metadata.contactId || refData.contactId || '',
    accountId: metadata.accountId || refData.accountId || '',
    purpose: metadata.purpose || 'portal_payment',
    paymentType: metadata.paymentType || refData.paymentType || 'Donation',
    subType: metadata.subType || 'General',
    memo: metadata.memo || '',
    pledgeAmount,
    paymentAmount,
    billingMode,
    isRecurring: metadata.isRecurring === 'true' || billingMode === 'recurring' ? 'true' : 'false',
    paymentDate: metadata.paymentDate || refData.paymentDate || new Date().toISOString().split('T')[0],
    paymentDateIso: toSalesforceDateIso(metadata.paymentDate || refData.paymentDate || ''),
    source: metadata.source || 'member_portal',
    stripeSessionId: session.id,
    stripePaymentStatus: session.payment_status,
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || '',
  };
}

app.post('/api/payments/quick-payment', async (req, res) => {
  const authHeader = req.headers.authorization;
  const body = req.body || {};
  const email = (body.email || '').toLowerCase();
  const pledgeAmount = parseFloat(body.pledgeAmount) || 0;
  const paymentAmount = parseFloat(body.paymentAmount) || 0;
  const billingMode = body.billingMode === 'recurring' ? 'recurring' : 'regular';

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (pledgeAmount <= 0 && paymentAmount <= 0) {
    return res.status(400).json({ error: 'Enter a pledge amount and/or payment amount.' });
  }

  const contactId = await resolveCheckoutContactId(authHeader, email, body.contactId || '');
  const accountId = await resolveCheckoutAccountId(authHeader, email, body.accountId || '');
  const payload = buildQuickPaymentPayload({ ...body, accountId }, contactId);

  // Pledge-only or recurring setup without immediate Stripe charge
  if (paymentAmount <= 0) {
    try {
      await triggerQuickPaymentWebhook(payload);
      const message = billingMode === 'recurring'
        ? 'Recurring billing profile created in ChabadOne CRM.'
        : 'Pledge saved to ChabadOne CRM.';
      return res.json({ success: true, message });
    } catch (error) {
      console.error('Quick payment webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe integration is not configured.' });
  }

  try {
    const checkoutLabel = [payload.paymentType, payload.subType].filter(Boolean).join(' — ');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: checkoutLabel || payload.purpose,
            description: payload.memo || `Portal: ${payload.paymentType} / ${payload.subType}`,
          },
          unit_amount: Math.round(paymentAmount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      client_reference_id: buildCheckoutClientReferenceId({ ...payload, contactId }),
      metadata: {
        ...payload,
        donorId: payload.accountId || '',
        paymentDateIso: toSalesforceDateIso(payload.paymentDate),
        pledgeAmount: String(pledgeAmount),
        paymentAmount: String(paymentAmount),
      },
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
    });

    console.log(`[PAYMENT] checkout session ${session.id} metadata: accountId=${payload.accountId || '(missing)'}, contactId=${contactId || '(missing)'}, email=${email}`);
    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe Checkout Session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/confirm-checkout', async (req, res) => {
  const authHeader = req.headers.authorization;
  const sessionId = (req.body?.sessionId || req.body?.session_id || '').trim();

  console.log(`[PAYMENT] confirm-checkout requested for session: ${sessionId || '(missing)'}`);

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required.' });
  }
  if (!stripe) {
    return res.status(500).json({ error: 'Stripe integration is not configured.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    let userEmail = '';
    if (token === 'dev_token_for_testing') {
      userEmail = (req.body.email || 'acc.appledev@gmail.com').toLowerCase();
    } else {
      const decoded = await verifyClerkSessionToken(token);
      const clerkUser = await clerkClient.users.getUser(decoded.sub);
      userEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase() || '';
    }

    if (!userEmail) {
      return res.status(400).json({ error: 'No email address found for this user.' });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment is not completed yet.' });
    }

    const payload = buildPayloadFromCheckoutSession(session);
    if (payload.email && payload.email !== userEmail) {
      return res.status(403).json({ error: 'This checkout session does not belong to the signed-in user.' });
    }
    if (!payload.email) {
      payload.email = userEmail;
    }
    if (!payload.accountId) {
      payload.accountId = await resolveCheckoutAccountId(authHeader, payload.email, '');
    }
    if (!payload.contactId) {
      payload.contactId = await resolveCheckoutContactId(authHeader, payload.email, '');
    }

    if (processedCheckoutSessions.has(sessionId)) {
      return res.json({ success: true, alreadyProcessed: true, message: 'Payment already synced to ChabadOne CRM.' });
    }

    if (!process.env.MAKE_STRIPE_PAYMENT_WEBHOOK_URL) {
      return res.status(500).json({
        error: 'MAKE_STRIPE_PAYMENT_WEBHOOK_URL is not configured. Add your Make.com Custom Webhook URL to backend/.env',
      });
    }

    await triggerStripePaymentWebhook(payload);
    processedCheckoutSessions.add(sessionId);

    const message = 'Payment synced to ChabadOne CRM.';
    console.log(`[PAYMENT] confirm-checkout OK for ${payload.email}, amount: ${payload.paymentAmount}, accountId: ${payload.accountId || '(missing)'}`);
    res.json({ success: true, message });
  } catch (error) {
    console.error('Error confirming Stripe checkout:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/payments/create-checkout-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const {
    email,
    amount,
    contactId,
    purpose,
    paymentType = 'Donation',
    subType = 'General',
    memo = '',
  } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe integration is not configured. Please add STRIPE_SECRET_KEY to backend .env file.' });
  }

  try {
    const resolvedContactId = await resolveCheckoutContactId(authHeader, email, contactId || '');
    const checkoutLabel = [paymentType, subType].filter(Boolean).join(' — ');
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: checkoutLabel || purpose || 'Chabad Bedford Payment',
            description: memo || `Portal payment: ${paymentType}${subType ? ` / ${subType}` : ''}`,
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        email: email.toLowerCase(),
        contactId: resolvedContactId,
        purpose: purpose || 'portal_payment',
        paymentType,
        subType,
        memo: memo || '',
        source: 'member_portal',
        pledgeAmount: '0',
        paymentAmount: String(amount),
        billingMode: 'regular',
        isRecurring: 'false',
      },
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Error creating Stripe Checkout Session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Verification Endpoint called by Make.com after Stripe success webhook
app.post('/api/payments/verify', async (req, res) => {
  const { email, amount, type, method } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  try {
    console.log(`Verified payment from Make.com for email: ${email}, amount: ${amount}`);
    const updatedMember = await db.recordPayment(email, parseFloat(amount), type, method);
    res.json({ success: true, member: updatedMember });
  } catch (error) {
    console.error('Error recording payment in backend:', error);
    res.status(500).json({ error: error.message });
  }
});

// Profile update endpoint
app.post('/api/portal/update-profile', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    let email;
    if (token === 'dev_token_for_testing') {
      email = (req.body.email || 'acc.appledev@gmail.com').toLowerCase();
    } else {
      const decoded = await verifyClerkSessionToken(token);

      const userId = decoded.sub;
      
      // Fetch user details from Clerk to get email
      const clerkUser = await clerkClient.users.getUser(userId);
      email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
    }
    
    if (!email) {
      return res.status(400).json({ error: 'No email address found for this user.' });
    }

    const {
      firstName, lastName, phone, homePhone, street, city, state, postalCode, country, nickname, title,
      hebrewName, fathersHebrewName, mothersHebrewName, jewish, hebrewBirthdate,
      nextHebrewBirthday, weddingDate, lifecycleStatus,
      birthdate, age, gender,
    } = req.body;

    console.log(`Updating profile for: ${email}`);

    // Retrieve existing member to get contactId
    const existingMember = await db.getMemberByEmail(email);
    let contactId = existingMember?.contactId || userSalesforceData[email]?.contactId || '';

    // If contactId is empty, try to query Make.com search webhook to fetch it dynamically
    if (!contactId && process.env.MAKE_WEBHOOK_URL) {
      console.log(`Contact ID missing for ${email}. Fetching dynamically from Make.com...`);
      try {
        const makeResponse = await fetch(process.env.MAKE_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        });

        if (makeResponse.ok) {
          const makeText = await makeResponse.text();
          const foundMatch = makeText.match(/"found":\s*(true|false)/i);
          if (foundMatch && foundMatch[1] === 'true') {
            const contactIdMatch = makeText.match(/"contactId":\s*([^\r\n,]+)/);
            if (contactIdMatch) {
              contactId = contactIdMatch[1].replace(/['"]/g, '').trim();
            }
          }
        }
      } catch (err) {
        console.error('Error fetching contactId dynamically:', err);
      }
    }

    // Call Make.com Profile Update Webhook if configured
    if (process.env.MAKE_PROFILE_UPDATE_WEBHOOK_URL) {
      console.log(`Triggering Make.com Profile Update webhook for Salesforce Contact ID ${contactId}: ${process.env.MAKE_PROFILE_UPDATE_WEBHOOK_URL}`);
      try {
        const makeResponse = await fetch(process.env.MAKE_PROFILE_UPDATE_WEBHOOK_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contactId,
            email,
            firstName,
            lastName,
            phone,
            mobile: phone,
            homePhone: homePhone || phone,
            street,
            city,
            state,
            postalCode,
            country,
            nickname,
            title,
            hebrewName,
            fathersHebrewName,
            mothersHebrewName,
            jewish,
            hebrewBirthdate,
            nextHebrewBirthday,
            weddingDate,
            lifecycleStatus,
            birthdate,
            age,
            gender,
          }),
        });

        if (makeResponse.ok) {
          const makeText = await makeResponse.text();
          console.log('Make.com Profile Update raw response:', makeText);
        } else {
          console.error(`Make.com profile update webhook failed with status ${makeResponse.status}`);
        }
      } catch (err) {
        console.error('Error calling Make.com profile update webhook:', err);
      }
    } else {
      console.warn('MAKE_PROFILE_UPDATE_WEBHOOK_URL is not configured in environment variables.');
    }

    // Save changes in local database
    const updatedMember = await db.updateMemberProfile(email, {
      firstName,
      lastName,
      phone,
      homePhone,
      street,
      city,
      state,
      postalCode,
      country,
      nickname,
      title,
      hebrewName,
      fathersHebrewName,
      mothersHebrewName,
      jewish,
      hebrewBirthdate,
      nextHebrewBirthday,
      weddingDate,
      lifecycleStatus,
      birthdate,
      age,
      gender,
    }, contactId);

    const lifecycle = {
      hebrewName,
      fathersHebrewName,
      mothersHebrewName,
      jewish,
      hebrewBirthdate,
      nextHebrewBirthday,
      weddingDate,
      lifecycleStatus,
    };

    const additional = { birthdate, age, gender };

    const sfData = mergeMemberProfile(
      {
        contactId,
        firstName,
        lastName,
        name: `${firstName || ''} ${lastName || ''}`.trim(),
        email,
        role: updatedMember.role || 'Member',
        ...lifecycle,
        ...additional,
        profile: {
          phone,
          mobile: phone,
          homePhone,
          street,
          city,
          state,
          postalCode,
          country,
          nickname,
          title,
          lifecycle,
          ...lifecycle,
          additional,
          ...additional,
        },
      },
      updatedMember,
    );

    // Update cached user data
    userSalesforceData[email] = sfData;

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      sfData,
    });
  } catch (error) {
    console.error('Profile update authorization or save error:', error);
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Church Portal backend server running on http://localhost:${PORT}`);
});
