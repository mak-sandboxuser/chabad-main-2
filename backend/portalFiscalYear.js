/** Portal payment window: Sep 1 through Aug 31 (resets each September). */
const FISCAL_START_MONTH = 9;
const FISCAL_START_DAY = 1;
const FISCAL_END_MONTH = 8;
const FISCAL_END_DAY = 31;

function toYmd(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(normalized)) return normalized.slice(0, 10);

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) return '';
  return toYmd(new Date(parsed));
}

function getPortalFiscalYearRange(referenceDate = new Date()) {
  const refYmd = toYmd(referenceDate) || toYmd(new Date());
  const [year, month] = refYmd.split('-').map(Number);
  const startYear = month >= FISCAL_START_MONTH ? year : year - 1;
  const endYear = startYear + 1;

  return {
    startDate: `${startYear}-09-01`,
    endDate: `${endYear}-08-31`,
    startYear,
    endYear,
  };
}

function isDateInPortalFiscalYear(date, referenceDate = new Date()) {
  const ymd = toYmd(date);
  if (!ymd) return false;
  const { startDate, endDate } = getPortalFiscalYearRange(referenceDate);
  return ymd >= startDate && ymd <= endDate;
}

function formatPortalFiscalYearLabel(range = getPortalFiscalYearRange()) {
  const format = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return `${format(range.startDate)} – ${format(range.endDate)}`;
}

module.exports = {
  getPortalFiscalYearRange,
  isDateInPortalFiscalYear,
  formatPortalFiscalYearLabel,
  toYmd,
};
