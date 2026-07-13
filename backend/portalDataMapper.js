const {
  getPortalFiscalYearRange,
  isDateInPortalFiscalYear,
  formatPortalFiscalYearLabel,
} = require('./portalFiscalYear');

function stripTrailingCommas(jsonText) {
  return jsonText.replace(/,\s*([}\]])/g, '$1');
}

/** Make Array Aggregator sometimes returns `{...}, {...}` instead of `[{...},{...}]` */
function repairMakeArrayFieldsJson(text) {
  if (!text || typeof text !== 'string') return text;

  const fields = ['relationships', 'payments', 'pledges', 'recurring', 'contacts', 'paymentPrograms'];
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

function resolveContactRole(raw = {}) {
  const explicitRole = raw.role
    || raw.contactRole
    || raw['Role']
    || raw.Roles
    || raw['Roles']
    || '';
  const normalizedRole = String(explicitRole || '').trim();
  if (normalizedRole && !/^member$/i.test(normalizedRole)) {
    return normalizedRole;
  }

  if (toBool(raw.isPrimary ?? raw.primaryMember ?? raw.primary ?? raw.IsPrimaryMember)) {
    return 'Parent';
  }
  if (toBool(raw.isSecondary ?? raw.secondaryMember ?? raw.secondary)) {
    return 'Parent';
  }

  const memberType = String(raw.memberType || '').trim().toLowerCase();
  if (memberType === 'child') return 'Child';
  if (memberType === 'primary' || memberType === 'secondary') return 'Parent';

  return normalizedRole || 'Member';
}

function getContactKey(contact = {}) {
  const key = String(contact.contactId || contact.id || '').trim();
  return key.startsWith('003') ? key : '';
}

function mergeContactsList(...lists) {
  const merged = new Map();

  lists.flat().filter(Boolean).forEach((contact, index) => {
    const normalized = normalizeContact(contact, index);
    const key = getContactKey(normalized);
    if (!key) return;
    const existing = merged.get(key) || {};
    merged.set(key, { ...existing, ...normalized });
  });

  return [...merged.values()];
}

function extractAllContactsFromPayload(payload = {}) {
  const sources = [
    payload.contacts,
    payload.householdContacts,
    payload.accountContacts,
    payload.householdMembers,
    payload.members,
    payload.accountContactRelations,
    payload.contactsByAccount,
    payload.searchResults,
  ];

  return mergeContactsList(...sources.map((source) => unwrapMakeArray(source)));
}

function normalizeContact(raw = {}, index = 0) {
  const contactId = String(
    raw.contactId
    || raw.Id
    || raw.id
    || raw['Contact ID']
    || raw['Record ID']
    || '',
  ).trim();
  const firstName = raw.firstName || raw.FirstName || raw['First Name'] || '';
  const lastName = raw.lastName || raw.LastName || raw['Last Name'] || '';
  const isPrimary = toBool(
    raw.isPrimary
    ?? raw.primaryMember
    ?? raw.primary
    ?? raw.IsPrimaryMember
    ?? raw['Primary Member']
    ?? raw.OneCRM__Primary_Member__c,
  );
  const isSecondary = toBool(
    raw.isSecondary
    ?? raw.secondaryMember
    ?? raw.secondary
    ?? raw.IsSecondaryMember
    ?? raw['Secondary Member']
    ?? raw.OneCRM__Secondary_Member__c,
  );

  return {
    id: contactId || raw.id || `contact_${index}`,
    name: raw.name
      || raw.Name
      || raw['Full Name']
      || [firstName, lastName].filter(Boolean).join(' ').trim()
      || 'Member',
    role: resolveContactRole({ ...raw, isPrimary, isSecondary }),
    isPrimary,
    isSecondary,
    contactId,
    email: raw.email || raw.Email || '',
    phone: raw.phone || raw.mobile || raw.MobilePhone || raw.Phone || '',
    street: raw.street || raw.MailingStreet || raw['Mailing Street'] || '',
    city: raw.city || raw.MailingCity || raw['Mailing City'] || '',
    state: raw.state || raw.MailingState || raw['Mailing State'] || '',
    postalCode: raw.postalCode || raw.MailingPostalCode || raw['Mailing Postal Code'] || '',
    country: raw.country || raw.MailingCountry || raw['Mailing Country'] || '',
  };
}

function mergeHouseholdPortalData(portalData = {}, householdData = null) {
  if (!householdData) return portalData;

  return {
    ...portalData,
    fromSalesforce: Boolean(portalData.fromSalesforce || householdData.fromSalesforce),
    accountId: householdData.accountId || portalData.accountId || '',
    accountName: householdData.accountName || portalData.accountName || '',
    phone: householdData.phone || portalData.phone || '',
    email: householdData.email || portalData.email || '',
    street: householdData.street || portalData.street || '',
    city: householdData.city || portalData.city || '',
    state: householdData.state || portalData.state || '',
    postalCode: householdData.postalCode || portalData.postalCode || '',
    country: householdData.country || portalData.country || '',
    contacts: mergeContactsList(portalData.contacts, householdData.contacts),
    relationships: householdData.relationships?.length
      ? householdData.relationships
      : (portalData.relationships || []),
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
  if (positiveAmount != null && positiveAmount !== '' && parseMoneyValue(positiveAmount) > 0) {
    return parseMoneyValue(positiveAmount);
  }
  const rawAmount = raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c;
  if (typeof rawAmount === 'number' && rawAmount !== 0) {
    return Math.abs(rawAmount);
  }
  const paid = raw.paid ?? raw['Paid Amount'] ?? raw.OneCRM__Paid__c;
  return parseMoneyValue(paid);
}

function resolvePledgeAmount(raw = {}) {
  const positive = parseMoneyValue(raw.OneCRM__Positive_Amount__c ?? raw['Positive Amount']);
  const outstanding = parseMoneyValue(raw.OneCRM__Amount_Outstanding__c ?? raw['Outstanding Amount']);
  const paid = parseMoneyValue(raw.OneCRM__Paid__c ?? raw['Paid Amount'] ?? raw.paid);
  const rawAmount = parseMoneyValue(raw.OneCRM__Amount__c ?? raw.amount ?? raw.Amount);

  if (positive > 0) return positive;
  if (outstanding > 0) return outstanding + paid;
  if (rawAmount > 0) return rawAmount;
  if (paid > 0) return paid;
  return 0;
}

function mergePledgeRecords(explicit = [], income = []) {
  const byId = new Map();
  [...explicit, ...income].forEach((raw) => {
    const id = raw.Id || raw.id || raw['Record ID'] || '';
    const key = id || `${raw.OneCRM__Date__c || raw.date}|${resolvePledgeAmount(raw)}|${raw.OneCRM__Paid__c || 0}`;
    if (!byId.has(key)) byId.set(key, raw);
  });
  return [...byId.values()];
}

function isSendInvoicesRecord(raw = {}) {
  const paymentType = String(raw.OneCRM__Payment_Type__c || raw['Payment Type'] || '').trim().toLowerCase();
  return paymentType === 'send invoices';
}

/** ChabadOne Financials → Payments: cash line items and fully paid parent income rows. */
function isSalesforcePaymentRecord(raw = {}) {
  if (isSendInvoicesRecord(raw)) return false;

  const paymentType = String(raw.OneCRM__Payment_Type__c || raw['Payment Type'] || '').trim().toLowerCase();
  const rawAmount = Number(raw.OneCRM__Amount__c ?? raw.Amount ?? 0);
  const paid = parseMoneyValue(raw.OneCRM__Paid__c ?? raw['Paid Amount'] ?? raw.paid);
  const outstanding = parseMoneyValue(raw.OneCRM__Amount_Outstanding__c ?? raw['Outstanding Amount'] ?? raw.outstanding);

  if (rawAmount < 0 && paymentType === 'cash') return true;
  if (rawAmount >= 0 && paid > 0 && outstanding === 0) return true;

  return false;
}

function isIncomePledgeRecord(raw = {}) {
  if (isSendInvoicesRecord(raw)) return false;
  if (isSalesforcePaymentRecord(raw)) return false;

  const amount = resolvePledgeAmount(raw) || getRawPaymentAmount(raw);
  return amount > 0;
}

/** Match ChabadOne Contact → Financials → Payments tab. */
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
  if (isSalesforcePaymentRecord(raw)) return true;

  return false;
}

function shouldIncludePledgeRecord(raw = {}, normalized = {}) {
  const paymentType = String(raw.OneCRM__Payment_Type__c || raw['Payment Type'] || normalized.method || '').trim().toLowerCase();
  if (paymentType === 'cash') return false;
  if (paymentType === 'send invoices') return false;

  const amount = resolvePledgeAmount(raw)
    || parseMoneyValue(normalized.amount)
    || parseMoneyValue(normalized.total);
  return amount > 0;
}

function shouldIncludeRecurringRecord(raw = {}, normalized = {}) {
  const amount = parseMoneyValue(normalized.amount)
    || parseMoneyValue(raw.OneCRM__Amount_Per_Charge__c)
    || getRawPaymentAmount(raw);
  if (amount <= 0) return false;

  const schedule = String(
    raw.OneCRM__Schedule__c || raw.Schedule || raw.schedule || normalized.frequency || '',
  ).trim();
  const frequency = String(
    raw.OneCRM__Frequency__c || raw.Frequency || raw.frequency || normalized.frequency || '',
  ).trim();
  const billingMode = String(raw.billingMode || raw.isRecurring || '').toLowerCase();

  return Boolean(schedule) || Boolean(frequency) || billingMode.includes('recurring');
}

function filterNormalizedPledges(pledges = []) {
  const seen = new Set();
  return pledges
    .filter((pledge) => {
      const amount = parseMoneyValue(pledge.amount) || parseMoneyValue(pledge.total);
      if (amount <= 0) return false;
      const key = pledge.id && !String(pledge.id).startsWith('pledge_')
        ? pledge.id
        : `${pledge.date}|${pledge.amount}|${pledge.paid}|${pledge.outstanding}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => compareFinancialRecordsByRecent(a, b));
}

function filterNormalizedRecurring(recurring = []) {
  return recurring
    .filter((item) => parseMoneyValue(item.amount) > 0)
    .sort((a, b) => compareFinancialRecordsByRecent(
      { ...a, date: a.nextDate },
      { ...b, date: b.nextDate },
    ));
}

function paymentDedupeKey(payment = {}) {
  const amount = parseMoneyValue(payment.amount) || parseMoneyValue(payment.total);
  const method = String(payment.method || payment.type || '').trim().toLowerCase();
  const date = String(payment.date || '').slice(0, 10);
  return `${date}|${amount.toFixed(2)}|${method}`;
}

function compareFinancialRecordsByRecent(a, b) {
  const toTime = (record) => {
    const value = record.sortDate || record.date || '';
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [year, month, day] = value.slice(0, 10).split('-').map(Number);
      return new Date(year, month - 1, day).getTime();
    }
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const dateDiff = toTime(b) - toTime(a);
  if (dateDiff !== 0) return dateDiff;
  return String(b.id || '').localeCompare(String(a.id || ''));
}

function filterNormalizedPayments(payments = []) {
  const seen = new Set();
  return payments
    .filter((payment) => {
      const amount = parseMoneyValue(payment.amount) || parseMoneyValue(payment.total);
      if (amount <= 0) return false;
      if (!isDateInPortalFiscalYear(payment.sortDate || payment.date)) return false;
      const key = paymentDedupeKey(payment);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(compareFinancialRecordsByRecent);
}

function normalizePayment(raw = {}, index = 0) {
  const positiveAmount = raw['Positive Amount'] ?? raw.OneCRM__Positive_Amount__c;
  const rawAmount = raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c;
  const paidRaw = raw.paid ?? raw['Paid Amount'] ?? raw.OneCRM__Paid__c ?? '';
  const positiveValue = parseMoneyValue(positiveAmount);
  const amount = (positiveValue > 0 ? positiveValue : null)
    ?? (typeof rawAmount === 'number' && rawAmount < 0 ? Math.abs(rawAmount) : null)
    ?? (typeof rawAmount === 'number' && rawAmount > 0 ? rawAmount : null)
    ?? parseMoneyValue(paidRaw)
    ?? raw['Income Total']
    ?? '';
  const total = raw.total ?? raw.totalAmount ?? raw.Total ?? raw['Income Total'] ?? amount;
  const paid = paidRaw;
  const outstanding = raw.outstanding ?? raw.outstandingBalance ?? raw.Outstanding
    ?? raw['Outstanding Amount'] ?? raw.OneCRM__Amount_Outstanding__c ?? 0;
  const rawDate = raw.date ?? raw.paymentDate ?? raw.PaymentDate ?? raw['Income Date']
    ?? raw['Payment Date'] ?? raw.Date ?? raw.OneCRM__Date__c ?? '';
  const sortDate = typeof rawDate === 'string' ? rawDate : '';
  const date = typeof rawDate === 'string' && rawDate.includes('T')
    ? rawDate.split('T')[0]
    : rawDate;

  return {
    id: raw.id || raw.paymentId || raw['Record ID'] || raw.Id || `payment_${index}`,
    amount: formatMoneyField(amount) || formatMoneyField(paid) || formatMoneyField(total) || '',
    total: formatMoneyField(total) || formatMoneyField(amount),
    date,
    sortDate,
    outstanding: formatMoneyField(outstanding) || '$0.00',
    payer: raw.payer || raw.payerName || raw.parent || raw.accountName || raw['Payer / Parent'] || raw['Parent Account'] || raw['Related Contact'] || '',
    type: raw.type || raw.paymentType || raw.Type || raw['Payment Type'] || raw['Recognition Type'] || raw.OneCRM__Payment_Type__c || 'Payment',
    subType: raw.subType || raw.subtype || raw.subTypeName || raw['Sub-Type'] || raw['Sub Type'] || '',
    method: raw.method || raw.paymentMethod || raw['Payment Method'] || raw['Payment Plan'] || raw.OneCRM__Payment_Type__c
      || (parseMoneyValue(raw.OneCRM__Paid__c ?? raw['Paid Amount']) > 0 ? 'Cash' : ''),
    status: raw.status || raw.Status || raw['Processing Status'] || raw.OneCRM__Status__c || 'Paid',
  };
}

function normalizePledge(raw = {}, index = 0) {
  const amountValue = resolvePledgeAmount(raw);
  const total = raw.total ?? raw.Total ?? amountValue;
  const paid = raw.paid ?? raw.paidAmount ?? raw.Paid ?? raw.OneCRM__Paid__c ?? '';
  const outstanding = raw.outstanding ?? raw.Outstanding ?? raw.OneCRM__Amount_Outstanding__c ?? 0;
  const rawDate = raw.date ?? raw.pledgeDate ?? raw.Date ?? raw['Pledge Date'] ?? raw.OneCRM__Date__c ?? '';
  const date = typeof rawDate === 'string' && rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;

  return {
    id: raw.id || raw.Id || raw.pledgeId || raw['Record ID'] || `pledge_${index}`,
    amount: formatMoneyField(amountValue),
    outstanding: formatMoneyField(outstanding) || '$0.00',
    total: formatMoneyField(total) || formatMoneyField(amountValue),
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
  const rawAmount = raw.OneCRM__Amount_Per_Charge__c
    ?? raw.amount ?? raw.Amount ?? raw.OneCRM__Amount__c ?? raw.OneCRM__Total_Estimated_Revenue__c ?? '';

  return {
    id: raw.id || raw.Id || raw.recurringId || raw['Record ID'] || `recurring_${index}`,
    amount: formatMoneyField(rawAmount),
    frequency: raw.frequency || raw.schedule || raw.Schedule || raw.OneCRM__Schedule__c
      || raw.Frequency || raw.OneCRM__Frequency__c || 'Monthly',
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

  const contacts = extractAllContactsFromPayload(payload);
  const relationships = unwrapMakeArray(payload.relationships || payload.householdRelationships)
    .map(normalizeRelationship);
  const rawAllIncome = unwrapMakeArray(payload.payments || payload.incomePayments);
  const explicitPledges = unwrapMakeArray(payload.pledges || payload.incomePledges);
  const incomePledges = rawAllIncome.filter(isIncomePledgeRecord);
  const rawPledgeRecords = mergePledgeRecords(explicitPledges, incomePledges);
  const pledgeIdSet = new Set(
    rawPledgeRecords.map((record) => record.Id || record.id || record['Record ID']).filter(Boolean),
  );
  const rawPaymentRecords = rawAllIncome.filter((record) => {
    const id = record.Id || record.id || record['Record ID'] || '';
    if (id && pledgeIdSet.has(id)) return false;
    return !isIncomePledgeRecord(record);
  });

  const payments = filterNormalizedPayments(
    rawPaymentRecords
      .map(normalizePayment)
      .filter((normalized, index) => shouldIncludePaymentRecord(rawPaymentRecords[index], normalized)),
  );
  const pledges = filterNormalizedPledges(
    rawPledgeRecords
      .map(normalizePledge)
      .filter((normalized, index) => shouldIncludePledgeRecord(rawPledgeRecords[index], normalized)),
  );
  const rawRecurring = unwrapMakeArray(
    payload.recurring || payload.recurringBilling || payload.recurringPayments || payload.paymentPrograms,
  );
  const recurring = filterNormalizedRecurring(
    rawRecurring
      .map(normalizeRecurring)
      .filter((normalized, index) => shouldIncludeRecurringRecord(rawRecurring[index], normalized)),
  );
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
  const seenIds = new Set(remotePayments.map((item) => item.id).filter(Boolean));
  const seenKeys = new Set(remotePayments.map((item) => paymentDedupeKey(item)));

  for (const payment of localPayments) {
    if (payment.id && seenIds.has(payment.id)) continue;
    const method = String(payment.method || payment.type || '').toLowerCase();
    const isStripe = method.includes('stripe') || String(payment.id || '').includes('stripe');
    if (!isStripe) continue;
    const normalized = normalizePayment(payment, merged.length);
    const key = paymentDedupeKey(normalized);
    if (seenKeys.has(key)) continue;
    merged.unshift(normalized);
    seenKeys.add(key);
    if (normalized.id) seenIds.add(normalized.id);
  }

  return merged;
}

function normalizeSearchContact(raw = {}, index = 0) {
  const contactId = raw.contactId
    || raw['Contact ID']
    || raw.Id
    || raw.id
    || raw['Record ID']
    || '';
  const firstName = raw.firstName || raw.FirstName || raw['First Name'] || '';
  const lastName = raw.lastName || raw.LastName || raw['Last Name'] || '';
  const name = raw.name
    || raw['Full Name']
    || raw.Name
    || raw.fullName
    || [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    contactId,
    name,
    currentFamily: raw.currentFamily
      || raw['Primary Family']
      || raw.accountName
      || raw['Current Family']
      || raw['Account Name']
      || raw.Account?.Name
      || '',
    street: raw.street
      || raw['Mailing Street']
      || raw.primaryStreet
      || raw['Primary Street']
      || raw.MailingStreet
      || '',
    city: raw.city
      || raw['Mailing City']
      || raw.primaryCity
      || raw['Primary City']
      || raw.MailingCity
      || '',
    phone: raw.phone
      || raw.mobile
      || raw['Mobile Phone']
      || raw.MobilePhone
      || raw.Phone
      || '',
    email: raw.email || raw.Email || '',
  };
}

function isValidSearchContact(contact = {}) {
  if (contact.contactId?.startsWith('003')) return true;
  if (contact.email?.includes('@')) return true;
  return Boolean((contact.name || '').trim());
}

function memberDetailsToSearchContact(memberDetails = {}) {
  return {
    contactId: memberDetails.contactId || '',
    name: memberDetails.name
      || [memberDetails.firstName, memberDetails.lastName].filter(Boolean).join(' ').trim()
      || memberDetails.email?.split('@')[0]
      || '',
    currentFamily: memberDetails.accountName || memberDetails.profile?.accountName || '',
    street: memberDetails.street || '',
    city: memberDetails.city || '',
    phone: memberDetails.mobile || memberDetails.phone || memberDetails.homePhone || '',
    email: memberDetails.email || '',
  };
}

function extractSearchContactsFromPayload(payload) {
  if (!payload) return [];

  const list = unwrapMakeArray(
    payload.contacts
    || payload.searchResults
    || payload.results
    || payload.records
    || (Array.isArray(payload) ? payload : []),
  );

  return list
    .map(normalizeSearchContact)
    .filter(isValidSearchContact);
}

module.exports = {
  parseMakePayload,
  extractPortalDataFromPayload,
  extractAllContactsFromPayload,
  extractSearchContactsFromPayload,
  isValidSearchContact,
  memberDetailsToSearchContact,
  normalizeSearchContact,
  buildContactsFromMemberDetails,
  mergeContactsList,
  mergeHouseholdPortalData,
  mergePaymentsRemoteAndLocal,
  unwrapMakeArray,
  normalizeContact,
  normalizePayment,
  filterNormalizedPayments,
  parseMoneyValue,
  getPortalFiscalYearRange,
  formatPortalFiscalYearLabel,
};
