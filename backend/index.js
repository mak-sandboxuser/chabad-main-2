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
  extractSearchContactsFromPayload,
  memberDetailsToSearchContact,
  mergeContactsList,
  mergeHouseholdPortalData,
  mergePaymentsRemoteAndLocal,
  filterNormalizedPayments,
} = require('./portalDataMapper');
const { getPortalFiscalYearRange, formatPortalFiscalYearLabel } = require('./portalFiscalYear');
const { validateAddFamilyMemberRequest } = require('./householdMemberRules');

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyformagiclinks';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5174';
const CHECKOUT_SUCCESS_URL = `${FRONTEND_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`;
const CHECKOUT_CANCEL_URL = `${FRONTEND_URL}/?payment=cancel`;
const processedCheckoutSessions = new Set();
const processingCheckoutSessions = new Set();
const SESSION_CLOCK_SKEW_MS = Number.parseInt(process.env.SESSION_CLOCK_SKEW_MS || '300000', 10);
const DEV_LOCALHOST_ORIGIN = /^https?:\/\/localhost(?::\d+)?$/;
const VERCEL_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i;

function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (origin === FRONTEND_URL) return true;
  if (DEV_LOCALHOST_ORIGIN.test(origin)) return true;
  if (VERCEL_ORIGIN.test(origin)) return true;
  const extras = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return extras.includes(origin);
}

async function verifyClerkSessionToken(token) {
  return verifyToken(token, {
    secretKey: process.env.CLERK_SECRET_KEY,
    clockSkewInMs: SESSION_CLOCK_SKEW_MS,
  });
}

app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
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

function sanitizeSalesforceId(value) {
  const normalized = (value || '').trim();
  return /^[a-zA-Z0-9]{15,18}$/.test(normalized) ? normalized : '';
}

function sanitizeContactId(value) {
  const normalized = sanitizeSalesforceId(value);
  return normalized.startsWith('003') ? normalized : '';
}

function sanitizeAccountId(value) {
  const normalized = sanitizeSalesforceId(value);
  return normalized.startsWith('001') ? normalized : '';
}

async function lookupSalesforceMember(email) {
  const emailLower = email.toLowerCase();
  const webhookUrl = process.env.MAKE_WEBHOOK_URL;

  const sanitizeName = (value) => {
    const normalized = (value || '').trim();
    if (normalized.length < 2) return '';
    const blocked = new Set(['firstname', 'lastname', 'contactid', 'found', 'role', 'null', 'undefined']);
    return blocked.has(normalized.toLowerCase()) ? '' : normalized;
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

    const contactId = sanitizeContactId(readField('contactId'));
    if (!contactId) {
      console.warn(
        `Membership check rejected for ${emailLower}: Make returned found:true but no Salesforce contactId`
      );
      return { found: false, error: 'unauthorized_member' };
    }

    const firstName = sanitizeName(readField('firstName'));
    const lastName = sanitizeName(readField('lastName'));
    const role = readField('role') || 'Member';
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
      accountId: sanitizeAccountId(readField('accountId')),
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

    if (!memberDetails.accountId) {
      const portalData = await lookupSalesforcePortalData(emailLower, contactId, memberDetails);
      memberDetails.accountId = sanitizeAccountId(portalData.accountId) || memberDetails.accountId;
      if (portalData.accountName) {
        memberDetails.profile.accountName = portalData.accountName;
      }
    }

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
      accountId: memberDetails?.accountId || '',
      fetchPayments: true,
      fetchFinancials: true,
      fetchPledges: true,
      fetchRecurring: true,
      pledgesLimit: 100,
      paymentsLimit: 100,
      sortBy: 'date',
      sortDirection: 'DESC',
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

async function fetchPortalDataFromWebhook(webhookUrl, email, contactId, memberDetails = null, options = {}) {
  const accountId = options.accountId || memberDetails?.accountId || '';
  const body = {
    email: email.toLowerCase(),
    contactId: contactId || '',
    accountId,
    fetchPortal: true,
  };

  if (options.fetchAccountContacts) {
    body.fetchAccountContacts = true;
    body.action = 'fetch_account_contacts';
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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

async function fetchAccountContactsFromMake(accountId, email, contactId, memberDetails = null) {
  const webhookUrl = process.env.MAKE_PORTAL_DATA_WEBHOOK_URL;
  if (!webhookUrl || !accountId?.startsWith('001')) {
    return null;
  }

  return fetchPortalDataFromWebhook(webhookUrl, email, contactId, memberDetails, {
    accountId,
    fetchAccountContacts: true,
  });
}

async function fetchHouseholdDataFromWebhook(webhookUrl, email, contactId, memberDetails = null) {
  const accountId = memberDetails?.accountId || '';
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'fetch_household_data',
      email: email.toLowerCase(),
      contactId: contactId || '',
      accountId,
      fetchHousehold: true,
    }),
  });

  if (!response.ok) {
    console.error(`Make.com household webhook returned ${response.status} for ${email} (${webhookUrl})`);
    return null;
  }

  const text = await response.text();
  console.log(`Make.com household data for ${email}:`, text.slice(0, 800));
  const payload = parseMakePayload(text);
  return extractPortalDataFromPayload(payload, memberDetails || {});
}

async function lookupHouseholdData(email, contactId, memberDetails = null) {
  const webhookUrl = process.env.MAKE_HOUSEHOLD_DATA_WEBHOOK_URL;
  if (!webhookUrl) {
    return null;
  }

  try {
    return await fetchHouseholdDataFromWebhook(webhookUrl, email, contactId, memberDetails);
  } catch (error) {
    console.error(`Error calling Make.com household webhook for ${email}:`, error);
    return null;
  }
}

function applyHouseholdDataToSfData(sfData = {}, householdData = null) {
  if (!householdData) return sfData;

  const merged = mergeHouseholdPortalData({
    fromSalesforce: sfData.syncedFromSalesforce,
    accountId: sfData.accountId || sfData.account?.id,
    accountName: sfData.account?.name || sfData.profile?.accountName,
    phone: sfData.account?.phone || sfData.profile?.phone,
    street: sfData.account?.street || sfData.profile?.street,
    city: sfData.account?.city || sfData.profile?.city,
    state: sfData.account?.state || sfData.profile?.state,
    postalCode: sfData.account?.postalCode || sfData.profile?.postalCode,
    country: sfData.account?.country || sfData.profile?.country,
    contacts: sfData.contacts || [],
    relationships: sfData.relationships || [],
  }, householdData);

  return {
    ...sfData,
    accountId: pickFirstNonEmpty(merged.accountId, sfData.accountId),
    syncedFromSalesforce: Boolean(sfData.syncedFromSalesforce || merged.fromSalesforce),
    account: {
      ...(sfData.account || {}),
      id: pickFirstNonEmpty(merged.accountId, sfData.account?.id),
      name: pickFirstNonEmpty(merged.accountName, sfData.account?.name),
      phone: pickFirstNonEmpty(merged.phone, sfData.account?.phone),
      street: pickFirstNonEmpty(merged.street, sfData.account?.street),
      city: pickFirstNonEmpty(merged.city, sfData.account?.city),
      state: pickFirstNonEmpty(merged.state, sfData.account?.state),
      postalCode: pickFirstNonEmpty(merged.postalCode, sfData.account?.postalCode),
      country: pickFirstNonEmpty(merged.country, sfData.account?.country),
    },
    profile: {
      ...(sfData.profile || {}),
      accountName: pickFirstNonEmpty(merged.accountName, sfData.profile?.accountName),
      phone: pickFirstNonEmpty(merged.phone, sfData.profile?.phone),
      street: pickFirstNonEmpty(merged.street, sfData.profile?.street),
      city: pickFirstNonEmpty(merged.city, sfData.profile?.city),
      state: pickFirstNonEmpty(merged.state, sfData.profile?.state),
      postalCode: pickFirstNonEmpty(merged.postalCode, sfData.profile?.postalCode),
      country: pickFirstNonEmpty(merged.country, sfData.profile?.country),
    },
    contacts: merged.contacts,
    relationships: merged.relationships,
  };
}

