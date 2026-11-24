import MailIcon from '@mui/icons-material/Mail';
import Box from '@mui/material/Box';
import {
  BooleanField,
  Button,
  Datagrid,
  DateField,
  DeleteWithConfirmButton,
  EmailField,
  FunctionField,
  List,
  SearchInput,
  SelectInput,
  Show,
  SimpleShowLayout,
  TextField,
  TopToolbar,
  useCanAccess,
  useRecordContext,
  useUpdate,
  type RaRecord,
  type ResourceProps,
} from 'react-admin';

const YES_NO = [
  { id: 'true', name: 'Handled' },
  { id: 'false', name: 'New' },
];

function MessageActions() {
  const message = useRecordContext<RaRecord & { handled: boolean }>();
  const [update, { isPending }] = useUpdate();
  const { canAccess: canDelete } = useCanAccess({
    resource: 'contact-messages',
    action: 'delete',
  });
  if (!message) return null;
  return (
    <TopToolbar>
      <Button
        label={message.handled ? 'Mark as new' : 'Mark handled'}
        disabled={isPending}
        variant="contained"
        onClick={() =>
          void update('contact-messages', {
            id: message.id,
            data: { handled: !message.handled },
            previousData: message,
          })
        }
      />
      {canDelete && (
        <DeleteWithConfirmButton confirmTitle="Delete this message?" />
      )}
    </TopToolbar>
  );
}

export const contactMessages: ResourceProps = {
  name: 'contact-messages',
  icon: MailIcon,
  options: { label: 'Messages' },
  list: () => (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filterDefaultValues={{ handled: 'false' }}
      filters={[
        <SearchInput key="q" source="q" alwaysOn />,
        <SelectInput key="h" source="handled" choices={YES_NO} />,
      ]}
      exporter={false}
    >
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <DateField source="createdAt" label="Received" showTime />
        <TextField source="name" />
        <EmailField source="email" sortable={false} />
        <FunctionField
          label="Message"
          render={(m: { message: string }) =>
            m.message.length > 80 ? `${m.message.slice(0, 80)}…` : m.message
          }
        />
        <BooleanField source="handled" sortable={false} />
      </Datagrid>
    </List>
  ),
  show: () => (
    <Show actions={<MessageActions />}>
      <SimpleShowLayout>
        <DateField source="createdAt" label="Received" showTime />
        <TextField source="name" />
        <EmailField source="email" />
        <FunctionField
          label="Message"
          render={(m: { message: string }) => (
            <Box sx={{ whiteSpace: 'pre-line' }}>{m.message}</Box>
          )}
        />
        <DateField
          source="handledAt"
          label="Handled"
          showTime
          emptyText="Not yet"
        />
      </SimpleShowLayout>
    </Show>
  ),
};
