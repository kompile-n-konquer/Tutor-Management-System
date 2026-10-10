// Status styling for the directed cover-offer pages. One cover request moves
// through OFFERED (the nominee decides) → PENDING (the lecturer decides) →
// APPROVED, with REJECTED (nominee declined) and CANCELLED (excuser withdrew)
// as the closed outcomes.
export const COVER_STATUS_BADGES = {
  OFFERED: 'bg-trust-blue/10 text-trust-blue',
  PENDING: 'bg-secondary-fixed text-on-secondary-container',
  APPROVED: 'bg-primary/10 text-primary',
  REJECTED: 'bg-error/10 text-error',
  CANCELLED: 'bg-surface-variant text-on-surface-variant',
};

export const COVER_STATUS_LABELS = {
  OFFERED: 'Awaiting nominee',
  PENDING: 'Awaiting lecturer',
  APPROVED: 'Approved',
  REJECTED: 'Declined',
  CANCELLED: 'Withdrawn',
};

export const coverStatusBadge = (status) =>
  COVER_STATUS_BADGES[status] || COVER_STATUS_BADGES.CANCELLED;
export const coverStatusLabel = (status) => COVER_STATUS_LABELS[status] || status;