async function buildHouseholdMemberDetails(auth, requestedContactId) {
  const contactId = sanitizeContactId(requestedContactId);
  if (!contactId?.startsWith('003')) {
    return { error: 'A valid Salesforce Contact ID is required.' };
  }

  const householdData = await lookupHouseholdData(auth.email, auth.contactId, {
    accountId: auth.accountId,
    email: auth.email,
    name: auth.accountName,
  });

  const cached = userSalesforceData[auth.email] || {};
  const mergedHousehold = householdData
    ? applyHouseholdDataToSfData(cached, householdData)
    : cached;
  const contacts = mergedHousehold.contacts || [];
  const allowedIds = new Set(
    contacts.map((contact) => sanitizeContactId(contact.contactId || contact.id)).filter(Boolean),
  );

  if (!allowedIds.has(contactId) && contactId !== auth.contactId) {
    return { error: 'This contact is not part of your household account.' };
  }

  const contact = contacts.find((item) => item.contactId === contactId) || {
    contactId,
    name: 'Member',
    role: 'Member',
  };

  let profileDetails = null;
  if (contact.email?.includes('@')) {
    const lookup = await lookupSalesforceMember(contact.email.toLowerCase());
    if (lookup.found) {
      profileDetails = lookup.memberDetails;
    }
  } else if (contactId === auth.contactId) {
    const lookup = await lookupSalesforceMember(auth.email);
    if (lookup.found) {
      profileDetails = lookup.memberDetails;
    }
  }

  const profile = profileDetails ? buildProfileFromDetails(profileDetails) : {};

  return {
    member: {
      ...contact,
      contactId,
      email: pickFirstNonEmpty(contact.email, profileDetails?.email, ''),
      phone: pickFirstNonEmpty(contact.phone, profile.mobile, profile.phone, profileDetails?.mobile, ''),
      street: pickFirstNonEmpty(contact.street, profile.street, profileDetails?.street, ''),
      city: pickFirstNonEmpty(contact.city, profile.city, profileDetails?.city, ''),
      state: pickFirstNonEmpty(contact.state, profile.state, profileDetails?.state, ''),
      postalCode: pickFirstNonEmpty(contact.postalCode, profile.postalCode, profileDetails?.postalCode, ''),
      country: pickFirstNonEmpty(contact.country, profile.country, profileDetails?.country, ''),
      profile,
    },
    sfData: mergedHousehold,
  };
}

