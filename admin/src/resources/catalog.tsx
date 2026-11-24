import CategoryIcon from '@mui/icons-material/Category';
import RestaurantIcon from '@mui/icons-material/Restaurant';
import {
  AutocompleteArrayInput,
  BooleanField,
  BooleanInput,
  ChipField,
  Create,
  Datagrid,
  Edit,
  List,
  NumberField,
  NumberInput,
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
import { HtmlInput } from '../components/HtmlInput';
import { ImageField, MediaInput } from '../components/media';
import { MoneyField, MoneyInput } from '../components/money';

const YES_NO = [
  { id: 'true', name: 'Yes' },
  { id: 'false', name: 'No' },
];

const SLUG_HELP = 'In the URL: lower-case letters, digits and hyphens';

const productFilters = [
  <SearchInput key="q" source="q" alwaysOn />,
  <ReferenceInput key="c" source="categoryId" reference="product-categories" />,
  <SelectInput key="a" source="available" choices={YES_NO} />,
  <SelectInput key="f" source="featured" choices={YES_NO} />,
];

const ProductList = () => (
  <List filters={productFilters} sort={{ field: 'title', order: 'ASC' }}>
    <Datagrid rowClick="edit" bulkActionButtons={false}>
      <ImageField label="" sortable={false} />
      <TextField source="title" />
      <MoneyField source="price" label="Price" />
      <BooleanField source="available" sortable={false} />
      <ReferenceArrayField
        source="categoryIds"
        reference="product-categories"
        label="Categories"
        sortable={false}
      >
        <SingleFieldList linkType={false}>
          <ChipField source="name" size="small" />
        </SingleFieldList>
      </ReferenceArrayField>
    </Datagrid>
  </List>
);

const ProductForm = () => (
  <SimpleForm>
    <TextInput source="title" validate={required()} />
    <TextInput source="slug" validate={required()} helperText={SLUG_HELP} />
    <MoneyInput source="price" label="Price" validate={required()} />
    <MediaInput source="imageId" label="Image" />
    <ReferenceArrayInput source="categoryIds" reference="product-categories">
      <AutocompleteArrayInput optionText="name" label="Categories" />
    </ReferenceArrayInput>
    <HtmlInput source="description" label="Description" />
    <NumberInput source="weight" label="Weight, g" min={1} />
    <NumberInput source="calories" label="Calories, kcal" min={0} />
    <BooleanInput source="available" defaultValue />
    <BooleanInput
      source="featured"
      helperText="Shown in “featured” product sections"
    />
    <BooleanInput
      source="favorite"
      helperText="Shown in “favorite” product sections"
    />
  </SimpleForm>
);

export const products: ResourceProps = {
  name: 'products',
  icon: RestaurantIcon,
  list: ProductList,
  edit: () => (
    <Edit mutationMode="pessimistic">
      <ProductForm />
    </Edit>
  ),
  create: () => (
    <Create redirect="edit">
      <ProductForm />
    </Create>
  ),
  recordRepresentation: 'title',
};

const CategoryForm = () => (
  <SimpleForm>
    <TextInput source="name" validate={required()} />
    <TextInput source="slug" validate={required()} helperText={SLUG_HELP} />
    <NumberInput source="position" helperText="Lower first" min={0} />
  </SimpleForm>
);

export const productCategories: ResourceProps = {
  name: 'product-categories',
  icon: CategoryIcon,
  options: { label: 'Categories' },
  list: () => (
    <List
      sort={{ field: 'position', order: 'ASC' }}
      filters={[<SearchInput key="q" source="q" alwaysOn />]}
    >
      <Datagrid rowClick="edit" bulkActionButtons={false}>
        <TextField source="name" />
        <TextField source="slug" />
        <NumberField source="position" />
      </Datagrid>
    </List>
  ),
  edit: () => (
    <Edit mutationMode="pessimistic">
      <CategoryForm />
    </Edit>
  ),
  create: () => (
    <Create redirect="list">
      <CategoryForm />
    </Create>
  ),
  recordRepresentation: 'name',
};
