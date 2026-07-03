function stripTrailingCommas(jsonText) {
  return jsonText.replace(/,\s*([}\]])/g, '$1');
}

/** Make Array Aggregator sometimes returns `{...}, {...}` instead of `[{...},{...}]` */
function repairMakeArrayFieldsJson(text) {
  if (!text || typeof text !== 'string') return text;

  const fields = ['relationships', 'payments', 'pledges', 'recurring', 'contacts'];
  let result = text;

  for (const field of fields) {
    const after = fields.filter((f) => f !== field).map((f) => `"${f}"`).join('|');
    const lookAhead = after ? `(?=\\s*(?:${after}|\\}))` : `(?=\\s*\\})`;
    result = result.replace(
      new RegExp(`"${field}"\\s*:\\s*((?:\\{[\\s\\S]*?\\}\\s*,?\\s*)+)${lookAhead}`),
      (_, block) => {
        const trimmed = block.trim().replace(/,\s*$/, '');
        if (trimmed.startsWith('[')) return `"${field}": ${trimmed},`;
        return `"${field}": [${trimmed}],`;
      },
    );
  }

  return result;
}

function repairMakePortalJson(text) {
  return repairMakeArrayFieldsJson(text);
}

function repairMakeRelationshipsJson(text) {
  return repairMakeArrayFieldsJson(text);
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
    repairMakeRelationshipsJson(text),
    stripTrailingCommas(text),
    stripTrailingCommas(repairMakeRelationshipsJson(text)),
    stripTrailingCommas(text.replace(/\\"/g, '"')),
    stripTrailingCommas(repairMakeRelationshipsJson(text.replace(/\\"/g, '"'))),
  ];

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        try {
          return JSON.parse(stripTrailingCommas(repairMakePortalJson(parsed)));
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
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length && !keys.includes('array')) return [value];
  }
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
  if (!person1 && explanation) {
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

function formatMoneyField(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return `$${Math.abs(value).toFixed(2)}`;
  return String(value);
}

function parseMoneyValue(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Math.abs(value);
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
}

function getRawPaymentAmount(raw = {}) {
  const positiveAmount = raw['Positive Amount'] ?? raw.OneCRM__Positive_Amount__c;
  if (positiveAmount != null && positiveAmount !== '') {
    return parseMoneyValue(positiveAmount);
  }
  const rawAmount = raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c;
  if (typeof rawAmount === 'number' && rawAmount !== 0) {
    return Math.abs(rawAmount);
  }
  const paid = raw.paid ?? raw['Paid Amount'] ?? raw.OneCRM__Paid__c;
  return parseMoneyValue(paid);
}

/** Match ChabadOne Contact → Financials → Payments (Cash only, amount > 0). */
function shouldIncludePaymentRecord(raw = {}, normalized = {}) {
  const amount = getRawPaymentAmount(raw)
    || parseMoneyValue(normalized.amount)
    || parseMoneyValue(normalized.total);
  if (amount <= 0) return false;

  const paymentType = String(
    raw.OneCRM__Payment_Type__c ?? raw['Payment Type'] ?? raw.method ?? normalized.method ?? '',
  ).trim().toLowerCase();
  const method = String(normalized.method || raw.method || '').trim().toLowerCase();

  if (paymentType === 'cash' || method === 'cash') return true;
  if (method.includes('stripe')) return true;

  return false;
}

function filterNormalizedPayments(payments = []) {
  const seen = new Set();
  return payments
    .filter((payment) => {
      const amount = parseMoneyValue(payment.amount) || parseMoneyValue(payment.total);
      if (amount <= 0) return false;
      const method = String(payment.method || payment.type || '').trim().toLowerCase();
      if (method !== 'cash' && !method.includes('stripe')) return false;
      const key = payment.id || `${payment.date}|${payment.amount}|${method}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function normalizePayment(raw = {}, index = 0) {
  const positiveAmount = raw['Positive Amount'] ?? raw.OneCRM__Positive_Amount__c;
  const rawAmount = raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c;
  const amount = positiveAmount
    ?? (typeof rawAmount === 'number' && rawAmount < 0 ? Math.abs(rawAmount) : rawAmount)
    ?? raw['Income Total']
    ?? '';
  const total = raw.total ?? raw.totalAmount ?? raw.Total ?? raw['Income Total'] ?? amount;
  const paid = raw.paid ?? raw['Paid Amount'] ?? raw.OneCRM__Paid__c ?? '';
  const outstanding = raw.outstanding ?? raw.outstandingBalance ?? raw.Outstanding
    ?? raw['Outstanding Amount'] ?? raw.OneCRM__Amount_Outstanding__c ?? 0;
  const rawDate = raw.date ?? raw.paymentDate ?? raw.PaymentDate ?? raw['Income Date']
    ?? raw['Payment Date'] ?? raw.Date ?? raw.OneCRM__Date__c ?? '';
  const date = typeof rawDate === 'string' && rawDate.includes('T')
    ? rawDate.split('T')[0]
    : rawDate;

  return {
    id: raw.id || raw.paymentId || raw['Record ID'] || `payment_${index}`,
    amount: formatMoneyField(amount) || formatMoneyField(paid) || formatMoneyField(total) || '',
    total: formatMoneyField(total) || formatMoneyField(amount),
    date,
    outstanding: formatMoneyField(outstanding) || '$0.00',
    payer: raw.payer || raw.payerName || raw.parent || raw.accountName || raw['Payer / Parent'] || raw['Parent Account'] || raw['Related Contact'] || '',
    type: raw.type || raw.paymentType || raw.Type || raw['Payment Type'] || raw['Recognition Type'] || raw.OneCRM__Payment_Type__c || 'Payment',
    subType: raw.subType || raw.subtype || raw.subTypeName || raw['Sub-Type'] || raw['Sub Type'] || '',
    method: raw.method || raw.paymentMethod || raw['Payment Method'] || raw['Payment Plan'] || raw.OneCRM__Payment_Type__c || '',
    status: raw.status || raw.Status || raw['Processing Status'] || raw.OneCRM__Status__c || 'Paid',
  };
}

function normalizePledge(raw = {}, index = 0) {
  const amount = raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c ?? raw.OneCRM__Positive_Amount__c ?? '';
  const total = raw.total ?? raw.Total ?? amount;
  const paid = raw.paid ?? raw.paidAmount ?? raw.Paid ?? raw.OneCRM__Paid__c ?? '';
  const outstanding = raw.outstanding ?? raw.Outstanding ?? raw.OneCRM__Amount_Outstanding__c ?? 0;
  const rawDate = raw.date ?? raw.pledgeDate ?? raw.Date ?? raw['Pledge Date'] ?? raw.OneCRM__Date__c ?? '';
  const date = typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

  return {
    id: raw.id || raw.pledgeId || raw['Record ID'] || `pledge_${index}`,
    amount: formatMoneyField(amount),
    outstanding: formatMoneyField(outstanding) || '$0.00',
    total: formatMoneyField(total) || formatMoneyField(amount),
    paid: formatMoneyField(paid),
    name: raw.name || raw.pledgeName || raw.Name || raw['Pledge Name'] || raw.type || raw.Type || raw.OneCRM__Type__c || 'Pledge',
    parent: raw.parent || raw.parentAccount || raw.accountName || raw['Parent Account'] || raw['Related Contact'] || '',
    type: raw.type || raw.Type || raw.OneCRM__Type__c || '',
    subType: raw.subType || raw.subtype || raw['Sub-Type'] || raw['Sub Type'] || raw.OneCRM__Sub_Type__c || '',
    date,
    status: raw.status || raw.Status || raw.OneCRM__Status__c || 'Active',
  };
}

function normalizeRecurring(raw = {}, index = 0) {
  const rawNext = raw.nextDate ?? raw.nextChargeDate ?? raw['Next Charge Date'] ?? raw['Next Charge']
    ?? raw.OneCRM__Next_Charge_Date__c ?? raw.OneCRM__Next_Date__c ?? '';
  const nextDate = typeof rawNext === 'string' && rawNext.includes('T') ? rawNext.split('T')[0] : rawNext;

  return {
    id: raw.id || raw.recurringId || raw['Record ID'] || `recurring_${index}`,
    amount: formatMoneyField(raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c ?? ''),
    frequency: raw.frequency || raw.schedule || raw.Frequency || raw.OneCRM__Frequency__c || 'Monthly',
    nextDate,
    status: raw.status || raw.Status || raw.OneCRM__Status__c || 'Active',
    method: raw.method || raw.paymentMethod || raw['Payment Method'] || raw.OneCRM__Payment_Type__c || '',
    cardExpiry: raw.cardExpiry || raw.expires || raw['Card Expiry'] || raw['Expires'] || raw.OneCRM__Card_Expiry__c || '',
    type: raw.type || raw.planType || raw.Type || raw.OneCRM__Type__c || '',
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
  const rawPayments = unwrapMakeArray(payload.payments || payload.incomePayments);
  const payments = filterNormalizedPayments(
    rawPayments
      .map(normalizePayment)
      .filter((normalized, index) => shouldIncludePaymentRecord(rawPayments[index], normalized)),
  );
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
  filterNormalizedPayments,
  parseMoneyValue,
};
