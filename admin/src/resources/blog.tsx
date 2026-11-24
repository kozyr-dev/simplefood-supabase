import ArticleIcon from '@mui/icons-material/Article';
import LabelIcon from '@mui/icons-material/Label';
import {
  AutocompleteArrayInput,
  ChipField,
  Create,
  Datagrid,
  DateField,
  Edit,
  List,
  ReferenceArrayField,
  ReferenceArrayInput,
  ReferenceInput,
  SearchInput,
  SelectInput,
  SimpleForm,
  SingleFieldList,
  TextField,
  TextInput,
  required,
  type ResourceProps,
} from 'react-admin';
import { PublishStateField, PublishedAtInput } from '../components/fields';
import { MediaInput } from '../components/media';
import { SeoInputs } from '../components/SeoInputs';

export const PUBLISH_STATES = [
  { id: 'draft', name: 'Draft' },
  { id: 'scheduled', name: 'Scheduled' },
  { id: 'published', name: 'Published' },
];

const SLUG_HELP = 'In the URL: lower-case letters, digits and hyphens';

const PostForm = () => (
  <SimpleForm>
    <TextInput source="title" validate={required()} />
    <TextInput source="slug" validate={required()} helperText={SLUG_HELP} />
    <PublishedAtInput />
    <MediaInput source="imageId" label="Image" />
    <ReferenceArrayInput source="categoryIds" reference="blog-categories">
      <AutocompleteArrayInput optionText="name" label="Categories" />
    </ReferenceArrayInput>
    <TextInput
      source="text"
      multiline
      minRows={12}
      fullWidth
      validate={required()}
      helperText="Markdown: **bold**, *italic*, [link](https://…), # heading"
    />
    <SeoInputs />
  </SimpleForm>
);

export const blogPosts: ResourceProps = {
  name: 'blog-posts',
  icon: ArticleIcon,
  options: { label: 'Blog posts' },
  list: () => (
    <List
      sort={{ field: 'createdAt', order: 'DESC' }}
      filters={[
        <SearchInput key="q" source="q" alwaysOn />,
        <SelectInput key="s" source="state" choices={PUBLISH_STATES} />,
        <ReferenceInput
          key="c"
          source="categoryId"
          reference="blog-categories"
        />,
      ]}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="title" />
        <PublishStateField label="State" sortable={false} />
        <DateField source="publishedAt" showTime />
        <ReferenceArrayField
          source="categoryIds"
          reference="blog-categories"
          label="Categories"
          sortable={false}
        >
          <SingleFieldList linkType={false}>
            <ChipField source="name" size="small" />
          </SingleFieldList>
        </ReferenceArrayField>
      </Datagrid>
    </List>
  ),
  edit: () => (
    <Edit mutationMode="pessimistic">
      <PostForm />
    </Edit>
  ),
  create: () => (
    <Create redirect="edit">
      <PostForm />
    </Create>
  ),
  recordRepresentation: 'title',
};

const BlogCategoryForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} />
    <TextInput source="slug" validate={required()} helperText={SLUG_HELP} />
  </SimpleForm>
);

export const blogCategories: ResourceProps = {
  name: 'blog-categories',
  icon: LabelIcon,
  options: { label: 'Blog categories' },
  list: () => (
    <List sort={{ field: 'name', order: 'ASC' }}>
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" />
        <TextField source="slug" />
      </Datagrid>
    </List>
  ),
  edit: () => (
    <Edit mutationMode="pessimistic">
      <BlogCategoryForm />
    </Edit>
  ),
  create: () => (
    <Create redirect="list">
      <BlogCategoryForm />
    </Create>
  ),
  recordRepresentation: 'name',
};
