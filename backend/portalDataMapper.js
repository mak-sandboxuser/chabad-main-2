function stripTrailingCommas(jsonText) {
  return jsonText.replace(/,\s*([}\]])/g, '$1');
}

function parseMakePayload(rawText) {
  if (!rawText || typeof rawText !== 'string') return null;

  let text = rawText.trim();
  if (!text) return null;

  // Make sometimes returns JSON as a quoted string.
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      text = JSON.parse(text);
    } catch {
      text = text.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, '\n');
    }
  }

  if (typeof text !== 'string') return text;

  const attempts = [
    text,
    stripTrailingCommas(text),
    stripTrailingCommas(text.replace(/\\"/g, '"')),
  ];

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        try {
          return JSON.parse(stripTrailingCommas(parsed));
        } catch {
          return null;
        }
      }
      return parsed;
    } catch {
      // try next
    }
  }

  return null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Make.com Array Aggregator wraps lists as { array: [...], __IMTAGGLENGTH__: n } */
function unwrapMakeArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.array)) return value.array;
  return [];
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === 'yes' || normalized === '1';
}

function normalizeContact(raw = {}, index = 0) {
  return {
    id: raw.id || raw.contactId || `contact_${index}`,
    name: raw.name || [raw.firstName, raw.lastName].filter(Boolean).join(' ').trim() || 'Member',
    role: raw.role || raw.contactRole || 'Member',
    isPrimary: toBool(raw.isPrimary ?? raw.primaryMember ?? raw.primary),
    isSecondary: toBool(raw.isSecondary ?? raw.secondaryMember ?? raw.secondary),
    contactId: raw.contactId || raw.id || '',
    email: raw.email || '',
    phone: raw.phone || raw.mobile || '',
  };
}