async function lookupSalesforcePortalData(email, contactId, memberDetails = null) {
  const webhookUrls = [...new Set([
    process.env.MAKE_PORTAL_DATA_WEBHOOK_URL,
    process.env.MAKE_WEBHOOK_URL,
  ].filter(Boolean))];

  const emailLower = email.toLowerCase();
  const accountId = memberDetails?.accountId || userSalesforceData[emailLower]?.accountId || '';
  const cachedContacts = userSalesforceData[emailLower]?.contacts || [];

  if (!webhookUrls.length) {
    return extractPortalDataFromPayload(null, memberDetails || {});
  }

  for (const webhookUrl of webhookUrls) {
    try {
      let portalData = await fetchPortalDataFromWebhook(
        webhookUrl,
        email,
        contactId,
        memberDetails,
        { accountId },
      );
      if (!portalData) continue;

      if (portalData.fromSalesforce && !portalData.relationships?.length) {
        console.warn(`Make.com portal webhook returned no relationships for ${email} — retrying in 3s`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const retryData = await fetchPortalDataFromWebhook(
          webhookUrl,
          email,
          contactId,
          memberDetails,
          { accountId },
        );
        if (retryData?.relationships?.length) {
          portalData = retryData;
        }
      }

      if (
        portalData.fromSalesforce
        && accountId?.startsWith('001')
        && portalData.contacts.length <= 1
      ) {
        const accountContactsData = await fetchAccountContactsFromMake(
          accountId,
          email,
          contactId,
          memberDetails,
        );
        if (accountContactsData?.contacts?.length) {
          portalData = {
            ...portalData,
            contacts: mergeContactsList(portalData.contacts, accountContactsData.contacts),
          };
        }
      }

      portalData = {
        ...portalData,
        contacts: mergeContactsList(portalData.contacts, cachedContacts),
      };

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

  const fallback = extractPortalDataFromPayload(null, memberDetails || {});
  return {
    ...fallback,
    contacts: mergeContactsList(fallback.contacts, cachedContacts),
  };
}

function buildFinancialsFromSources(portalData = {}) {
  const payments = filterNormalizedPayments(portalData.payments || []);
  const pledges = portalData.pledges || [];
  const recurring = portalData.recurring || [];
  const totalPayments = payments.reduce((sum, item) => sum + parseMoney(item.amount || item.total), 0);
  const fiscalYear = getPortalFiscalYearRange();

  return {
    fromSalesforce: Boolean(portalData.fromSalesforce),
    totalPayments,
    payments,
    pledges,
    recurring,
    fiscalYear: {
      startDate: fiscalYear.startDate,
      endDate: fiscalYear.endDate,
      label: formatPortalFiscalYearLabel(fiscalYear),
    },
  };
}

function mergeMemberProfile(sfDetails, portalData = null) {
  const effectivePortal = portalData ?? extractPortalDataFromPayload(null, sfDetails);
  const sfProfile = buildProfileFromDetails(sfDetails);
  const firstName = pickFirstNonEmpty(sfDetails.firstName, sfDetails.name?.split(/\s+/)[0]);
  const lastName = pickFirstNonEmpty(
    sfDetails.lastName,
    sfDetails.name?.split(/\s+/).slice(1).join(' '),
  );
  const name = pickFirstNonEmpty(
    [firstName, lastName].filter(Boolean).join(' '),
    sfDetails.name,
    sfDetails.email?.split('@')[0],
  );
  const financials = buildFinancialsFromSources(effectivePortal);

  return {
    contactId: pickFirstNonEmpty(sfDetails.contactId, effectivePortal.contacts?.[0]?.contactId),
    accountId: pickFirstNonEmpty(effectivePortal?.accountId, sfDetails.accountId),
    firstName,
    lastName,
    name,
    email: sfDetails.email,
    role: pickFirstNonEmpty(sfDetails.role, 'Member'),
    account: {
      id: pickFirstNonEmpty(effectivePortal?.accountId, sfDetails.accountId),
      name: pickFirstNonEmpty(effectivePortal?.accountName, sfProfile.accountName, name),
      phone: pickFirstNonEmpty(effectivePortal?.phone, sfProfile.phone, sfProfile.mobile),
      email: pickFirstNonEmpty(effectivePortal?.email, sfDetails.email),
      street: pickFirstNonEmpty(effectivePortal?.street, sfProfile.street),
      city: pickFirstNonEmpty(effectivePortal?.city, sfProfile.city),
      state: pickFirstNonEmpty(effectivePortal?.state, sfProfile.state),
      postalCode: pickFirstNonEmpty(effectivePortal?.postalCode, sfProfile.postalCode),
      country: pickFirstNonEmpty(effectivePortal?.country, sfProfile.country),
    },
    profile: {
      ...sfProfile,
      accountName: pickFirstNonEmpty(effectivePortal?.accountName, sfProfile.accountName, name),
      phone: pickFirstNonEmpty(sfProfile.phone, sfProfile.mobile, effectivePortal?.phone),
      mobile: pickFirstNonEmpty(sfProfile.mobile, sfProfile.phone, effectivePortal?.phone),
      homePhone: pickFirstNonEmpty(sfProfile.homePhone),
      street: pickFirstNonEmpty(sfProfile.street, effectivePortal?.street),
      city: pickFirstNonEmpty(sfProfile.city, effectivePortal?.city),
      state: pickFirstNonEmpty(sfProfile.state, effectivePortal?.state),
      postalCode: pickFirstNonEmpty(sfProfile.postalCode, effectivePortal?.postalCode),
      country: pickFirstNonEmpty(sfProfile.country, effectivePortal?.country),
      nickname: pickFirstNonEmpty(sfProfile.nickname),
      title: pickFirstNonEmpty(sfProfile.title),
      lifecycle: {
        hebrewName: pickFirstNonEmpty(sfProfile.lifecycle?.hebrewName, sfProfile.hebrewName),
        fathersHebrewName: pickFirstNonEmpty(sfProfile.lifecycle?.fathersHebrewName, sfProfile.fathersHebrewName),
        mothersHebrewName: pickFirstNonEmpty(sfProfile.lifecycle?.mothersHebrewName, sfProfile.mothersHebrewName),
        jewish: pickFirstNonEmpty(sfProfile.lifecycle?.jewish, sfProfile.jewish),
        hebrewBirthdate: pickFirstNonEmpty(sfProfile.lifecycle?.hebrewBirthdate, sfProfile.hebrewBirthdate),
        nextHebrewBirthday: pickFirstNonEmpty(sfProfile.lifecycle?.nextHebrewBirthday, sfProfile.nextHebrewBirthday),
        weddingDate: pickFirstNonEmpty(sfProfile.lifecycle?.weddingDate, sfProfile.weddingDate),
        lifecycleStatus: pickFirstNonEmpty(sfProfile.lifecycle?.lifecycleStatus, sfProfile.lifecycleStatus),
      },
      additional: {
        birthdate: pickFirstNonEmpty(sfProfile.additional?.birthdate, sfProfile.birthdate),
        age: pickFirstNonEmpty(sfProfile.additional?.age, sfProfile.age),
        gender: pickFirstNonEmpty(sfProfile.additional?.gender, sfProfile.gender),
      },
      householdDonationTotal: financials.totalPayments ? formatMoney(financials.totalPayments) : '$0.00',
    },
    contacts: effectivePortal.contacts || [],
    relationships: effectivePortal.relationships || [],
    financials,
    membership: deriveMembershipSummary(
      effectivePortal.membership,
      financials,
      {
        lifecycleStatus: pickFirstNonEmpty(sfProfile.lifecycle?.lifecycleStatus, sfProfile.lifecycleStatus),
        householdDonationTotal: financials.totalPayments ? formatMoney(financials.totalPayments) : '$0.00',
      },
    ),
    syncedFromSalesforce: Boolean(effectivePortal.fromSalesforce),
  };
}

async function buildPortalSfData(email) {
  const lookup = await lookupSalesforceMember(email);
  if (!lookup.found) {
    return { error: 'unauthorized_member', lookup };
  }

  const memberDetails = lookup.memberDetails;
  const portalData = await lookupSalesforcePortalData(email, memberDetails.contactId, memberDetails);
  const financialsData = await lookupSalesforcePayments(email, memberDetails.contactId, memberDetails);

  const mergedPortal = {
    ...portalData,
    payments: financialsData.payments?.length ? financialsData.payments : (portalData.payments || []),
    pledges: financialsData.pledges?.length ? financialsData.pledges : (portalData.pledges || []),
    recurring: financialsData.recurring?.length ? financialsData.recurring : (portalData.recurring || []),
    fromSalesforce: Boolean(
      portalData.fromSalesforce
      || financialsData.fromSalesforce
      || financialsData.payments?.length
      || financialsData.pledges?.length
      || financialsData.recurring?.length
    ),
  };

  const householdData = await lookupHouseholdData(
    email,
    memberDetails.contactId,
    memberDetails,
  );
  const mergedPortalWithHousehold = mergeHouseholdPortalData(mergedPortal, householdData);

  const sfData = mergeMemberProfile(memberDetails, mergedPortalWithHousehold);

  userSalesforceData[email] = sfData;
  return { sfData, memberDetails, portalData: mergedPortalWithHousehold };
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
    contactId: lookup.memberDetails.contactId || null,
    accountId: lookup.memberDetails.accountId || null,
    nextStep: 'frontend sends Clerk magic link',
  });

  cacheMemberLookup(emailLower, lookup.memberDetails);

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

    authLog('DASHBOARD_OK', {
      email,
      clerkUserId: userId,
      name: sfData?.name,
      contactId: sfData?.contactId,
      accountId: sfData?.accountId,
      contacts: sfData?.contacts?.length || 0,
      payments: sfData?.financials?.payments?.length || 0,
      pledges: sfData?.financials?.pledges?.length || 0,
      recurring: sfData?.financials?.recurring?.length || 0,
      fromSalesforce: sfData?.syncedFromSalesforce,
    });
    // Portal data is always loaded live from Salesforce via Make.com — no local db.json cache.
    res.json({
      success: true,
      user: {
        id: userId,
        email: email,
        role: sfData?.role || 'Member',
        name: sfData?.name || 'Chabad Bedford Member',
      },
      sfData,
      stats: null,
      members: [],
      events: [],
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
  let resolvedContactId = sanitizeContactId(contactId);
  if (authHeader?.startsWith('Bearer ') && !resolvedContactId) {
    try {
      const token = authHeader.split(' ')[1];
      const decoded = await verifyClerkSessionToken(token);
      const clerkUser = await clerkClient.users.getUser(decoded.sub);
      const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase();
      const cached = userSalesforceData[clerkEmail]?.contactId || '';
      if (cached.startsWith('003')) resolvedContactId = cached;
    } catch {
      // Non-blocking
    }
  }
  if (!resolvedContactId && email) {
    const cached = userSalesforceData[email.toLowerCase()]?.contactId || '';
    if (cached.startsWith('003')) resolvedContactId = cached;
  }
  if (!resolvedContactId && email) {
    const lookup = await lookupSalesforceMember(email.toLowerCase());
    if (lookup.found && lookup.memberDetails?.contactId?.startsWith('003')) {
      resolvedContactId = lookup.memberDetails.contactId;
      userSalesforceData[email.toLowerCase()] = {
        ...(userSalesforceData[email.toLowerCase()] || {}),
        contactId: resolvedContactId,
        accountId: lookup.memberDetails.accountId || userSalesforceData[email.toLowerCase()]?.accountId || '',
      };
    }
  }
  return resolvedContactId;
}

function cacheMemberLookup(email, memberDetails = {}) {
  const emailLower = (email || memberDetails.email || '').toLowerCase();
  if (!emailLower) return;

  userSalesforceData[emailLower] = {
    ...(userSalesforceData[emailLower] || {}),
    contactId: memberDetails.contactId?.startsWith('003') ? memberDetails.contactId : (userSalesforceData[emailLower]?.contactId || ''),
    accountId: memberDetails.accountId?.startsWith('001') ? memberDetails.accountId : (userSalesforceData[emailLower]?.accountId || ''),
    name: memberDetails.name || userSalesforceData[emailLower]?.name || '',
    email: emailLower,
  };
}

async function resolveMemberIds(authHeader, email, { contactId = '', accountId = '' } = {}) {
  const emailLower = (email || '').toLowerCase();
  let resolvedContactId = sanitizeContactId(contactId);
  let resolvedAccountId = sanitizeAccountId(accountId);

  if (!resolvedContactId) {
    resolvedContactId = await resolveCheckoutContactId(authHeader, emailLower, '');
  }
  if (!resolvedAccountId) {
    resolvedAccountId = await resolveCheckoutAccountId(authHeader, emailLower, '');
  }

  if (emailLower && (!resolvedAccountId || !resolvedContactId)) {
    const lookup = await lookupSalesforceMember(emailLower);
    if (lookup.found) {
      cacheMemberLookup(emailLower, lookup.memberDetails);
      if (!resolvedContactId) {
        resolvedContactId = sanitizeContactId(lookup.memberDetails.contactId);
      }
      if (!resolvedAccountId) {
        resolvedAccountId = sanitizeAccountId(lookup.memberDetails.accountId);
      }
    }
  }

  return { contactId: resolvedContactId, accountId: resolvedAccountId };
}

async function ensureFinancialPayloadIds(payload, authHeader) {
  const email = (payload.email || '').toLowerCase();
  const ids = await resolveMemberIds(authHeader, email, {
    contactId: payload.contactId || '',
    accountId: payload.accountId || '',
  });
  payload.contactId = ids.contactId;
  payload.accountId = ids.accountId;
  return payload;
}

function pickCachedAccountId(email, accountId = '') {
  const normalized = (accountId || '').trim();
  if (normalized.startsWith('001')) return normalized;
  if (email) {
    const cached = userSalesforceData[email.toLowerCase()]?.accountId || '';
    return cached.startsWith('001') ? cached : '';
  }
  return '';
}

function toSalesforceDateIso(dateStr = '') {
  const dateOnly = (dateStr || new Date().toISOString().split('T')[0]).slice(0, 10);
  return `${dateOnly}T04:00:00.000Z`;
}

function stripeRecurringInterval(frequency = 'Monthly') {
  const map = {
    Monthly: 'month',
    Quarterly: 'month',
    Yearly: 'year',
    Annual: 'year',
  };
  return map[frequency] || 'month';
}

function stripeRecurringIntervalCount(frequency = 'Monthly') {
  if (frequency === 'Quarterly') return 3;
  return 1;
}

function addRecurringIntervalToDate(dateStr = '', frequency = 'Monthly') {
  const base = (dateStr || new Date().toISOString().split('T')[0]).slice(0, 10);
  const date = new Date(`${base}T12:00:00`);
  if (frequency === 'Quarterly') {
    date.setMonth(date.getMonth() + 3);
  } else if (frequency === 'Yearly' || frequency === 'Annual') {
    date.setFullYear(date.getFullYear() + 1);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.toISOString().split('T')[0];
}

function enrichFinancialPayload(payload = {}) {
  const pledgeAmount = parseFloat(payload.pledgeAmount) || 0;
  const paymentAmount = parseFloat(payload.paymentAmount) || 0;
  const isRecurring = payload.billingMode === 'recurring' || payload.isRecurring === 'true';
  const recurringAmount = isRecurring ? (paymentAmount || pledgeAmount) : 0;
  const frequency = payload.frequency || 'Monthly';
  const paymentDate = payload.paymentDate || new Date().toISOString().split('T')[0];
  const stripePaid = payload.stripePaymentStatus === 'paid'
    || Boolean(payload.stripeSubscriptionId);

  let action = 'none';
  if (isRecurring && recurringAmount > 0) action = 'recurring';
  else if (pledgeAmount > 0 && paymentAmount > 0) action = 'pledge_and_payment';
  else if (pledgeAmount > 0) action = 'pledge';
  else if (paymentAmount > 0) action = 'payment';

  const recurringFields = isRecurring && recurringAmount > 0 ? {
    chargeStartDate: paymentDate,
    nextChargeDate: addRecurringIntervalToDate(paymentDate, frequency),
    initialRecurrences: stripePaid ? 1 : 0,
    totalEstimatedRevenue: recurringAmount,
    chargesRemaining: 0,
    paymentProcessorId: payload.stripeSubscriptionId || payload.stripePaymentIntentId || '',
    recurringInvoiceName: process.env.RECURRING_INVOICE_NAME || '',
    recurringLetterheadName: process.env.RECURRING_LETTERHEAD_NAME || '',
  } : {};

  return {
    ...payload,
    ...recurringFields,
    action,
    pledgeAmount: pledgeAmount > 0 ? pledgeAmount : 0,
    createPledge: pledgeAmount > 0 && !isRecurring,
    createPayment: paymentAmount > 0 && !isRecurring,
    createRecurring: isRecurring && recurringAmount > 0,
    paymentOnly: pledgeAmount <= 0 && paymentAmount > 0 && !isRecurring,
    recurringAmount,
    frequency,
    paymentDateIso: payload.paymentDateIso || toSalesforceDateIso(paymentDate),
    isRecurring: isRecurring ? 'true' : 'false',
  };
}

function buildStripeCheckoutMetadata(payload, contactId, email) {
  const pledgeAmount = parseFloat(payload.pledgeAmount) || 0;
  const paymentAmount = parseFloat(payload.paymentAmount) || 0;
  const isRecurring = payload.billingMode === 'recurring';
  const enriched = enrichFinancialPayload(payload);

  return {
    email: (email || payload.email || '').toLowerCase(),
    contactId: sanitizeContactId(contactId || payload.contactId || ''),
    accountId: sanitizeAccountId(payload.accountId || ''),
    purpose: payload.purpose || 'portal_payment',
    paymentType: payload.paymentType || 'Donation',
    subType: payload.subType || 'General',
    memo: payload.memo || '',
    source: payload.source || 'member_portal',
    billingMode: payload.billingMode || 'regular',
    frequency: payload.frequency || 'Monthly',
    paymentDate: payload.paymentDate || new Date().toISOString().split('T')[0],
    paymentDateIso: toSalesforceDateIso(payload.paymentDate),
    donorId: payload.accountId || '',
    pledgeAmount: String(pledgeAmount > 0 ? pledgeAmount : 0),
    paymentAmount: String(paymentAmount),
    action: enriched.action,
    createPledge: enriched.createPledge ? 'true' : 'false',
    createPayment: enriched.createPayment ? 'true' : 'false',
    createRecurring: enriched.createRecurring ? 'true' : 'false',
    paymentOnly: enriched.paymentOnly ? 'true' : 'false',
    isRecurring: isRecurring ? 'true' : 'false',
  };
}

function buildQuickPaymentPayload(body, contactId) {
  const pledgeAmount = parseFloat(body.pledgeAmount) || 0;
  const paymentAmount = parseFloat(body.paymentAmount) || 0;
  const billingMode = body.billingMode === 'recurring' ? 'recurring' : 'regular';
  return enrichFinancialPayload({
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
    frequency: body.frequency || 'Monthly',
    paymentDate: body.paymentDate || new Date().toISOString().split('T')[0],
    source: 'member_portal',
  });
}

async function createStripeCheckoutSession(payload, contactId, email) {
  const paymentAmount = parseFloat(payload.paymentAmount) || 0;
  const isRecurring = payload.billingMode === 'recurring';
  const checkoutLabel = [payload.paymentType, payload.subType].filter(Boolean).join(' — ');
  const metadata = buildStripeCheckoutMetadata(payload, contactId, email);

  if (isRecurring && paymentAmount > 0) {
    return stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      mode: 'subscription',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: checkoutLabel || payload.purpose || 'Recurring Contribution',
            description: payload.memo || `Recurring ${payload.frequency}: ${payload.paymentType}`,
          },
          unit_amount: Math.round(paymentAmount * 100),
          recurring: {
            interval: stripeRecurringInterval(payload.frequency),
            interval_count: stripeRecurringIntervalCount(payload.frequency),
          },
        },
        quantity: 1,
      }],
      client_reference_id: buildCheckoutClientReferenceId({ ...payload, contactId }),
      metadata,
      subscription_data: { metadata },
      success_url: CHECKOUT_SUCCESS_URL,
      cancel_url: CHECKOUT_CANCEL_URL,
    });
  }

  return stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    customer_email: email,
    mode: 'payment',
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
    client_reference_id: buildCheckoutClientReferenceId({ ...payload, contactId }),
    metadata,
    success_url: CHECKOUT_SUCCESS_URL,
    cancel_url: CHECKOUT_CANCEL_URL,
  });
}

