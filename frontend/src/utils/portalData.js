export function getInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?';
}

export function parseMoney(value) {
  if (value == null || value === '') return 0;
  const normalized = String(value).replace(/[^0-9.-]/g, '');
  const amount = parseFloat(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

export function formatDisplayDate(value) {
  const normalized = (value ?? '').toString().trim();
  if (!normalized) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    const [year, month, day] = normalized.slice(0, 10).split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  return normalized;
}

export function getAccount(sfData) {
  const profile = sfData?.profile || {};
  return {
    id: sfData?.accountId || sfData?.account?.id || '',
    name: sfData?.account?.name || profile.accountName || sfData?.name || 'Household',
    phone: sfData?.account?.phone || profile.phone || profile.mobile || '',
    email: sfData?.account?.email || sfData?.email || '',
    street: sfData?.account?.street || profile.street || '',
    city: sfData?.account?.city || profile.city || '',
    state: sfData?.account?.state || profile.state || '',
    postalCode: sfData?.account?.postalCode || profile.postalCode || '',
    country: sfData?.account?.country || profile.country || '',
  };
}

export function getContacts(sfData) {
  if (sfData?.contacts?.length) {
    return sfData.contacts.map((contact) => ({
      ...contact,
      isPrimary: Boolean(contact.isPrimary),
      isSecondary: Boolean(contact.isSecondary),
      role: normalizeContactRole(contact.role),
    }));
  }
  if (sfData?.name) {
    return [{
      id: sfData.contactId || 'primary',
      name: sfData.name,
      role: normalizeContactRole(sfData.role || 'Member'),
      isPrimary: true,
      isSecondary: false,
      contactId: sfData.contactId,
      email: sfData.email,
      phone: sfData.profile?.phone || sfData.profile?.mobile,
    }];
  }
  return [];
}

function normalizeContactRole(role = '') {
  const value = role.trim();
  if (!value) return 'Member';
  if (/primary member/i.test(value)) return 'Parent';
  if (/secondary member/i.test(value)) return 'Parent';
  if (/spouse/i.test(value)) return 'Parent';
  if (/child/i.test(value)) return 'Child';
  return value;
}

export function getRelationships(sfData) {
  return sfData?.relationships || [];
}

export function getPayments(sfData) {
  const payments = sfData?.financials?.payments || [];
  return filterDisplayPayments(payments);
}

function paymentDisplayKey(payment = {}) {
  const amount = parseMoney(payment.amount) || parseMoney(payment.total);
  const method = String(payment.method || payment.type || '').trim().toLowerCase();
  const date = String(payment.date || '').slice(0, 10);
  return `${date}|${amount.toFixed(2)}|${method}`;
}

function filterDisplayPayments(payments = []) {
  const seen = new Set();
  return payments
    .filter((payment) => {
      const amount = parseMoney(payment.amount) || parseMoney(payment.total);
      if (amount <= 0) return false;
      const method = String(payment.method || payment.type || '').trim().toLowerCase();
      if (method !== 'cash' && !method.includes('stripe')) return false;
      const key = paymentDisplayKey(payment);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export function sumPaymentsTotal(payments = []) {
  return payments.reduce((sum, item) => sum + parseMoney(item.amount || item.total), 0);
}

export function sumPaymentsYtd(payments = [], year = new Date().getFullYear()) {
  return payments.reduce((sum, item) => {
    if (!item.date) return sum + parseMoney(item.amount || item.total);
    const paymentYear = new Date(item.date).getFullYear();
    if (paymentYear !== year) return sum;
    return sum + parseMoney(item.amount || item.total);
  }, 0);
}

export function getPledges(sfData) {
  const pledges = sfData?.financials?.pledges || [];
  return pledges.filter((item) => parseMoney(item.amount || item.total) > 0);
}

export function getRecurring(sfData) {
  const recurring = sfData?.financials?.recurring || [];
  return recurring.filter((item) => parseMoney(item.amount) > 0);
}

export function getMembership(sfData) {
  const membership = sfData?.membership || {};
  const pledges = getPledges(sfData);
  const recurring = getRecurring(sfData);
  const activeRecurring = recurring.find((item) => (item.status || '').toLowerCase() === 'active') || recurring[0];
  const annualCommitment = parseMoney(membership.annualCommitment)
    || pledges.reduce((sum, item) => sum + parseMoney(item.total || item.amount), 0);
  const contributed = parseMoney(membership.contributedYtd)
    || pledges.reduce((sum, item) => sum + parseMoney(item.paid || item.amount), 0);

  return {
    tier: membership.tier || 'Member',
    status: membership.status || 'Active',
    memberSince: membership.memberSince || sfData?.joinedDate || '',
    renewalDate: membership.renewalDate || activeRecurring?.nextDate || '',
    annualCommitment: membership.annualCommitment || (annualCommitment ? formatMoney(annualCommitment) : '$0.00'),
    contributedYtd: membership.contributedYtd || formatMoney(contributed),
    outstanding: membership.outstanding || formatMoney(Math.max(annualCommitment - contributed, 0)),
    autoRenewal: membership.autoRenewal || (activeRecurring ? 'Enabled' : 'Disabled'),
    paymentMethod: membership.paymentMethod || activeRecurring?.method || '—',
    paymentMethodExpiry: membership.paymentMethodExpiry || activeRecurring?.cardExpiry || '',
    notes: membership.notes || '',
  };
}

export function getFinancialSummary(sfData) {
  const membership = getMembership(sfData);
  const payments = getPayments(sfData);
  const totalContributed = sumPaymentsTotal(payments);
  const contributedYtd = sumPaymentsYtd(payments) || parseMoney(membership.contributedYtd);
  const annual = parseMoney(membership.annualCommitment);
  const contributed = contributedYtd || totalContributed || parseMoney(membership.contributedYtd);
  const outstanding = Math.max(annual - contributed, 0);
  const pct = annual > 0 ? Math.round((contributed / annual) * 100) : 0;

  return {
    ...membership,
    totalContributed,
    contributedYtd: formatMoney(contributedYtd || contributed),
    paymentCount: payments.length,
    annual,
    contributed,
    outstanding,
    progressPct: Math.min(pct, 100),
  };
}

export function formatAddress(account) {
  const parts = [
    account.street,
    [account.city, account.state, account.postalCode].filter(Boolean).join(', '),
    account.country,
  ].filter(Boolean);
  return parts.join(', ') || '—';
}