function normalizeRelationship(raw = {}, index = 0) {
  let person1 = raw.person1
    || raw.relatedPerson
    || raw.fromName
    || raw['Person (Contact)']
    || raw.OneCRM__Related_Contact__c
    || '';
  const explanation = raw.explanation
    || raw.relationshipExplanation
    || raw['Relationship Explanation']
    || raw.OneCRM__Relationship_Explanation__c
    || '';
  let person2 = raw.person2
    || raw.person
    || raw.toName
    || raw['Full Name']
    || raw.Name
    || raw.OneCRM__Contact__c
    || '';

  // Make.com sometimes maps the related contact lookup ID instead of the display name.
  if (/^003[\w]{12,18}$/i.test(String(person1).trim()) && explanation) {
    const nameMatch = explanation.match(/^(.+?)\s+is\s+/i);
    if (nameMatch) person1 = nameMatch[1].trim();
  }
  if (/^003[\w]{12,18}$/i.test(String(person2).trim()) && explanation) {
    const nameMatch = explanation.match(/is\s+(.+?)'s\s/i);
    if (nameMatch) person2 = nameMatch[1].trim();
  }

  return {
    id: raw.id || `relationship_${index}`,
    person1,
    person2,
    status: raw.status || raw.Status || raw.OneCRM__Status__c || 'Current',
    type: raw.type || raw.Type || raw.relationshipType || raw.OneCRM__Type__c || '',
    explanation,
  };
}

function normalizePayment(raw = {}, index = 0) {
  const amount = raw.amount || raw.Amount || '';
  return {
    id: raw.id || raw.paymentId || `payment_${index}`,
    amount: typeof amount === 'number' ? `$${amount.toFixed(2)}` : String(amount),
    total: raw.total || raw.totalAmount || amount,
    date: raw.date || raw.paymentDate || raw.PaymentDate || '',
    outstanding: raw.outstanding || raw.outstandingBalance || '$0.00',
    payer: raw.payer || raw.payerName || raw.parent || raw.accountName || '',
    type: raw.type || raw.paymentType || '',
    subType: raw.subType || raw.subtype || raw.subTypeName || '',
    method: raw.method || raw.paymentMethod || '',
    status: raw.status || 'Paid',
  };
}

function normalizePledge(raw = {}, index = 0) {
  return {
    id: raw.id || raw.pledgeId || `pledge_${index}`,
    amount: raw.amount || '',
    outstanding: raw.outstanding || '',
    total: raw.total || raw.amount || '',
    paid: raw.paid || raw.paidAmount || '',
    name: raw.name || raw.pledgeName || '',
    parent: raw.parent || raw.parentAccount || raw.accountName || '',
    type: raw.type || '',
    subType: raw.subType || raw.subtype || '',
    date: raw.date || raw.pledgeDate || '',
    status: raw.status || 'Active',
  };
}

function normalizeRecurring(raw = {}, index = 0) {
  return {
    id: raw.id || raw.recurringId || `recurring_${index}`,
    amount: raw.amount || '',
    frequency: raw.frequency || raw.schedule || 'Monthly',
    nextDate: raw.nextDate || raw.nextChargeDate || '',
    status: raw.status || 'Active',
    method: raw.method || raw.paymentMethod || '',
    cardExpiry: raw.cardExpiry || raw.expires || '',
    type: raw.type || raw.planType || '',
  };
}

function normalizeMembership(raw = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const keys = Object.keys(raw);
  if (!keys.length) return null;
  return {
    tier: raw.tier || raw.membershipTier || 'Member',
    status: raw.status || raw.membershipStatus || 'Active',
    memberSince: raw.memberSince || raw.memberSinceDate || '',
    renewalDate: raw.renewalDate || raw.nextRenewalDate || '',
    annualCommitment: raw.annualCommitment || raw.annualAmount || '',
    contributedYtd: raw.contributedYtd || raw.contributed || '',
    outstanding: raw.outstanding || '',
    autoRenewal: raw.autoRenewal || (toBool(raw.autoRenew) ? 'Enabled' : 'Disabled'),
    paymentMethod: raw.paymentMethod || '',
    paymentMethodExpiry: raw.paymentMethodExpiry || raw.cardExpiry || '',
    notes: raw.notes || raw.membershipNotes || '',
  };
}

function buildContactsFromMemberDetails(memberDetails = {}) {
  if (!memberDetails.contactId && !memberDetails.name) return [];

  return [{
    id: memberDetails.contactId || 'primary_contact',
    name: memberDetails.name || memberDetails.email?.split('@')[0] || 'Member',
    role: memberDetails.role || 'Member',
    isPrimary: true,
    isSecondary: false,
    contactId: memberDetails.contactId || '',
    email: memberDetails.email || '',
    phone: memberDetails.mobile || memberDetails.phone || '',
  }];
}

function extractPortalDataFromPayload(payload, memberDetails = {}) {
  if (!payload || typeof payload !== 'object') {
    return {
      fromSalesforce: false,
      contacts: buildContactsFromMemberDetails(memberDetails),
      relationships: [],
      payments: [],
      pledges: [],
      recurring: [],
      membership: null,
    };
  }

  const contacts = unwrapMakeArray(payload.contacts || payload.householdContacts || payload.accountContacts)
    .map(normalizeContact);
  const relationships = unwrapMakeArray(payload.relationships || payload.householdRelationships)
    .map(normalizeRelationship);
  const payments = unwrapMakeArray(payload.payments || payload.incomePayments)
    .map(normalizePayment);
  const pledges = unwrapMakeArray(payload.pledges || payload.incomePledges)
    .map(normalizePledge);
  const recurring = unwrapMakeArray(payload.recurring || payload.recurringBilling || payload.recurringPayments)
    .map(normalizeRecurring);
  const membership = normalizeMembership(payload.membership);

  const hasRemotePortalData = contacts.length
    || relationships.length
    || payments.length
    || pledges.length
    || recurring.length
    || membership;

  return {
    fromSalesforce: Boolean(hasRemotePortalData || payload.fromSalesforce === true),
    accountId: payload.accountId || payload.AccountId || memberDetails.accountId || '',
    accountName: payload.accountName || payload.account || memberDetails.profile?.accountName || memberDetails.name || '',
    phone: payload.phone || payload.accountPhone || memberDetails.mobile || memberDetails.phone || '',
    email: payload.email || memberDetails.email || '',
    street: payload.street || payload.shippingStreet || memberDetails.street || '',
    city: payload.city || payload.shippingCity || memberDetails.city || '',
    state: payload.state || payload.shippingState || memberDetails.state || '',
    postalCode: payload.postalCode || payload.shippingPostalCode || memberDetails.postalCode || '',
    country: payload.country || payload.shippingCountry || memberDetails.country || '',
    contacts: contacts.length ? contacts : buildContactsFromMemberDetails(memberDetails),
    relationships,
    payments,
    pledges,
    recurring,
    membership,
  };
}

function mergePaymentsRemoteAndLocal(remotePayments = [], localPayments = []) {
  const merged = [...remotePayments];
  const seen = new Set(remotePayments.map((item) => item.id).filter(Boolean));

  for (const payment of localPayments) {
    if (payment.id && seen.has(payment.id)) continue;
    if ((payment.method || '').toLowerCase().includes('stripe') || (payment.id || '').includes('stripe')) {
      merged.unshift(normalizePayment(payment, merged.length));
    }
  }

  return merged;
}

module.exports = {
  parseMakePayload,
  extractPortalDataFromPayload,
  buildContactsFromMemberDetails,
  mergePaymentsRemoteAndLocal,
  unwrapMakeArray,
  normalizeContact,
  normalizePayment,
};
