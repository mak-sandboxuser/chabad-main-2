const fs = require('fs/promises');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

const defaultData = {
  users: [
    { id: '1', email: 'admin@church.org', role: 'admin', createdAt: new Date().toISOString() },
    { id: '2', email: 'pastor@church.org', role: 'pastor', createdAt: new Date().toISOString() }
  ],
  usedTokens: [],
  dashboardStats: {
    totalMembers: 450,
    monthlyDonations: 12450,
    upcomingEventsCount: 8,
    activeMinistries: 14
  },
  members: [
    { id: 'm1', name: 'John Doe', email: 'john@example.com', role: 'Member', status: 'Active', joinedDate: '2024-01-15' },
    { id: 'm2', name: 'Jane Smith', email: 'jane@example.com', role: 'Choir Leader', status: 'Active', joinedDate: '2023-08-22' },
    { id: 'm3', name: 'Robert Johnson', email: 'robert@example.com', role: 'Deacon', status: 'Active', joinedDate: '2022-11-05' },
    { id: 'm4', name: 'Emily Davis', email: 'emily@example.com', role: 'Volunteer', status: 'Inactive', joinedDate: '2025-02-10' },
    { id: 'm5', name: 'Michael Brown', email: 'michael@example.com', role: 'Member', status: 'Active', joinedDate: '2024-06-30' }
  ],
  events: [
    { id: 'e1', title: 'Sunday Worship Service', date: '2026-06-21', time: '09:00 AM', location: 'Main Sanctuary' },
    { id: 'e2', title: 'Youth Summer Camp', date: '2026-06-25', time: '08:00 AM', location: 'Camp Grace' },
    { id: 'e3', title: 'Weekly Bible Study', date: '2026-06-24', time: '07:00 PM', location: 'Fellowship Hall' },
    { id: 'e4', title: 'Community Outreach Drive', date: '2026-06-27', time: '10:00 AM', location: 'City Park' }
  ]
};

async function initDb() {
  try {
    await fs.access(DB_FILE);
  } catch (error) {
    // If file doesn't exist, create it with default data
    await fs.writeFile(DB_FILE, JSON.stringify(defaultData, null, 2), 'utf-8');
  }
}

async function readDb() {
  await initDb();
  const data = await fs.readFile(DB_FILE, 'utf-8');
  return JSON.parse(data);
}

async function writeDb(data) {
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function getUserByEmail(email) {
  const db = await readDb();
  return db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

async function createUser(email) {
  const db = await readDb();
  // Double check user doesn't already exist
  let user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (user) return user;

  user = {
    id: String(db.users.length + 1),
    email: email.toLowerCase(),
    role: 'user',
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  await writeDb(db);
  return user;
}

async function isTokenUsed(token) {
  const db = await readDb();
  return db.usedTokens.includes(token);
}

async function markTokenUsed(token) {
  const db = await readDb();
  db.usedTokens.push(token);
  await writeDb(db);
}

async function getMemberByEmail(_email) {
  // Portal member data is loaded live from Salesforce via Make.com — not db.json.
  return null;
}

async function recordPayment(_email, _amount, _type, _method, _paymentId = null) {
  // Payments are persisted in Salesforce via Make.com webhooks only.
  return null;
}

async function updateMemberProfile(_email, _profileData, _contactId) {
  // Profile updates are persisted in Salesforce via Make.com only.
  return null;
}

async function syncPortalData(_email, _portalData, _contactId = '') {
  // Portal reads live from Salesforce — no local member cache.
  return null;
}

async function getDashboardData() {
  return {
    stats: null,
    members: [],
    events: [],
  };
}

module.exports = {
  getUserByEmail,
  createUser,
  isTokenUsed,
  markTokenUsed,
  getDashboardData,
  getMemberByEmail,
  recordPayment,
  updateMemberProfile,
  syncPortalData,
};
