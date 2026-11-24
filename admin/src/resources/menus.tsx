import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import EditIcon from '@mui/icons-material/Edit';
import MenuIcon from '@mui/icons-material/Menu';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import {
  CreateButton,
  Create,
  Datagrid,
  DeleteWithConfirmButton,
  Edit,
  List,
  NumberField,
  RecordContextProvider,
  SelectInput,
  Show,
  SimpleForm,
  TextField,
  TextInput,
  required,
  useGetManyReference,
  useNotify,
  useRecordContext,
  type RaRecord,
  type ResourceProps,
} from 'react-admin';
import { Link } from 'react-router-dom';
import { move } from '../components/OrderedIdsInput';
import { adminActions } from '../providers/dataProvider';

const GROUPS = [
  { id: 'main', name: 'Main' },
  { id: 'list', name: 'Secondary list (dropdown)' },
];

interface MenuItemRecord extends RaRecord {
  menuId: string;
  title: string;
  link: string;
  group: 'main' | 'list';
  position: number;
}

/** One group of a menu's items: in order, with up/down, edit, delete. */
function MenuGroup({
  group,
  label,
}: {
  group: 'main' | 'list';
  label: string;
}) {
  const menu = useRecordContext();
  const notify = useNotify();
  const { data: items = [], refetch } = useGetManyReference<MenuItemRecord>(
    'menu-items',
    {
      target: 'menuId',
      id: menu?.id,
      filter: { group },
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'position', order: 'ASC' },
    },
    { enabled: !!menu },
  );
  if (!menu) return null;

  const reorder = async (from: number, step: -1 | 1) => {
    try {
      await adminActions.reorderMenuItems(
        menu.id,
        group,
        move(
          items.map((i) => i.id),
          from,
          step,
        ),
      );
    } catch (error) {
      notify((error as Error).message, { type: 'error' });
    }
    await refetch();
  };

  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1">{label}</Typography>
      {!items.length && (
        <Typography color="text.secondary">No items.</Typography>
      )}
      {items.map((item, index) => (
        <Box
          key={item.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.5,
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          <Typography sx={{ width: 28 }}>{index + 1}.</Typography>
          <Typography sx={{ width: 220 }}>{item.title}</Typography>
          <Typography sx={{ flex: 1 }} color="text.secondary">
            {item.link}
          </Typography>
          <IconButton
            size="small"
            aria-label="Move up"
            disabled={index === 0}
            onClick={() => void reorder(index, -1)}
          >
            <ArrowUpwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Move down"
            disabled={index === items.length - 1}
            onClick={() => void reorder(index, 1)}
          >
            <ArrowDownwardIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label="Edit"
            component={Link}
            to={`/menu-items/${item.id}`}
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <RecordContextProvider value={item}>
            <DeleteWithConfirmButton
              resource="menu-items"
              redirect={false}
              label=""
              mutationOptions={{ onSuccess: () => void refetch() }}
            />
          </RecordContextProvider>
        </Box>
      ))}
      <CreateButton
        resource="menu-items"
        label="Add item"
        state={{ record: { menuId: menu.id, group } }}
      />
    </Box>
  );
}

export const menus: ResourceProps = {
  name: 'menus',
  icon: MenuIcon,
  list: () => (
    <List
      pagination={false}
      exporter={false}
      sort={{ field: 'id', order: 'ASC' }}
    >
      <Datagrid rowClick="show" bulkActionButtons={false}>
        <TextField source="key" label="Menu" sortable={false} />
        <NumberField source="itemCount" label="Items" sortable={false} />
      </Datagrid>
    </List>
  ),
  show: () => (
    <Show actions={false}>
      <Box sx={{ p: 2 }}>
        <TextField source="key" variant="h6" />
        <MenuGroup group="main" label="Main" />
        <MenuGroup group="list" label="Secondary list (dropdown only)" />
      </Box>
    </Show>
  ),
  recordRepresentation: 'key',
};

const backToMenu = (
  _resource?: string,
  _id?: unknown,
  data?: Partial<RaRecord>,
) => (data?.menuId ? `menus/${String(data.menuId)}/show` : 'menus');

const ItemFields = () => (
  <>
    <TextInput source="title" validate={required()} />
    <TextInput
      source="link"
      validate={required()}
      helperText="/simple-menu, #contacts or https://…"
    />
    <TextInput
      source="className"
      label="CSS class"
      helperText="Optional, e.g. an icon class"
    />
  </>
);

export const menuItems: ResourceProps = {
  name: 'menu-items',
  edit: () => (
    <Edit mutationMode="pessimistic" redirect={backToMenu}>
      <SimpleForm>
        <ItemFields />
        <SelectInput source="group" choices={GROUPS} validate={required()} />
      </SimpleForm>
    </Edit>
  ),
  create: () => (
    <Create redirect={backToMenu}>
      <SimpleForm>
        <ItemFields />
        <SelectInput source="group" choices={GROUPS} defaultValue="main" />
      </SimpleForm>
    </Create>
  ),
};
