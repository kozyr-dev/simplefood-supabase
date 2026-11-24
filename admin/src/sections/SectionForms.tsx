import Typography from '@mui/material/Typography';
import {
  ArrayInput,
  BooleanInput,
  ReferenceInput,
  SelectInput,
  SimpleFormIterator,
  TextInput,
} from 'react-admin';
import { useWatch } from 'react-hook-form';
import { HtmlInput } from '../components/HtmlInput';
import { MediaInput } from '../components/media';
import { OrderedIdsInput } from '../components/OrderedIdsInput';
import type { SectionType } from '../lib/sections';

/*
 * One small form per section type, bound to `data.*`. The shapes are the
 * API's (content/entities/section-data.ts); it checks them on save. Texts
 * the site shows as HTML use the rich-text editor, markdown ones a plain
 * text area.
 */

const ANCHOR_HELP = 'Optional in-page anchor, e.g. "soups" for /menu#soups';
const CLASS_HELP = 'Optional CSS class names for the site';

const Title = () => <TextInput source="data.title" label="Title" fullWidth />;

const Button = () => (
  <>
    <Typography variant="subtitle2">Button (optional)</Typography>
    <TextInput source="data.button.text" label="Button text" />
    <TextInput
      source="data.button.url"
      label="Button link"
      helperText="e.g. /simple-menu"
    />
  </>
);

const Markdown = ({ source, label }: { source: string; label: string }) => (
  <TextInput
    source={source}
    label={label}
    multiline
    minRows={4}
    fullWidth
    helperText="Markdown"
  />
);

const Items = () => (
  <ArrayInput source="data.items" label="Items">
    <SimpleFormIterator inline={false}>
      <TextInput source="title" label="Title" />
      <Markdown source="text" label="Text" />
      <MediaInput source="iconId" label="Icon" />
    </SimpleFormIterator>
  </ArrayInput>
);

const Anchor = () => (
  <>
    <TextInput source="data.anchorId" label="Anchor" helperText={ANCHOR_HELP} />
    <TextInput
      source="data.className"
      label="CSS classes"
      helperText={CLASS_HELP}
    />
  </>
);

const EmbedCode = ({ source, label }: { source: string; label: string }) => (
  <TextInput
    source={source}
    label={label}
    multiline
    fullWidth
    helperText="An <iframe> from Google Maps, YouTube or Vimeo (https); anything else is refused"
  />
);

function ProductsForm() {
  const source = useWatch({ name: 'data.source' }) as string | undefined;
  return (
    <>
      <Title />
      <SelectInput
        source="data.source"
        label="Which products"
        choices={[
          { id: 'featured', name: 'Featured products' },
          { id: 'favorite', name: 'Favorite products' },
          { id: 'category', name: 'A category' },
          { id: 'selected', name: 'Chosen products, in this order' },
        ]}
      />
      {source === 'category' && (
        <ReferenceInput source="data.categoryId" reference="product-categories">
          <SelectInput optionText="name" label="Category" />
        </ReferenceInput>
      )}
      {source === 'selected' && (
        <OrderedIdsInput
          source="data.productIds"
          label="Products"
          reference="products"
        />
      )}
      <SelectInput
        source="data.layout"
        label="Layout"
        choices={[
          { id: 'slider', name: 'Slider (default)' },
          { id: 'grid', name: 'Grid' },
        ]}
      />
      <Anchor />
    </>
  );
}

const FORMS: Record<SectionType, () => React.JSX.Element> = {
  'image-banner': () => (
    <>
      <Title />
      <HtmlInput source="data.text" label="Text" />
      <Button />
      <MediaInput source="data.imageId" label="Image" />
      <TextInput
        source="data.backgroundColor"
        label="Background color"
        helperText="#RRGGBB, e.g. #f5e6d3"
      />
    </>
  ),
  products: ProductsForm,
  benefits: () => (
    <>
      <Title />
      <Items />
      <Button />
    </>
  ),
  articles: () => (
    <>
      <Title />
      <Items />
      <Button />
      <Anchor />
    </>
  ),
  'image-gallery': () => (
    <>
      <Title />
      <OrderedIdsInput
        source="data.imageIds"
        label="Images"
        reference="media"
      />
    </>
  ),
  video: () => (
    <>
      <Title />
      <HtmlInput source="data.description" label="Description" />
      <TextInput
        source="data.videoUrl"
        label="Video URL"
        fullWidth
        helperText="An embed URL, e.g. https://www.youtube.com/embed/…"
      />
      <MediaInput
        source="data.placeholderImageId"
        label="Image before playing"
      />
    </>
  ),
  news: () => (
    <>
      <Title />
      <SelectInput
        source="data.layout"
        label="Layout"
        choices={[
          { id: 'slider', name: 'Slider (default)' },
          { id: 'list', name: 'List' },
        ]}
      />
      <ReferenceInput source="data.blogCategoryId" reference="blog-categories">
        <SelectInput
          optionText="name"
          label="Only this category"
          helperText="Empty: every post"
        />
      </ReferenceInput>
    </>
  ),
  content: () => (
    <>
      <Title />
      <HtmlInput source="data.content" label="Content" />
      <Button />
      <MediaInput source="data.imageId" label="Image" />
      <EmbedCode source="data.embedCode" label="Embed code" />
    </>
  ),
  contact: () => (
    <>
      <Title />
      <HtmlInput source="data.content" label="Content" />
      <HtmlInput source="data.secondaryContent" label="Second column" />
      <EmbedCode source="data.mapEmbedCode" label="Map embed code" />
      <BooleanInput source="data.showForm" label="Show the contact form" />
      <TextInput source="data.formTitle" label="Form title" />
    </>
  ),
  promo: () => (
    <>
      <Title />
      <Markdown source="data.text" label="Text" />
      <Button />
      <MediaInput source="data.iconId" label="Icon" />
      <MediaInput source="data.imageId" label="Image" />
      <BooleanInput source="data.invertLayout" label="Image on the left" />
    </>
  ),
};

/** The form for one section type. */
export function SectionDataForm({ type }: { type: SectionType }) {
  const Form = FORMS[type];
  return <Form />;
}
