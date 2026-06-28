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

async function getMemberByEmail(email) {
  const db = await readDb();
  const emailLower = email.toLowerCase();
  
  if (emailLower === 'alex.maksumov@example.com' || emailLower === 'alex@example.com' || emailLower === 'pastor@church.org') {
    return {
      name: "Dr. & Dr. Alex Maksumov",
      email: emailLower,
      role: "Member",
      profile: {
        accountName: "Dr. & Dr. Alex Maksumov",
        phone: "(917) 655-6200",
        street: "32 Miller Circle",
        city: "ARMONK",
        state: "NY",
        postalCode: "10504",
        country: "United States",
        householdDonationTotal: "$1,000.00",
        spiritual: {
          kosher: "Yes",
          hasPushka: "Yes",
          datePushkaLastEmptied: "2026-05-10"
        }
      },
      contacts: [
        { id: "c1", name: "Alex Maksumov", role: "Parent", isPrimary: true },
        { id: "c2", name: "Nana Maksumov", role: "Parent", isSecondary: true },
        { id: "c3", name: "Daniel Maksumov", role: "Child", isPrimary: false },
        { id: "c4", name: "David Maksumov", role: "Child", isPrimary: false }
      ],
      relationships: [
        { id: "r1", person1: "Alex Maksumov", person2: "Nana Maksumov", status: "Current", type: "Husband", explanation: "Alex Maksumov is Nana Maksumov's Husband" },
        { id: "r2", person1: "Alex Maksumov", person2: "David Maksumov", status: "Current", type: "Parent", explanation: "Alex Maksumov is David Maksumov's Parent" },
        { id: "r3", person1: "Nana Maksumov", person2: "David Maksumov", status: "Current", type: "Mother", explanation: "Nana Maksumov is David Maksumov's Mother" },
        { id: "r4", person1: "Alex Maksumov", person2: "Daniel Maksumov", status: "Current", type: "Parent", explanation: "Alex Maksumov is Daniel Maksumov's Parent" },
        { id: "r5", person1: "Nana Maksumov", person2: "Daniel Maksumov", status: "Current", type: "Mother", explanation: "Nana Maksumov is Daniel Maksumov's Mother" },
        { id: "r6", person1: "David Maksumov", person2: "Daniel Maksumov", status: "Current", type: "Brother", explanation: "David Maksumov is Daniel Maksumov's Brother" }
      ],
      financials: {
        totalPayments: 3198.00,
        payments: [
          { id: "p1", amount: "$2,499.00", totalPledged: "$3,180.00", date: "2026-09-15", type: "Hebrew School Tuition", method: "Check", status: "Paid" },
          { id: "p2", amount: "$180.00", totalPledged: "$180.00", date: "2026-08-20", type: "Holiday Seat Pledges", method: "Credit Card", status: "Paid" },
          { id: "p3", amount: "$360.00", totalPledged: "$360.00", date: "2026-04-27", type: "General Donation", method: "Credit Card", status: "Paid" },
          { id: "p4", amount: "$159.00", totalPledged: "$1,179.00", date: "2026-03-10", type: "Tuition Fees", method: "Zelle", status: "Paid" }
        ]
      }
    };
  }
  
  const localMember = db.members.find(m => m.email.toLowerCase() === emailLower);
  if (localMember) {
    const name = localMember.name || emailLower.split('@')[0];
    return {
      ...localMember,
      profile: localMember.profile || {
        accountName: name,
        phone: '',
        street: '',
        city: '',
        state: '',
        postalCode: '',
        country: '',
        householdDonationTotal: '$0.00',
        spiritual: { kosher: 'No', hasPushka: 'No', datePushkaLastEmptied: '' },
      },
      contacts: localMember.syncedFromSalesforce ? (localMember.contacts || []) : [],
      relationships: localMember.syncedFromSalesforce ? (localMember.relationships || []) : [],
      financials: localMember.financials || { totalPayments: 0, payments: [], pledges: [], recurring: [] },
    };
  }
  
  return null;
}

