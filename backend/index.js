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
} = require('./portalDataMapper');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyformagiclinks';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DEV_LOCALHOST_ORIGIN = /^https?:\/\/localhost(?::\d+)?$/;

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
  if (membership && Object.keys(membership).length) {
    return membership;
  }

  const pledges = financials?.pledges || [];
  const recurring = financials?.recurring || [];
  const annualCommitment = pledges.reduce((sum, item) => sum + parseMoney(item.total || item.amount), 0);
  const contributed = pledges.reduce((sum, item) => sum + parseMoney(item.paid || item.amount), 0);
  const activeRecurring = recurring.find((item) => (item.status || '').toLowerCase() === 'active') || recurring[0];

  return {
    tier: 'Member',
    status: profile?.lifecycleStatus || 'Active',
    memberSince: '',
    renewalDate: activeRecurring?.nextDate || '',
    annualCommitment: annualCommitment ? formatMoney(annualCommitment) : formatMoney(parseMoney(profile?.householdDonationTotal)),
    contributedYtd: formatMoney(contributed),
    outstanding: formatMoney(Math.max(annualCommitment - contributed, 0)),
    autoRenewal: activeRecurring ? 'Enabled' : 'Disabled',
    paymentMethod: activeRecurring?.method || '',
    paymentMethodExpiry: activeRecurring?.cardExpiry || '',
    notes: '',
  };
}

async function lookupSalesforcePortalData(email, contactId, memberDetails = null) {
  const webhookUrls = [...new Set([
    process.env.MAKE_PORTAL_DATA_WEBHOOK_URL,
    process.env.MAKE_WEBHOOK_URL,
  ].filter(Boolean))];

  if (!webhookUrls.length) {
    return memberDetails?.portalData || extractPortalDataFromPayload(null, memberDetails || {});
  }

  for (const webhookUrl of webhookUrls) {
    try {
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
        continue;
      }

      const text = await response.text();
      console.log(`Make.com portal data for ${email}:`, text.slice(0, 800));
      const payload = parseMakePayload(text);
      const portalData = extractPortalDataFromPayload(payload, memberDetails || {});

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

  return memberDetails?.portalData || extractPortalDataFromPayload(null, memberDetails || {});
}

function buildFinancialsFromSources(localFinancials = {}, portalData = {}) {
  const payments = mergePaymentsRemoteAndLocal(
    portalData.payments || [],
    localFinancials?.payments || [],
  );
  const pledges = mergeArrayPreferRemote(portalData.pledges, portalData.fromSalesforce ? [] : localFinancials?.pledges);
  const recurring = mergeArrayPreferRemote(portalData.recurring, portalData.fromSalesforce ? [] : localFinancials?.recurring);
  const totalPayments = payments.reduce((sum, item) => sum + parseMoney(item.amount), 0)
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
  const effectivePortal = portalData || sfDetails?.portalData || extractPortalDataFromPayload(null, sfDetails);
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
    relationships: effectivePortal.fromSalesforce
      ? (effectivePortal.relationships || [])
      : mergeArrayPreferRemote(effectivePortal.relationships, localMember?.syncedFromSalesforce ? localMember?.relationships : []),
    financials: buildFinancialsFromSources(localMember?.financials, effectivePortal),
    membership: deriveMembershipSummary(
      effectivePortal.membership || (localMember?.syncedFromSalesforce ? localMember?.membership : null),
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
  const sfData = mergeMemberProfile(memberDetails, localMember, portalData);

  if (portalData?.fromSalesforce || portalData?.contacts?.length) {
    await db.syncPortalData(email, { ...portalData, fromSalesforce: true }, memberDetails.contactId);
  }

  userSalesforceData[email] = sfData;
  return { sfData, memberDetails, portalData };
}

async function resolveAuthedEmail(token) {
  const decoded = await verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
  });
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
    // Verify Clerk JWT Session Token
    const decoded = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    
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
// Stripe Checkout Session generation
app.post('/api/payments/create-checkout-session', async (req, res) => {
  const authHeader = req.headers.authorization;
  const { email, amount, contactId, purpose } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe integration is not configured. Please add STRIPE_SECRET_KEY to backend .env file.' });
  }

  let resolvedContactId = contactId || '';
  if (authHeader?.startsWith('Bearer ') && !resolvedContactId) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      const clerkUser = await clerkClient.users.getUser(decoded.sub);
      const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
      resolvedContactId = userSalesforceData[clerkEmail]?.contactId || '';
    } catch {
      // Non-blocking — checkout can proceed without contactId metadata.
    }
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: purpose || 'Chabad Bedford Payment',
            description: 'Secure payment for membership, pledges, or contributions.',
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
      },
      success_url: `${FRONTEND_URL}/?payment=success`,
      cancel_url: `${FRONTEND_URL}/?payment=cancel`,
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
      // Verify Clerk JWT Session Token
      const decoded = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      
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
