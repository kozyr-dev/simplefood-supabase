import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import Box from '@mui/material/Box';
import { useState } from 'react';
import {
  ArrayField,
  Button,
  Confirm,
  Datagrid,
  DateField,
  DateInput,
  FunctionField,
  List,
  NumberField,
  ReferenceField,
  SearchInput,
  SelectInput,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useNotify,
  useRecordContext,
  useRefresh,
  type RaRecord,
  type ResourceProps,
} from 'react-admin';
import { OrderStatusField } from '../components/fields';
import { MoneyField } from '../components/money';
import { adminActions } from '../providers/dataProvider';

const STATUSES = [
  { id: 'new', name: 'New' },
  { id: 'processing', name: 'Processing' },
  { id: 'completed', name: 'Completed' },
  { id: 'declined', name: 'Declined' },
];

/** What the button for moving to each status says. */
const ACTION_LABELS: Record<string, string> = {
  processing: 'Start processing',
  completed: 'Complete',
  declined: 'Decline',
};

/** The moves the API allows from the order's status, as buttons. */
function StatusActions() {
  const order = useRecordContext<
    RaRecord & { nextStatuses: string[]; number: number }
  >();
  const notify = useNotify();
  const refresh = useRefresh();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!order) return null;

  const change = async (status: string) => {
    setBusy(true);
    try {
      await adminActions.changeOrderStatus(order.id, status);
      notify(`Order ${order.number}: ${status}`, { type: 'success' });
    } catch (error) {
      notify((error as Error).message, { type: 'error' });
    } finally {
      setBusy(false);
      setConfirming(null);
      refresh();
    }
  };

  return (
    <TopToolbar>
      {order.nextStatuses.map((status) => (
        <Button
          key={status}
          label={ACTION_LABELS[status] ?? status}
          disabled={busy}
          variant={status === 'declined' ? 'outlined' : 'contained'}
          color={status === 'declined' ? 'error' : 'primary'}
          onClick={() =>
            status === 'declined' ? setConfirming(status) : void change(status)
          }
        />
      ))}
      <Confirm
        isOpen={confirming !== null}
        title={`Decline order ${order.number}?`}
        content="A declined order can't be reopened."
        onConfirm={() => void change(confirming as string)}
        onClose={() => setConfirming(null)}
      />
    </TopToolbar>
  );
}

/** The lines, when there are any (imported orders have only their old text). */
function OrderItems(_props: { label?: string }) {
  const order = useRecordContext<RaRecord & { items: unknown[] }>();
  if (!order?.items.length) return null;
  return (
    <ArrayField source="items">
      <Datagrid bulkActionButtons={false} rowClick={false}>
        <TextField source="title" />
        <MoneyField source="unitPrice" label="Price" />
        <NumberField source="quantity" />
        <MoneyField source="lineTotal" label="Line total" />
      </Datagrid>
    </ArrayField>
  );
}

const orderFilters = [
  <SearchInput
    key="q"
    source="q"
    alwaysOn
    placeholder="Number, name, phone, email"
  />,
  <SelectInput key="s" source="status" choices={STATUSES} />,
  <DateInput key="f" source="from" label="Placed from" />,
  <DateInput key="t" source="to" label="Placed before" />,
];

export const orders: ResourceProps = {
  name: 'orders',
  icon: ShoppingCartIcon,
  list: () => (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filters={orderFilters}
      exporter={false}
    >
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <NumberField source="number" label="№" />
        <DateField source="createdAt" label="Placed" showTime />
        <OrderStatusField label="Status" sortable={false} />
        <TextField source="name" sortable={false} />
        <TextField source="phone" sortable={false} />
        <TextField source="shippingMethod" label="Shipping" sortable={false} />
        <MoneyField source="subtotal" label="Total" />
        <NumberField source="itemCount" label="Items" sortable={false} />
      </Datagrid>
    </List>
  ),
  show: () => (
    <Show actions={<StatusActions />}>
      <SimpleShowLayout>
        <NumberField source="number" label="Order №" />
        <OrderStatusField label="Status" />
        <DateField source="createdAt" label="Placed" showTime />
        <TextField source="name" />
        <TextField source="phone" />
        <TextField source="email" />
        <TextField source="shippingMethod" label="Shipping" />
        <TextField source="address" emptyText="—" />
        <TextField source="comments" emptyText="—" />
        <ReferenceField
          source="userId"
          reference="users"
          label="Account"
          emptyText="Guest"
          link={false}
        >
          <TextField source="name" />
        </ReferenceField>
        <OrderItems label="Items" />
        <FunctionField
          label="Dishes (imported from the old site)"
          render={(order: { legacyItemsText: string | null }) =>
            order.legacyItemsText ? (
              <Box sx={{ whiteSpace: 'pre-line' }}>{order.legacyItemsText}</Box>
            ) : null
          }
        />
        <MoneyField source="subtotal" label="Total" />
      </SimpleShowLayout>
    </Show>
  ),
  recordRepresentation: (order) => `№${order.number}`,
};
