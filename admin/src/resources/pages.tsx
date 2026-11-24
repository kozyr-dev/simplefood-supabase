import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DescriptionIcon from '@mui/icons-material/Description';
import EditIcon from '@mui/icons-material/Edit';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FormControlLabel from '@mui/material/FormControlLabel';
import Switch from '@mui/material/Switch';
import { useState } from 'react';
import {
  Button,
  Create,
  Datagrid,
  DateField,
  DeleteWithConfirmButton,
  Edit,
  Labeled,
  List,
  NumberField,
  RecordContextProvider,
  SaveButton,
  SearchInput,
  SelectInput,
  SimpleForm,
  TextField as RaTextField,
  TextInput,
  Toolbar,
  required,
  useGetManyReference,
  useNotify,
  useRecordContext,
  type RaRecord,
  type ResourceProps,
} from 'react-admin';
import { useWatch } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { PublishStateField, PublishedAtInput } from '../components/fields';
import { Thumbnail } from '../components/media';
import { move } from '../components/OrderedIdsInput';
import { SeoInputs } from '../components/SeoInputs';
import {
  SECTION_LABELS,
  SECTION_TYPES,
  emptySectionData,
  sectionDataToSave,
  type SectionType,
} from '../lib/sections';
import { adminActions } from '../providers/dataProvider';
import { PUBLISH_STATES } from './blog';
import { JsonDataInput } from '../sections/JsonDataInput';
import { SectionDataForm } from '../sections/SectionForms';

const HOME = 'home';

interface SectionRecord extends RaRecord {
  pageId: string;
  type: SectionType;
  data: Record<string, unknown>;
  position: number;
  references?: Record<
    string,
    { id: string; label: string; thumbnailUrl?: string }[]
  >;
}

