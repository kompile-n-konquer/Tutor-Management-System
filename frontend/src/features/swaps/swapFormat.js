// Shared formatting helpers and status styling for the session swap pages.
import { DAYS, minutesToLabel } from '../../components/slot-grid/SlotGrid';

export const formatSessionDate = (isoString) => new Date(isoString).toLocaleDateString();

// "Mon 08:00-09:30" — same compact slot label the applications page uses
export const formatSlot = (slot) =>
  `${DAYS[slot.dayOfWeek]} ${minutesToLabel(slot.startMinute)}-${minutesToLabel(slot.endMinute)}`;

export const SWAP_STATUS_BADGES = {
  PENDING: 'bg-trust-blue/10 text-trust-blue',
  ACCEPTED: 'bg-secondary-fixed text-on-secondary-fixed',
  APPROVED: 'bg-primary/10 text-primary',
  REJECTED: 'bg-error/10 text-error',
  CANCELLED: 'bg-surface-variant text-on-surface-variant',
};

export const SWAP_STATUS_LABELS = {
  PENDING: 'Awaiting partner',
  ACCEPTED: 'Awaiting organiser',
  APPROVED: 'Approved',
  REJECTED: 'Declined / rejected',
  CANCELLED: 'Cancelled',
};

export const swapStatusBadge = (status) => SWAP_STATUS_BADGES[status] || SWAP_STATUS_BADGES.CANCELLED;
export const swapStatusLabel = (status) => SWAP_STATUS_LABELS[status] || status;
