export function normalizeFamilyLabel(value = '') {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function getHouseholdParentCapacity(household = {}) {
  const primaryContact = household.primaryContact || null;
  const secondaryContact = household.secondaryContact || null;

  return {
    hasPrimary: Boolean(primaryContact),
    hasSecondary: Boolean(secondaryContact),
    canAddPrimary: !primaryContact,
    canAddSecondary: !secondaryContact,
    parentsFull: Boolean(primaryContact && secondaryContact),
  };
}

export function isContactLinkedToAnotherHousehold(contact = {}, accountName = '') {
  const currentFamily = normalizeFamilyLabel(contact.currentFamily);
  if (!currentFamily) return false;

  const normalizedAccount = normalizeFamilyLabel(accountName);
  if (!normalizedAccount) return true;

  return currentFamily !== normalizedAccount;
}

export function validateMemberTypeForAccount(memberType, household = {}) {
  const capacity = getHouseholdParentCapacity(household);

  if (memberType === 'primary' && !capacity.canAddPrimary) {
    return {
      ok: false,
      message: 'This household already has a Primary (Parent). You can only add a Child.',
    };
  }

  if (memberType === 'secondary' && !capacity.canAddSecondary) {
    return {
      ok: false,
      message: 'This household already has a Secondary (Parent). You can only add a Child.',
    };
  }

  if ((memberType === 'primary' || memberType === 'secondary') && capacity.parentsFull) {
    return {
      ok: false,
      message: 'Both parent slots are already filled on this account. You can only add a Child.',
    };
  }

  return { ok: true };
}

export function validateContactForParentRole(contact = {}, memberType, accountName = '') {
  if (memberType !== 'primary' && memberType !== 'secondary') {
    return { ok: true };
  }

  if (!isContactLinkedToAnotherHousehold(contact, accountName)) {
    return { ok: true };
  }

  const label = contact.name || 'This contact';
  const family = contact.currentFamily || 'another household';
  return {
    ok: false,
    message: `${label} is already part of "${family}" and cannot be added as a parent on this account.`,
  };
}

export function validateAddFamilyMemberRequest({
  memberType,
  household = {},
  contacts = [],
  accountName = '',
}) {
  const accountCheck = validateMemberTypeForAccount(memberType, household);
  if (!accountCheck.ok) return accountCheck;

  if (memberType === 'primary' || memberType === 'secondary') {
    for (const contact of contacts) {
      const contactCheck = validateContactForParentRole(contact, memberType, accountName);
      if (!contactCheck.ok) return contactCheck;
    }
  }

  return { ok: true };
}

export function getMemberTypeAvailability(household = {}, selectedContacts = [], accountName = '') {
  const capacity = getHouseholdParentCapacity(household);
  const blockedParentElsewhere = (memberType) => (
    memberType === 'primary' || memberType === 'secondary'
  ) && selectedContacts.some((contact) => isContactLinkedToAnotherHousehold(contact, accountName));

  return {
    primary: {
      enabled: capacity.canAddPrimary && !blockedParentElsewhere('primary'),
      reason: !capacity.canAddPrimary
        ? 'Primary parent is already set on this account.'
        : blockedParentElsewhere('primary')
          ? 'Selected contact already belongs to another household.'
          : '',
    },
    secondary: {
      enabled: capacity.canAddSecondary && !blockedParentElsewhere('secondary'),
      reason: !capacity.canAddSecondary
        ? 'Secondary parent is already set on this account.'
        : blockedParentElsewhere('secondary')
          ? 'Selected contact already belongs to another household.'
          : '',
    },
    child: {
      enabled: true,
      reason: '',
    },
  };
}