/** The page's sections, in order: move, edit, delete, add. */
function PageSections() {
  const page = useRecordContext();
  const navigate = useNavigate();
  const notify = useNotify();
  const [adding, setAdding] = useState<SectionType | ''>('');
  const {
    data: sections = [],
    refetch,
    isPending,
  } = useGetManyReference<SectionRecord>(
    'page-sections',
    {
      target: 'pageId',
      id: page?.id,
      pagination: { page: 1, perPage: 100 },
      sort: { field: 'position', order: 'ASC' },
    },
    { enabled: !!page },
  );
  if (!page) return null;

  const reorder = async (from: number, step: -1 | 1) => {
    const ids = move(
      sections.map((s) => s.id),
      from,
      step,
    );
    try {
      await adminActions.reorderSections(page.id, ids);
    } catch (error) {
      notify((error as Error).message, { type: 'error' });
    }
    await refetch();
  };

  return (
    <Card variant="outlined" sx={{ m: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Sections
        </Typography>
        {!isPending && !sections.length && (
          <Typography color="text.secondary">No sections yet.</Typography>
        )}
        {sections.map((section, index) => (
          <Box
            key={section.id}
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
            <Typography sx={{ width: 140 }} color="text.secondary">
              {SECTION_LABELS[section.type]}
            </Typography>
            <Typography sx={{ flex: 1 }}>
              {typeof section.data.title === 'string' ? section.data.title : ''}
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
              disabled={index === sections.length - 1}
              onClick={() => void reorder(index, 1)}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Edit"
              component={Link}
              to={`/page-sections/${section.id}`}
            >
              <EditIcon fontSize="small" />
            </IconButton>
            <RecordContextProvider value={section}>
              <DeleteWithConfirmButton
                resource="page-sections"
                redirect={false}
                mutationOptions={{ onSuccess: () => void refetch() }}
                confirmTitle="Delete this section?"
                label=""
              />
            </RecordContextProvider>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 2 }}>
          <TextField
            select
            size="small"
            label="New section"
            value={adding}
            onChange={(e) => setAdding(e.target.value as SectionType)}
            sx={{ minWidth: 200 }}
          >
            {SECTION_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {SECTION_LABELS[type]}
              </MenuItem>
            ))}
          </TextField>
          <Button
            label="Add"
            disabled={!adding}
            onClick={() =>
              navigate('/page-sections/create', {
                state: {
                  record: {
                    pageId: page.id,
                    type: adding,
                    data: emptySectionData(adding as SectionType),
                  },
                },
              })
            }
          >
            <AddIcon />
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

const SiteLink = () => {
  const page = useRecordContext();
  const site = import.meta.env.VITE_SITE_URL as string | undefined;
  if (!site || !page) return null;
  const path = page.slug === HOME ? '' : String(page.slug);
  return (
    <Typography variant="body2" sx={{ mb: 1 }}>
      <a href={`${site}/${path}`} target="_blank" rel="noreferrer">
        Open on the site ↗
      </a>
    </Typography>
  );
};

const SlugInput = () => {
  const page = useRecordContext();
  const isHome = page?.slug === HOME;
  return (
    <TextInput
      source="slug"
      validate={required()}
      disabled={isHome}
      helperText={
        isHome
          ? 'The homepage: its slug stays "home"'
          : 'In the URL: lower-case letters, digits and hyphens'
      }
    />
  );
};

/** No delete button for the homepage (the API refuses it anyway). */
const PageToolbar = () => {
  const page = useRecordContext();
  return (
    <Toolbar sx={{ justifyContent: 'space-between' }}>
      <SaveButton />
      {page?.slug !== HOME && (
        <DeleteWithConfirmButton confirmTitle="Delete this page and its sections?" />
      )}
    </Toolbar>
  );
};

export const pages: ResourceProps = {
  name: 'pages',
  icon: DescriptionIcon,
  list: () => (
    <List
      sort={{ field: 'title', order: 'ASC' }}
      filters={[
        <SearchInput key="q" source="q" alwaysOn />,
        <SelectInput key="s" source="state" choices={PUBLISH_STATES} />,
      ]}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <RaTextField source="title" />
        <RaTextField source="slug" />
        <PublishStateField label="State" sortable={false} />
        <NumberField source="sectionCount" label="Sections" sortable={false} />
        <DateField source="updatedAt" />
      </Datagrid>
    </List>
  ),
  edit: () => (
    <Edit mutationMode="pessimistic" redirect={false}>
      <SimpleForm toolbar={<PageToolbar />}>
        <SiteLink />
        <TextInput source="title" validate={required()} />
        <SlugInput />
        <PublishedAtInput />
        <SeoInputs />
      </SimpleForm>
      <PageSections />
    </Edit>
  ),
  create: () => (
    <Create redirect="edit">
      <SimpleForm>
        <TextInput source="title" validate={required()} />
        <TextInput
          source="slug"
          validate={required()}
          helperText="In the URL: lower-case letters, digits and hyphens"
        />
        <PublishedAtInput />
        <SeoInputs />
      </SimpleForm>
    </Create>
  ),
  recordRepresentation: 'title',
};

/* ---------- Sections ---------- */

/** The names behind the ids in `data`, as the API resolved them. */
function References() {
  const section = useRecordContext<SectionRecord>();
  const refs = section?.references;
  const entries = refs
    ? Object.entries(refs).filter(([, list]) => list.length)
    : [];
  if (!entries.length) return null;
  return (
    <Labeled label="Linked records">
      <Box>
        {entries.map(([kind, list]) => (
          <Box
            key={kind}
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 1,
              alignItems: 'center',
              mb: 1,
            }}
          >
            <Typography variant="caption" sx={{ width: 120 }}>
              {kind}
            </Typography>
            {list.map((ref) =>
              ref.thumbnailUrl ? (
                <Thumbnail
                  key={ref.id}
                  media={{
                    url: ref.thumbnailUrl,
                    formats: null,
                    alt: ref.label,
                  }}
                  size={40}
                />
              ) : (
                <Typography key={ref.id} variant="body2">
                  {ref.label}
                </Typography>
              ),
            )}
          </Box>
        ))}
      </Box>
    </Labeled>
  );
}

/** The form for the chosen type, or the JSON of `data`. */
function SectionDataEditor() {
  const type = useWatch({ name: 'type' }) as SectionType | undefined;
  const [asJson, setAsJson] = useState(false);
  if (!type) return null;
  return (
    <Box sx={{ width: '100%' }}>
      <FormControlLabel
        control={
          <Switch
            checked={asJson}
            onChange={(e) => setAsJson(e.target.checked)}
          />
        }
        label="Edit as JSON"
      />
      {asJson ? <JsonDataInput /> : <SectionDataForm type={type} />}
    </Box>
  );
}

const toSave = (record: RaRecord) => ({
  ...record,
  data:
    record.data && typeof record.data === 'object'
      ? sectionDataToSave(
          record.type as SectionType,
          record.data as Record<string, unknown>,
        )
      : record.data,
});

const backToPage = (
  _resource?: string,
  _id?: unknown,
  data?: Partial<RaRecord>,
) => (data?.pageId ? `pages/${String(data.pageId)}` : 'pages');

const TYPE_CHOICES = SECTION_TYPES.map((id) => ({
  id,
  name: SECTION_LABELS[id],
}));

const SectionTitle = () => {
  const section = useRecordContext<SectionRecord>();
  return <span>Section: {section ? SECTION_LABELS[section.type] : ''}</span>;
};

export const pageSections: ResourceProps = {
  name: 'page-sections',
  edit: () => (
    <Edit
      mutationMode="pessimistic"
      transform={toSave}
      redirect={backToPage}
      title={<SectionTitle />}
    >
      <SimpleForm>
        <SelectInput
          source="type"
          choices={TYPE_CHOICES}
          disabled
          helperText="A section keeps its type; add a new one for another"
        />
        <SectionDataEditor />
        <References />
        <Alert severity="info" sx={{ mt: 2 }}>
          The site shows the change as soon as it is saved.
        </Alert>
      </SimpleForm>
    </Edit>
  ),
  create: () => (
    <Create transform={toSave} redirect={backToPage}>
      <SimpleForm>
        <SelectInput
          source="type"
          choices={TYPE_CHOICES}
          validate={required()}
        />
        <SectionDataEditor />
      </SimpleForm>
    </Create>
  ),
};