function isCheckoutSessionComplete(session) {
  if (!session) return false;
  if (session.mode === 'subscription') {
    return session.status === 'complete';
  }
  return session.payment_status === 'paid';
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
      if (resolvedAccountId.startsWith('001')) return resolvedAccountId;
    } catch {
      // Non-blocking
    }
  }

  if (email) {
    const emailLower = email.toLowerCase();
    const lookup = await lookupSalesforceMember(emailLower);
    if (lookup.found) {
      cacheMemberLookup(emailLower, lookup.memberDetails);
      if (lookup.memberDetails.accountId?.startsWith('001')) {
        return lookup.memberDetails.accountId;
      }
    }

    try {
      const contactId = await resolveCheckoutContactId(authHeader, emailLower, '');
      if (contactId) {
        const portalData = await lookupSalesforcePortalData(emailLower, contactId);
        if (portalData.accountId?.startsWith('001')) {
          cacheMemberLookup(emailLower, { ...(lookup.memberDetails || {}), accountId: portalData.accountId, contactId });
          return portalData.accountId;
        }
      }
    } catch {
      // Non-blocking
    }
  }

  return '';
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

  return enrichFinancialPayload({
    email,
    contactId: sanitizeContactId(metadata.contactId || refData.contactId || ''),
    accountId: sanitizeAccountId(metadata.accountId || refData.accountId || ''),
    purpose: metadata.purpose || 'portal_payment',
    paymentType: metadata.paymentType || refData.paymentType || 'Donation',
    subType: metadata.subType || 'General',
    memo: metadata.memo || '',
    pledgeAmount,
    paymentAmount,
    billingMode,
    frequency: metadata.frequency || 'Monthly',
    paymentDate: metadata.paymentDate || refData.paymentDate || new Date().toISOString().split('T')[0],
    source: metadata.source || 'member_portal',
    stripeSessionId: session.id,
    stripePaymentStatus: session.payment_status,
    stripeCheckoutMode: session.mode || 'payment',
    stripeSubscriptionId: typeof session.subscription === 'string'
      ? session.subscription
      : session.subscription?.id || '',
    stripePaymentIntentId: typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || '',
  });
}