async function recordPayment(email, amount, type, method) {
  const db = await readDb();
  const emailLower = email.toLowerCase();
  
  // 1. Find user/member
  let localMember = db.members.find(m => m.email.toLowerCase() === emailLower);
  if (!localMember) {
    // If not in db.members, auto-create a mock member so we can assign payments to them
    localMember = {
      id: 'm' + (db.members.length + 1),
      name: email.split('@')[0],
      email: emailLower,
      role: 'Member',
      status: 'Active',
      joinedDate: new Date().toISOString().split('T')[0]
    };
    db.members.push(localMember);
  }

  // 2. Ensure financials object exists
  if (!localMember.financials) {
    localMember.financials = {
      totalPayments: 0,
      payments: []
    };
  }

  // 3. Add payment log
  const newPayment = {
    id: 'p_stripe_' + Date.now(),
    amount: `$${amount.toFixed(2)}`,
    totalPledged: `$${amount.toFixed(2)}`,
    date: new Date().toISOString().split('T')[0],
    type: type || 'General Donation',
    method: method || 'Credit Card (Stripe via Make.com)',
    status: 'Paid'
  };
  
  localMember.financials.payments.unshift(newPayment);
  localMember.financials.totalPayments += amount;

  // 4. Update global statistics
  if (!db.dashboardStats) {
    db.dashboardStats = {
      totalMembers: db.members.length,
      monthlyDonations: 0,
      upcomingEventsCount: db.events.length,
      activeMinistries: 14
    };
  }
  
  db.dashboardStats.monthlyDonations += amount;
  db.dashboardStats.totalMembers = db.members.length;

  // 5. Write to database
  await writeDb(db);

  // Return the complete member profile matching getMemberByEmail format
  return {
    ...localMember,
    profile: localMember.profile || {
      accountName: localMember.name,
      phone: "(555) 111-2222",
      street: "Grace Way",
      city: "Grace Town",
      state: "CA",
      postalCode: "12345",
      country: "USA",
      householdDonationTotal: `$${localMember.financials.totalPayments.toFixed(2)}`,
      spiritual: { kosher: "No", hasPushka: "No", datePushkaLastEmptied: "" }
    },
    contacts: localMember.contacts || [
      { id: "c_" + localMember.id, name: localMember.name, role: localMember.role || "Member", isPrimary: true }
    ],
    relationships: localMember.relationships || [],
    financials: localMember.financials
  };
}

