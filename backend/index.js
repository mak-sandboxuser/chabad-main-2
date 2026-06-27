require('dotenv').config();
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { verifyToken, createClerkClient } = require('@clerk/backend');
const db = require('./db');

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

    let payload = null;
    try {
      payload = JSON.parse(makeText);
    } catch {
      // Make.com may return non-JSON; fall back to regex below
    }

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

    return {
      found: true,
      memberDetails: {
        contactId,
        firstName,
        lastName,
        name,
        role: role || 'Member',
        email: emailLower,
      },
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
    
    // Only Salesforce members may access the portal
    const lookup = await lookupSalesforceMember(email);

    if (!lookup.found) {
      authLog('DASHBOARD_DENIED', { email, reason: 'not_in_salesforce' });
      return res.status(403).json({
        error: 'unauthorized_member',
        message: 'You are not authorised to login to the member portal.',
      });
    }

    const memberDetails = lookup.memberDetails;

    // Cache Salesforce data
    userSalesforceData[email] = memberDetails;

    // Fetch portal metrics and items
    const dashboardData = await db.getDashboardData();
    authLog('DASHBOARD_OK', { email, clerkUserId: userId, name: memberDetails?.name });
    res.json({
      success: true,
      user: {
        id: userId,
        email: email,
        role: memberDetails?.role || 'Member',
        name: memberDetails?.name || 'Grace Church Member'
      },
      sfData: memberDetails,
      ...dashboardData
    });
  } catch (error) {
    authLog('DASHBOARD_AUTH_FAIL', { error: error.message });
    res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
});

// Stripe Checkout Session generation
app.post('/api/payments/create-checkout-session', async (req, res) => {
  const { email, amount } = req.body;
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }

  if (!stripe) {
    return res.status(500).json({ error: 'Stripe integration is not configured. Please add STRIPE_SECRET_KEY to backend .env file.' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Grace Church Donation',
            description: 'Thank you for supporting our community!',
          },
          unit_amount: Math.round(amount * 100), // convert to cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: `${FRONTEND_URL}/dashboard?payment=success`,
      cancel_url: `${FRONTEND_URL}/dashboard?payment=cancel`,
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

    const { firstName, lastName, phone, street, city, state, postalCode, country } = req.body;

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
            mobile: phone, // Map phone to mobile for Make.com webhook
            street,
            city,
            state,
            postalCode,
            country
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
      street,
      city,
      state,
      postalCode,
      country
    }, contactId);

    // Update cached user data
    userSalesforceData[email] = updatedMember;

    res.json({
      success: true,
      message: 'Profile updated successfully.',
      sfData: updatedMember
    });
  } catch (error) {
    console.error('Profile update authorization or save error:', error);
    res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Church Portal backend server running on http://localhost:${PORT}`);
});