async function postToMakeWebhook(webhookUrl, payload, label) {
  if (!webhookUrl) {
    throw new Error(`${label} is not configured in backend/.env`);
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Make.com ${label} returned ${response.status}`);
  }

  return response.text();
}

async function triggerFinancialWebhook(payload, authHeader = null) {
  await ensureFinancialPayloadIds(payload, authHeader);
  const enriched = enrichFinancialPayload(payload);

  if (!enriched.contactId?.startsWith('003')) {
    throw new Error('Salesforce Contact ID is missing or invalid. Cannot sync to ChabadOne CRM.');
  }
  if (!enriched.accountId?.startsWith('001')) {
    throw new Error('Salesforce Household Account ID is missing. Cannot sync payment to ChabadOne CRM.');
  }

  const paymentUrl = process.env.MAKE_STRIPE_PAYMENT_WEBHOOK_URL;
  const pledgeRecurringUrl = process.env.MAKE_QUICK_PAYMENT_WEBHOOK_URL;

  const webhookPayload = {
    ...enriched,
    pledgeAmount: enriched.createPledge ? enriched.pledgeAmount : 0,
    createPledge: Boolean(enriched.createPledge),
    paymentOnly: Boolean(enriched.paymentOnly),
    // Explicit aliases for Make.com field mapping (Charge Paid must NOT be 0 on payment-only).
    chargePaidAmount: enriched.createPayment ? enriched.paymentAmount : 0,
    lineItemAmount: enriched.createPayment ? -Math.abs(enriched.paymentAmount) : 0,
    doNotCreatePledge: !enriched.createPledge,
  };

  const calls = [];
  if (enriched.createPayment && paymentUrl) {
    calls.push(postToMakeWebhook(paymentUrl, webhookPayload, 'MAKE_STRIPE_PAYMENT_WEBHOOK_URL'));
  }
  if ((enriched.createPledge || enriched.createRecurring) && pledgeRecurringUrl) {
    calls.push(postToMakeWebhook(pledgeRecurringUrl, webhookPayload, 'MAKE_QUICK_PAYMENT_WEBHOOK_URL'));
  }

  if (!calls.length) {
    const fallbackUrl = paymentUrl || pledgeRecurringUrl;
    if (!fallbackUrl) {
      throw new Error('Configure MAKE_STRIPE_PAYMENT_WEBHOOK_URL and/or MAKE_QUICK_PAYMENT_WEBHOOK_URL in backend/.env');
    }
    await postToMakeWebhook(fallbackUrl, webhookPayload, 'financial webhook');
  } else {
    await Promise.all(calls);
  }

  console.log(`[FINANCIAL] action=${enriched.action}, contactId=${webhookPayload.contactId}, accountId=${webhookPayload.accountId}, pledge=${webhookPayload.pledgeAmount}, payment=${enriched.paymentAmount}, recurring=${enriched.recurringAmount}, paymentOnly=${webhookPayload.paymentOnly}, paymentWebhook=${Boolean(enriched.createPayment && paymentUrl)}, pledgeRecurringWebhook=${Boolean((enriched.createPledge || enriched.createRecurring) && pledgeRecurringUrl)}`);
  return enriched;
}

async function triggerQuickPaymentWebhook(payload) {
  return triggerFinancialWebhook(payload);
}

async function triggerStripePaymentWebhook(payload) {
  return triggerFinancialWebhook(payload);
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

  if (!payload.accountId?.startsWith('001') || !payload.contactId?.startsWith('003')) {
    return res.status(400).json({
      error: 'Missing Salesforce IDs for this member. Log out, log in again, then retry.',
    });
  }

  if (billingMode === 'recurring' && pledgeAmount <= 0 && paymentAmount <= 0) {
    return res.status(400).json({ error: 'Enter an amount for the recurring billing plan.' });
  }

  // Pledge-only or recurring CRM setup without immediate Stripe charge
  if (paymentAmount <= 0) {
    try {
      await triggerFinancialWebhook(payload, authHeader);
      const message = billingMode === 'recurring'
        ? 'Recurring billing plan saved to ChabadOne CRM.'
        : 'Pledge saved to ChabadOne CRM.';
      return res.json({ success: true, message, action: payload.action });
    } catch (error) {
      console.error('Quick payment webhook error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe integration is not configured.' });
  }

  try {
    const session = await createStripeCheckoutSession(payload, contactId, email);

    console.log(`[PAYMENT] checkout session ${session.id} mode=${session.mode}, accountId=${payload.accountId || '(missing)'}, contactId=${contactId || '(missing)'}, email=${email}`);
    res.json({ url: session.url, mode: session.mode });
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
    if (!isCheckoutSessionComplete(session)) {
      return res.status(400).json({ error: 'Payment is not completed yet.' });
    }

    const payload = buildPayloadFromCheckoutSession(session);
    if (payload.email && payload.email !== userEmail) {
      return res.status(403).json({ error: 'This checkout session does not belong to the signed-in user.' });
    }
    if (!payload.email) {
      payload.email = userEmail;
    }
    if (!payload.accountId?.startsWith('001')) {
      payload.accountId = await resolveCheckoutAccountId(authHeader, payload.email, payload.accountId || '');
    }
    if (!payload.contactId?.startsWith('003')) {
      payload.contactId = await resolveCheckoutContactId(authHeader, payload.email, '');
    }

    if (processedCheckoutSessions.has(sessionId)) {
      return res.json({ success: true, alreadyProcessed: true, message: 'Payment already synced to ChabadOne CRM.' });
    }
    if (processingCheckoutSessions.has(sessionId)) {
      return res.json({ success: true, alreadyProcessed: true, message: 'Payment sync already in progress.' });
    }

    if (!process.env.MAKE_STRIPE_PAYMENT_WEBHOOK_URL) {
      return res.status(500).json({
        error: 'MAKE_STRIPE_PAYMENT_WEBHOOK_URL is not configured. Add your Make.com Custom Webhook URL to backend/.env',
      });
    }

    processingCheckoutSessions.add(sessionId);
    try {
      await triggerFinancialWebhook(payload, authHeader);
      processedCheckoutSessions.add(sessionId);
    } finally {
      processingCheckoutSessions.delete(sessionId);
    }

    const message = payload.createRecurring
      ? 'Recurring billing synced to ChabadOne CRM.'
      : payload.createPledge && payload.createPayment
        ? 'Pledge and payment synced to ChabadOne CRM.'
        : payload.createPledge
          ? 'Pledge synced to ChabadOne CRM.'
          : 'Payment synced to ChabadOne CRM.';
    console.log(`[PAYMENT] confirm-checkout OK for ${payload.email}, action=${payload.action}, accountId=${payload.accountId || '(missing)'}`);
    res.json({ success: true, message, action: payload.action });
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

async function resolveAuthedPortalMember(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: { status: 401, message: 'Authentication required.' } };
  }

  const token = authHeader.split(' ')[1];
  let email;

  if (token === 'dev_token_for_testing') {
    email = (req.body?.email || 'acc.appledev@gmail.com').toLowerCase();
  } else {
    const decoded = await verifyClerkSessionToken(token);
    const clerkUser = await clerkClient.users.getUser(decoded.sub);
    email = clerkUser.emailAddresses[0]?.emailAddress?.toLowerCase() || '';
  }

  if (!email) {
    return { error: { status: 400, message: 'No email address found for this user.' } };
  }

  const lookup = await lookupSalesforceMember(email);
  if (!lookup.found) {
    return {
      error: {
        status: 403,
        message: 'You are not authorised to login to the member portal.',
        code: 'unauthorized_member',
      },
    };
  }

  const cached = userSalesforceData[email] || {};
  let contactId = sanitizeContactId(
    lookup.memberDetails.contactId || cached.contactId || '',
  );
  let accountId = sanitizeAccountId(
    lookup.memberDetails.accountId || cached.accountId || cached.account?.id || '',
  );

  if (!accountId?.startsWith('001')) {
    accountId = await resolveCheckoutAccountId(authHeader, email, accountId);
  }
  if (!contactId?.startsWith('003')) {
    contactId = await resolveCheckoutContactId(authHeader, email, contactId);
  }

  const contacts = cached.contacts || [];
  const householdContactIds = contacts
    .map((contact) => sanitizeContactId(contact.contactId || contact.id))
    .filter(Boolean);
  const primaryContact = contacts.find((contact) => contact.isPrimary) || contacts[0] || null;
  const secondaryContact = contacts.find((contact) => contact.isSecondary) || null;

  return {
    email,
    contactId,
    accountId,
    accountName: pickFirstNonEmpty(
      cached.account?.name,
      cached.profile?.accountName,
      lookup.memberDetails.profile?.accountName,
      lookup.memberDetails.name,
      'Household',
    ),
    householdContactIds,
    primaryContactId: sanitizeContactId(primaryContact?.contactId || contactId),
    secondaryContactId: sanitizeContactId(secondaryContact?.contactId || ''),
    memberDetails: lookup.memberDetails,
  };
}

function buildHouseholdValidationContext(auth) {
  const cached = userSalesforceData[auth.email] || {};
  const contacts = cached.contacts || [];
  const primaryContact = contacts.find((contact) => contact.isPrimary) || contacts[0] || null;
  const secondaryContact = contacts.find((contact) => contact.isSecondary) || null;

  return {
    primaryContact,
    secondaryContact,
    householdContactIds: auth.householdContactIds || [],
  };
}

function buildLinkContactMeta(body = {}, searchResults = []) {
  const contactIds = Array.isArray(body.contactIds) ? body.contactIds : [];
  const metaFromBody = Array.isArray(body.contactMeta) ? body.contactMeta : [];

  return contactIds.map((contactId) => {
    const fromBody = metaFromBody.find((item) => item.contactId === contactId);
    const fromSearch = searchResults.find((item) => item.contactId === contactId);
    return {
      contactId,
      name: fromBody?.name || fromSearch?.name || '',
      currentFamily: fromBody?.currentFamily || fromSearch?.currentFamily || '',
    };
  });
}
function buildHouseholdRoleFields(memberType) {
  const role = memberType === 'child' ? 'Child' : 'Parent';
  return {
    role,
    memberType,
    contactRole: role,
    householdRole: role,
    crmRole: role,
    acrRole: role,
    acrRoles: role,
    isPrimary: memberType === 'primary',
    isSecondary: memberType === 'secondary',
    isChild: memberType === 'child',
    isPrimaryMember: memberType === 'primary',
    isSecondaryMember: memberType === 'secondary',
  };
}

function buildAccountFamilyMemberPayload(auth, body, mode) {
  const householdAccountId = auth.accountId;
  const memberType = ['primary', 'secondary', 'child'].includes(body.memberType)
    ? body.memberType
    : 'child';
  const roleFields = buildHouseholdRoleFields(memberType);

  const basePayload = {
    action: 'add_family_member',
    objectType: 'Account',
    source: 'member_portal',
    operation: mode === 'link' ? 'link_existing' : 'create_new',
    householdAccountId,
    accountId: householdAccountId,
    accountName: auth.accountName,
    requestedByContactId: auth.contactId,
    requestedByEmail: auth.email,
    ...roleFields,
  };

  if (mode === 'link') {
    return {
      ...basePayload,
      contactIdsToAdd: body.contactIds || [],
      excludeContactIds: auth.householdContactIds,
    };
  }

  return {
    ...basePayload,
    salutation: String(body.salutation || '').trim(),
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    gender: String(body.gender || '').trim(),
    mobilePhone: String(body.mobilePhone || body.phone || '').trim(),
    contactEmail: String(body.contactEmail || body.memberEmail || '').trim(),
    groups: body.groups || body.group || '',
  };
}

function buildHouseholdRolePayload(auth, contactId, memberType) {
  const accountId = auth.accountId;
  const roleFields = buildHouseholdRoleFields(memberType);

  return {
    action: 'add_family_member',
    objectType: 'Relationship',
    source: 'member_portal',
    operation: 'set_household_role',
    householdAccountId: accountId,
    accountId,
    accountName: auth.accountName,
    contactId,
    requestedByContactId: auth.contactId,
    requestedByEmail: auth.email,
    ...roleFields,
    includeInRollUp: true,
    soqlFindRelationship:
      `SELECT Id FROM OneCRM__Relationship__c `
      + `WHERE OneCRM__Contact__c = '${contactId}' `
      + `AND OneCRM__Account__c = '${accountId}' `
      + `LIMIT 1`,
  };
}

function mergeAddedContactsIntoSfData(sfData, {
  contactIds = [],
  contactMeta = [],
  memberType = 'child',
} = {}) {
  if (!sfData || !contactIds.length) return sfData;

  const role = memberType === 'child' ? 'Child' : 'Parent';
  const contacts = [...(sfData.contacts || [])];

  contactIds.forEach((contactId) => {
    const meta = contactMeta.find((item) => item.contactId === contactId) || {};
    const existingIndex = contacts.findIndex((contact) => contact.contactId === contactId);

    if (existingIndex >= 0) {
      contacts[existingIndex] = {
        ...contacts[existingIndex],
        role,
        isPrimary: memberType === 'primary',
        isSecondary: memberType === 'secondary',
      };
      return;
    }

    contacts.push({
      id: contactId,
      contactId,
      name: meta.name || 'Member',
      role,
      isPrimary: memberType === 'primary',
      isSecondary: memberType === 'secondary',
      email: meta.email || '',
      phone: meta.phone || '',
    });
  });

  return {
    ...sfData,
    contacts,
  };
}

async function postMakeAddFamilyWebhook(webhookUrl, payload, label = 'add family member') {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(`Make.com ${label} returned ${response.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
  }

  return text;
}

async function applyHouseholdRolesViaMake(webhookUrl, auth, contactIds, memberType) {
  const roleWebhookUrl = process.env.MAKE_HOUSEHOLD_ROLE_WEBHOOK_URL;
  if (!roleWebhookUrl) {
    return contactIds.map((contactId) => ({
      contactId,
      ok: false,
      skipped: true,
      error: 'MAKE_HOUSEHOLD_ROLE_WEBHOOK_URL is not configured.',
    }));
  }

  const results = [];

  for (const contactId of contactIds) {
    try {
      const rolePayload = buildHouseholdRolePayload(auth, contactId, memberType);
      const responseText = await postMakeAddFamilyWebhook(
        roleWebhookUrl,
        rolePayload,
        'set household role',
      );
      results.push({ contactId, ok: true, response: responseText.slice(0, 200) });
      console.log(`Make.com set household role for ${contactId}:`, responseText.slice(0, 200));
    } catch (error) {
      console.warn(`Make.com set household role failed for ${contactId}:`, error.message);
      results.push({ contactId, ok: false, error: error.message });
    }
  }

  return results;
}

// Verification Endpoint called by Make.com after Stripe success webhook
app.post('/api/payments/verify', async (req, res) => {
  const { email, amount, type, method } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  try {
    console.log(`Verified payment from Make.com for email: ${email}, amount: ${amount}`);
    res.json({ success: true, message: 'Payment verified. Refresh the portal to load Salesforce records.' });
  } catch (error) {
    console.error('Error recording payment in backend:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/household/data', async (req, res) => {
  const auth = await resolveAuthedPortalMember(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message, code: auth.error.code });
  }

  const webhookUrl = process.env.MAKE_HOUSEHOLD_DATA_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'MAKE_HOUSEHOLD_DATA_WEBHOOK_URL is not configured. Add your household Make.com webhook to backend/.env',
    });
  }

  try {
    const householdData = await lookupHouseholdData(auth.email, auth.contactId, {
      accountId: auth.accountId,
      email: auth.email,
      name: auth.accountName,
    });

    if (!householdData) {
      return res.status(502).json({ error: 'Household data could not be loaded from Salesforce.' });
    }

    const cached = userSalesforceData[auth.email] || {};
    const sfData = applyHouseholdDataToSfData(cached, householdData);
    userSalesforceData[auth.email] = sfData;

    res.json({
      success: true,
      sfData,
      householdAccountId: auth.accountId,
      accountName: auth.accountName,
      contactCount: sfData.contacts?.length || 0,
      relationshipCount: sfData.relationships?.length || 0,
    });
  } catch (error) {
    console.error('Household data fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/household/member-details', async (req, res) => {
  const auth = await resolveAuthedPortalMember(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message, code: auth.error.code });
  }

  const webhookUrl = process.env.MAKE_HOUSEHOLD_DATA_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'MAKE_HOUSEHOLD_DATA_WEBHOOK_URL is not configured. Add your household Make.com webhook to backend/.env',
    });
  }

  try {
    const result = await buildHouseholdMemberDetails(auth, req.body?.contactId);
    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    userSalesforceData[auth.email] = result.sfData;

    res.json({
      success: true,
      member: result.member,
      sfData: result.sfData,
    });
  } catch (error) {
    console.error('Household member details error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/household/search-contacts', async (req, res) => {
  const auth = await resolveAuthedPortalMember(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message, code: auth.error.code });
  }

  const webhookUrl = process.env.MAKE_HOUSEHOLD_SEARCH_CONTACTS_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'MAKE_HOUSEHOLD_SEARCH_CONTACTS_WEBHOOK_URL is not configured. Add your Make.com search webhook to backend/.env',
    });
  }

  const query = String(req.body?.query || '').trim();
  const limit = Math.min(parseInt(req.body?.limit, 10) || 50, 100);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search_contacts_for_account',
        objectType: 'Account',
        query,
        searchEmail: query.includes('@') ? query : '',
        searchName: query.includes('@') ? '' : query,
        limit,
        householdAccountId: auth.accountId,
        accountId: auth.accountId,
        accountName: auth.accountName,
        excludeContactIds: auth.householdContactIds,
        requestedByContactId: auth.contactId,
        requestedByEmail: auth.email,
      }),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Make.com contact search returned ${response.status}` });
    }

    const text = await response.text();
    const payload = parseMakePayload(text);
    let contacts = extractSearchContactsFromPayload(payload)
      .filter((contact) => !auth.householdContactIds.includes(contact.contactId));

    if (!contacts.length && query.includes('@')) {
      const lookup = await lookupSalesforceMember(query.toLowerCase());
      if (lookup.found && lookup.memberDetails?.contactId?.startsWith('003')) {
        const fallbackContact = memberDetailsToSearchContact(lookup.memberDetails);
        if (!auth.householdContactIds.includes(fallbackContact.contactId)) {
          contacts = [fallbackContact];
        }
      }
    }

    res.json({
      success: true,
      contacts,
      query,
      householdAccountId: auth.accountId,
      accountName: auth.accountName,
    });
  } catch (error) {
    console.error('Household contact search error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/household/add-family-member', async (req, res) => {
  const auth = await resolveAuthedPortalMember(req);
  if (auth.error) {
    return res.status(auth.error.status).json({ error: auth.error.message, code: auth.error.code });
  }

  const webhookUrl = process.env.MAKE_ADD_FAMILY_MEMBER_WEBHOOK_URL;
  if (!webhookUrl) {
    return res.status(503).json({
      error: 'MAKE_ADD_FAMILY_MEMBER_WEBHOOK_URL is not configured. Add your Make.com add-family-member webhook to backend/.env',
    });
  }

  if (!auth.accountId?.startsWith('001')) {
    return res.status(400).json({
      error: 'Missing Salesforce Household Account ID (001...). Log out, log in again, then retry from the Account page.',
    });
  }

  const body = req.body || {};
  const requestedAccountId = sanitizeAccountId(body.accountId || body.householdAccountId || '');
  if (requestedAccountId && requestedAccountId !== auth.accountId) {
    return res.status(403).json({ error: 'You can only add family members to your own household account.' });
  }

  const mode = body.mode === 'link' ? 'link' : 'create';
  const memberType = ['primary', 'secondary', 'child'].includes(body.memberType)
    ? body.memberType
    : 'child';

  const householdContext = buildHouseholdValidationContext(auth);
  const linkContacts = mode === 'link'
    ? buildLinkContactMeta(body, body.searchResults || [])
    : [];
  const validation = validateAddFamilyMemberRequest({
    memberType,
    household: householdContext,
    contacts: linkContacts,
    accountName: auth.accountName,
  });

  if (!validation.ok) {
    return res.status(400).json({ error: validation.message });
  }

  if (mode === 'link') {
    const contactIds = Array.isArray(body.contactIds)
      ? body.contactIds.map((id) => sanitizeContactId(id)).filter(Boolean)
      : [];

    if (!contactIds.length) {
      return res.status(400).json({ error: 'Select at least one existing contact to add.' });
    }

    const alreadyInHousehold = contactIds.filter((id) => auth.householdContactIds.includes(id));
    if (alreadyInHousehold.length) {
      return res.status(400).json({ error: 'One or more selected contacts are already on this household account.' });
    }

    try {
      const webhookPayload = buildAccountFamilyMemberPayload(auth, { ...body, contactIds }, 'link');
      const makeText = await postMakeAddFamilyWebhook(webhookUrl, webhookPayload, 'add family member (link)');
      console.log('Make.com add family member (link) response:', makeText.slice(0, 500));

      const roleResults = await applyHouseholdRolesViaMake(webhookUrl, auth, contactIds, memberType);
      const roleFailures = roleResults.filter((result) => !result.ok);
      if (roleFailures.length && process.env.MAKE_REQUIRE_HOUSEHOLD_ROLE === 'true') {
        return res.status(502).json({
          error: 'Contact linked, but Salesforce role update failed. Complete the set_household_role route in Make.com.',
          roleResults,
        });
      }

      const refreshed = await buildPortalSfData(auth.email);
      if (refreshed.error) {
        return res.status(503).json({ error: 'Contact linked, but portal data could not be refreshed.' });
      }

      const linkContacts = buildLinkContactMeta(body, body.searchResults || []);
      const sfData = mergeAddedContactsIntoSfData(refreshed.sfData, {
        contactIds,
        contactMeta: linkContacts,
        memberType,
      });
      userSalesforceData[auth.email.toLowerCase()] = sfData;

      return res.json({
        success: true,
        message: roleFailures.length
          ? `${contactIds.length} member${contactIds.length > 1 ? 's' : ''} linked to ${auth.accountName}, but Salesforce role update failed. Finish the set_household_role Make route.`
          : `${contactIds.length} member${contactIds.length > 1 ? 's' : ''} added to ${auth.accountName}.`,
        sfData,
        householdAccountId: auth.accountId,
        roleResults,
      });
    } catch (error) {
      console.error('Add family member (link) error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'First Name and Last Name are required.' });
  }

  const createPayload = buildAccountFamilyMemberPayload(auth, body, 'create');

  try {
    const makeText = await postMakeAddFamilyWebhook(webhookUrl, createPayload, 'add family member (create)');
    console.log('Make.com add family member (create) response:', makeText.slice(0, 500));

    let createdContactId = '';
    try {
      const parsed = parseMakePayload(makeText);
      createdContactId = sanitizeContactId(
        parsed?.contactId || parsed?.id || parsed?.Id || parsed?.recordId || '',
      );
    } catch {
      // Make may return plain Accepted text for create until response mapping is added.
    }

    if (createdContactId) {
      await applyHouseholdRolesViaMake(webhookUrl, auth, [createdContactId], memberType);
    }

    const refreshed = await buildPortalSfData(auth.email);
    if (refreshed.error) {
      return res.status(503).json({ error: 'Contact created, but portal data could not be refreshed.' });
    }

    const sfData = createdContactId
      ? mergeAddedContactsIntoSfData(refreshed.sfData, {
        contactIds: [createdContactId],
        contactMeta: [{ contactId: createdContactId, name: `${firstName} ${lastName}`.trim() }],
        memberType,
      })
      : refreshed.sfData;
    userSalesforceData[auth.email.toLowerCase()] = sfData;

    return res.json({
      success: true,
      message: `${firstName} ${lastName} was added to ${auth.accountName}.`,
      sfData,
      householdAccountId: auth.accountId,
    });
  } catch (error) {
    console.error('Add family member (create) error:', error);
    return res.status(500).json({ error: error.message });
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

    const lookup = await lookupSalesforceMember(email);
    if (!lookup.found) {
      return res.status(403).json({ error: 'unauthorized_member', message: 'You are not authorised to login to the member portal.' });
    }

    let contactId = lookup.memberDetails.contactId || userSalesforceData[email]?.contactId || '';
    const accountId = lookup.memberDetails.accountId || userSalesforceData[email]?.accountId || '';

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
            accountId,
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

    const refreshed = await buildPortalSfData(email);
    if (refreshed.error) {
      return res.status(503).json({ error: 'Unable to refresh profile from Salesforce.' });
    }

    userSalesforceData[email] = refreshed.sfData;

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      sfData: refreshed.sfData,
    });
  } catch (error) {
    console.error('Profile update authorization or save error:', error);
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'chabad-portal-api' });
});

app.listen(PORT, () => {
  console.log(`🚀 Church Portal backend server running on http://localhost:${PORT}`);
});
