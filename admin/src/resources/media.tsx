import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import {
  Create,
  Datagrid,
  DateField,
  Edit,
  FileField,
  FileInput,
  FunctionField,
  List,
  SearchInput,
  SimpleForm,
  TextField,
  TextInput,
  required,
  useRecordContext,
  type ResourceProps,
} from 'react-admin';
import { Thumbnail, type MediaRecord } from '../components/media';

const FOLDER_HELP =
  'Optional, e.g. "products": lower-case letters, digits, hyphens';
const kilobytes = (record: { size: number }) =>
  `${Math.round(record.size / 1024)} KB`;

const Preview = () => {
  const record = useRecordContext<MediaRecord>();
  return <Thumbnail media={record} size={240} />;
};

export const media: ResourceProps = {
  name: 'media',
  icon: PhotoLibraryIcon,
  options: { label: 'Images' },
  list: () => (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filters={[
        <SearchInput key="q" source="q" alwaysOn />,
        <TextInput key="f" source="folder" />,
      ]}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <FunctionField
          label=""
          render={(record: MediaRecord) => (
            <Thumbnail media={record} size={48} />
          )}
        />
        <TextField source="name" />
        <TextField source="folder" />
        <FunctionField label="Size" source="size" render={kilobytes} />
        <DateField source="createdAt" label="Uploaded" />
      </Datagrid>
    </List>
  ),
  create: () => (
    <Create redirect="list">
      <SimpleForm>
        <FileInput
          source="file"
          accept={{ 'image/*': ['.jpg', '.jpeg', '.png', '.webp'] }}
          validate={required()}
          maxSize={10 * 1024 * 1024}
          helperText="JPEG, PNG or WebP, up to 10 MB; stored upright, without its location data"
        >
          <FileField source="src" title="title" />
        </FileInput>
        <TextInput
          source="alt"
          label="Alternative text"
          helperText="What the image shows, for screen readers"
        />
        <TextInput source="folder" helperText={FOLDER_HELP} />
      </SimpleForm>
    </Create>
  ),
  edit: () => (
    <Edit mutationMode="pessimistic">
      <SimpleForm>
        <Preview />
        <TextField source="name" />
        <TextInput source="alt" label="Alternative text" />
        <TextInput source="folder" helperText={FOLDER_HELP} />
      </SimpleForm>
    </Edit>
  ),
  recordRepresentation: 'name',
};
