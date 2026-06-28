export const ADDITIONAL_FIELD_KEYS = ['birthdate', 'age', 'gender'];

export const ADDITIONAL_FIELD_LABELS = {
  birthdate: 'Birthdate',
  age: 'Age',
  gender: 'Gender',
};

export const LIFECYCLE_FIELD_KEYS = [
  'hebrewName',
  'fathersHebrewName',
  'mothersHebrewName',
  'jewish',
  'hebrewBirthdate',
  'nextHebrewBirthday',
  'weddingDate',
  'lifecycleStatus',
];

export const LIFECYCLE_FIELD_LABELS = {
  hebrewName: 'Hebrew Name',
  fathersHebrewName: "Father's Hebrew Name",
  mothersHebrewName: "Mother's Hebrew Name",
  jewish: 'Jewish',
  hebrewBirthdate: 'Birthdate (Hebrew)',
  nextHebrewBirthday: 'Civil Date of Next Hebrew Birthday',
  weddingDate: 'Wedding Date',
  lifecycleStatus: 'Status',
};

export const EMPTY_PROFILE_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  homePhone: '',
  street: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
  nickname: '',
  title: '',
  hebrewName: '',
  fathersHebrewName: '',
  mothersHebrewName: '',
  jewish: '',
  hebrewBirthdate: '',
  nextHebrewBirthday: '',
  weddingDate: '',
  lifecycleStatus: '',
  birthdate: '',
  age: '',
  gender: '',
};

function readLifecycleValues(sfData) {
  const profile = sfData?.profile || {};
  const lifecycle = profile.lifecycle || {};
  const additional = profile.additional || {};
  const values = {};

  for (const key of LIFECYCLE_FIELD_KEYS) {
    values[key] = lifecycle[key] || profile[key] || sfData?.[key] || '';
  }

  for (const key of ADDITIONAL_FIELD_KEYS) {
    values[key] = additional[key] || profile[key] || sfData?.[key] || '';
  }

  for (const dateKey of ['nextHebrewBirthday', 'weddingDate', 'birthdate']) {
    if (values[dateKey]) {
      values[dateKey] = toDateInputValue(values[dateKey]);
    }
  }

  return values;
}

function toDateInputValue(value) {
  const normalized = (value ?? '').toString().trim();
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 10);
  return normalized;
}

export function sfDataToProfileForm(sfData, email = '') {
  if (!sfData) return { ...EMPTY_PROFILE_FORM };

  const firstName = sfData.firstName || sfData.name?.split(/\s+/)[0] || '';
  const lastName = sfData.lastName || sfData.name?.split(/\s+/).slice(1).join(' ') || '';
  const profile = sfData.profile || {};

  return {
    firstName,
    lastName,
    phone: profile.phone || profile.mobile || sfData.mobile || sfData.phone || '',
    homePhone: profile.homePhone || sfData.homePhone || '',
    street: profile.street || profile.primaryStreet || sfData.street || '',
    city: profile.city || profile.primaryCity || sfData.city || '',
    state: profile.state || profile.primaryState || sfData.state || '',
    postalCode: profile.postalCode || profile.primaryPostalCode || sfData.postalCode || '',
    country: profile.country || profile.primaryCountry || sfData.country || '',
    nickname: profile.nickname || sfData.nickname || '',
    title: profile.title || sfData.title || '',
    email: sfData.email || email,
    ...readLifecycleValues(sfData),
  };
}

export function profileFormToPayload(form) {
  const payload = {
    firstName: form.firstName?.trim() || '',
    lastName: form.lastName?.trim() || '',
    phone: form.phone?.trim() || '',
    homePhone: form.homePhone?.trim() || '',
    street: form.street?.trim() || '',
    city: form.city?.trim() || '',
    state: form.state?.trim() || '',
    postalCode: form.postalCode?.trim() || '',
    country: form.country?.trim() || '',
    nickname: form.nickname?.trim() || '',
    title: form.title?.trim() || '',
  };

  for (const key of LIFECYCLE_FIELD_KEYS) {
    payload[key] = form[key]?.trim() || '';
  }

  for (const key of ADDITIONAL_FIELD_KEYS) {
    payload[key] = form[key]?.trim() || '';
  }

  return payload;
}

export function displayValue(value, fallback = '—') {
  const normalized = (value ?? '').toString().trim();
  return normalized || fallback;
}

export function formatProfileDate(value) {
  const normalized = (value ?? '').toString().trim();
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) {
    const datePart = normalized.slice(0, 10);
    const [year, month, day] = datePart.split('-').map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  }
  return normalized;
}

export function formatProfileDisplayValue(key, value) {
  if (key === 'birthdate' || key === 'nextHebrewBirthday' || key === 'weddingDate') {
    return formatProfileDate(value) || '—';
  }
  return displayValue(value);
}
