import { RichTextInput, RichTextInputToolbar } from 'ra-input-rich-text';

/**
 * Text the site shows as HTML (product descriptions, some sections). The
 * API keeps only safe tags and styles when it saves.
 */
export function HtmlInput({
  source,
  label,
}: {
  source: string;
  label?: string;
}) {
  return (
    <RichTextInput
      source={source}
      label={label}
      fullWidth
      toolbar={<RichTextInputToolbar size="small" />}
      helperText="Scripts and unknown tags are removed when saved"
    />
  );
}
