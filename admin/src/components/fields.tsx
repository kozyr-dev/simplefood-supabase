import Chip from '@mui/material/Chip';
import { DateTimeInput, useRecordContext } from 'react-admin';

const STATE_COLORS = {
  draft: 'default',
  scheduled: 'warning',
  published: 'success',
} as const;

/** A page or post: draft, scheduled or published. */
export function PublishStateField(_props: {
  label?: string;
  sortable?: boolean;
}) {
  const record = useRecordContext();
  const state = record?.state as keyof typeof STATE_COLORS | undefined;
  return state ? (
    <Chip size="small" label={state} color={STATE_COLORS[state]} />
  ) : null;
}

const ORDER_COLORS = {
  new: 'info',
  processing: 'warning',
  completed: 'success',
  declined: 'default',
} as const;

export function OrderStatusField(_props: {
  label?: string;
  sortable?: boolean;
}) {
  const record = useRecordContext();
  const status = record?.status as keyof typeof ORDER_COLORS | undefined;
  return status ? (
    <Chip size="small" label={status} color={ORDER_COLORS[status]} />
  ) : null;
}

/**
 * The publish date, kept as a Date: the browser's time zone (Kyiv) goes
 * with it, instead of a bare "2026-11-11T10:00" the server would read as
 * its own (UTC) time.
 */
const toDate = (value: string) =>
  value ? new Date(value) : value === '' ? null : value;

export function PublishedAtInput() {
  return (
    <DateTimeInput
      source="publishedAt"
      label="Published at"
      parse={toDate}
      helperText="Empty: a draft. A future time: published then."
    />
  );
}
