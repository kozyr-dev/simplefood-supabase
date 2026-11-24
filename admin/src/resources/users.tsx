import PeopleIcon from '@mui/icons-material/People';
import Alert from '@mui/material/Alert';
import {
  BooleanField,
  BooleanInput,
  Button,
  Datagrid,
  DateField,
  Edit,
  EmailField,
  Labeled,
  List,
  SaveButton,
  SearchInput,
  SelectInput,
  SimpleForm,
  TextField,
  Toolbar,
  TopToolbar,
  useNotify,
  useRecordContext,
  type ResourceProps,
} from 'react-admin';
import { adminActions } from '../providers/dataProvider';

const ROLES = [
  { id: 'customer', name: 'Customer' },
  { id: 'editor', name: 'Editor' },
  { id: 'admin', name: 'Admin' },
];

function SendPasswordReset() {
  const user = useRecordContext();
  const notify = useNotify();
  if (!user) return null;
  return (
    <TopToolbar>
      <Button
        label="Email a password-reset link"
        onClick={() =>
          adminActions
            .sendPasswordReset(user.id)
            .then(() => notify('The link is on its way', { type: 'success' }))
            .catch((error: Error) => notify(error.message, { type: 'error' }))
        }
      />
    </TopToolbar>
  );
}

export const users: ResourceProps = {
  name: 'users',
  icon: PeopleIcon,
  options: { label: 'Accounts' },
  list: () => (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filters={[
        <SearchInput key="q" source="q" alwaysOn />,
        <SelectInput key="r" source="role" choices={ROLES} />,
        <SelectInput
          key="b"
          source="blocked"
          choices={[
            { id: 'true', name: 'Blocked' },
            { id: 'false', name: 'Active' },
          ]}
        />,
      ]}
      exporter={false}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" />
        <EmailField source="email" />
        <TextField source="role" />
        <BooleanField source="blocked" sortable={false} />
        <BooleanField
          source="emailVerified"
          label="Verified"
          sortable={false}
        />
        <DateField source="createdAt" label="Since" />
      </Datagrid>
    </List>
  ),
  edit: () => (
    <Edit
      mutationMode="pessimistic"
      actions={<SendPasswordReset />}
      redirect="list"
    >
      <SimpleForm
        toolbar={
          <Toolbar>
            <SaveButton />
          </Toolbar>
        }
      >
        <Labeled>
          <TextField source="name" />
        </Labeled>
        <Labeled>
          <EmailField source="email" />
        </Labeled>
        <Labeled>
          <TextField source="phone" emptyText="—" />
        </Labeled>
        <SelectInput source="role" choices={ROLES} />
        <BooleanInput source="blocked" />
        <Alert severity="info">
          Blocking or changing the role ends every session of the account. A
          sign-in already open keeps working for up to 15 minutes.
        </Alert>
      </SimpleForm>
    </Edit>
  ),
  recordRepresentation: 'name',
};