async function updateMemberProfile(email, profileData, contactId) {
  const db = await readDb();
  const emailLower = email.toLowerCase();
  
  let localMember = db.members.find(m => m.email.toLowerCase() === emailLower);
  if (!localMember) {
    localMember = {
      id: 'm' + (db.members.length + 1),
      contactId: contactId || '',
      name: `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim() || email.split('@')[0],
      email: emailLower,
      role: 'Member',
      status: 'Active',
      joinedDate: new Date().toISOString().split('T')[0]
    };
    db.members.push(localMember);
  } else {
    if (contactId) {
      localMember.contactId = contactId;
    }
    if (profileData.firstName || profileData.lastName) {
      localMember.name = `${profileData.firstName || ''} ${profileData.lastName || ''}`.trim() || localMember.name;
    }
  }

  if (!localMember.profile) {
    localMember.profile = {};
  }

  localMember.profile = {
    ...localMember.profile,
    accountName: localMember.name,
    phone: profileData.phone || localMember.profile.phone || '',
    homePhone: profileData.homePhone || localMember.profile.homePhone || '',
    street: profileData.street || localMember.profile.street || '',
    city: profileData.city || localMember.profile.city || '',
    state: profileData.state || localMember.profile.state || '',
    postalCode: profileData.postalCode || localMember.profile.postalCode || '',
    country: profileData.country || localMember.profile.country || '',
    nickname: profileData.nickname || localMember.profile.nickname || '',
    title: profileData.title || localMember.profile.title || '',
    lifecycle: {
      ...(localMember.profile.lifecycle || {}),
      hebrewName: profileData.hebrewName || localMember.profile.lifecycle?.hebrewName || '',
      fathersHebrewName: profileData.fathersHebrewName || localMember.profile.lifecycle?.fathersHebrewName || '',
      mothersHebrewName: profileData.mothersHebrewName || localMember.profile.lifecycle?.mothersHebrewName || '',
      jewish: profileData.jewish || localMember.profile.lifecycle?.jewish || '',
      hebrewBirthdate: profileData.hebrewBirthdate || localMember.profile.lifecycle?.hebrewBirthdate || '',
      nextHebrewBirthday: profileData.nextHebrewBirthday || localMember.profile.lifecycle?.nextHebrewBirthday || '',
      weddingDate: profileData.weddingDate || localMember.profile.lifecycle?.weddingDate || '',
      lifecycleStatus: profileData.lifecycleStatus || localMember.profile.lifecycle?.lifecycleStatus || '',
    },
    additional: {
      ...(localMember.profile.additional || {}),
      birthdate: profileData.birthdate || localMember.profile.additional?.birthdate || '',
      age: profileData.age || localMember.profile.additional?.age || '',
      gender: profileData.gender || localMember.profile.additional?.gender || '',
    },
  };

  await writeDb(db);

  const firstName = profileData.firstName || localMember.name?.split(/\s+/)[0] || '';
  const lastName = profileData.lastName || localMember.name?.split(/\s+/).slice(1).join(' ') || '';

  return {
    ...localMember,
    firstName,
    lastName,
    contacts: localMember.contacts || [
      { id: 'c_' + localMember.id, name: localMember.name, role: localMember.role || 'Member', isPrimary: true }
    ],
    relationships: localMember.relationships || [],
    financials: localMember.financials || { totalPayments: 0, payments: [], pledges: [], recurring: [] },
  };
}

async function syncPortalData(email, portalData, contactId = '') {
  const db = await readDb();
  const emailLower = email.toLowerCase();
  let localMember = db.members.find((m) => m.email.toLowerCase() === emailLower);

  if (!localMember) {
    localMember = {
      id: 'm' + (db.members.length + 1),
      name: portalData.accountName || email.split('@')[0],
      email: emailLower,
      role: 'Member',
      status: 'Active',
      joinedDate: new Date().toISOString().split('T')[0],
    };
    db.members.push(localMember);
  }

  if (contactId) localMember.contactId = contactId;
  if (portalData.fromSalesforce) localMember.syncedFromSalesforce = true;
  if (portalData.accountId) localMember.accountId = portalData.accountId;
  if (portalData.accountName) {
    localMember.name = portalData.accountName;
    localMember.profile = {
      ...(localMember.profile || {}),
      accountName: portalData.accountName,
      phone: portalData.phone || localMember.profile?.phone || '',
      street: portalData.street || localMember.profile?.street || '',
      city: portalData.city || localMember.profile?.city || '',
      state: portalData.state || localMember.profile?.state || '',
      postalCode: portalData.postalCode || localMember.profile?.postalCode || '',
      country: portalData.country || localMember.profile?.country || '',
    };
  }

  if (Array.isArray(portalData.contacts) && portalData.contacts.length) {
    localMember.contacts = portalData.contacts;
  }
  if (Array.isArray(portalData.relationships) && portalData.relationships.length) {
    localMember.relationships = portalData.relationships;
  }
  if (portalData.membership) {
    localMember.membership = portalData.membership;
  }

  localMember.financials = {
    ...(localMember.financials || { totalPayments: 0, payments: [] }),
    payments: portalData.payments?.length ? portalData.payments : (localMember.financials?.payments || []),
    pledges: portalData.pledges?.length ? portalData.pledges : (localMember.financials?.pledges || []),
    recurring: portalData.recurring?.length ? portalData.recurring : (localMember.financials?.recurring || []),
  };
  localMember.financials.totalPayments = localMember.financials.payments.reduce((sum, item) => {
    const amount = parseFloat(String(item.amount || '').replace(/[^0-9.-]/g, '')) || 0;
    return sum + amount;
  }, 0);

  await writeDb(db);
  return localMember;
}

async function getDashboardData() {
  const db = await readDb();
  return {
    stats: db.dashboardStats,
    members: db.members,
    events: db.events
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
