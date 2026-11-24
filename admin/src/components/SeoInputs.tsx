import Typography from '@mui/material/Typography';
import { TextInput } from 'react-admin';
import { MediaInput } from './media';

/** The SEO fields of settings, pages and posts (empty: the site default). */
export function SeoInputs() {
  return (
    <>
      <Typography variant="subtitle2" sx={{ mt: 2 }}>
        Search engines and link previews
      </Typography>
      <TextInput
        source="seo.title"
        label="SEO title"
        helperText="Empty: the site default"
      />
      <TextInput source="seo.description" label="SEO description" multiline />
      <MediaInput source="seo.shareImageId" label="Share image" />
    </>
  );
}
