import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useInput } from 'react-admin';

/** Marks invalid JSON in the form value, so the form can't be saved. */
export const INVALID_JSON = Symbol('invalid JSON');

export function parseJsonObject(
  text: string,
): Record<string, unknown> | typeof INVALID_JSON {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : INVALID_JSON;
  } catch {
    return INVALID_JSON;
  }
}

const validateJson = (value: unknown) =>
  value === INVALID_JSON ? 'Not a JSON object: fix it to save' : undefined;

/**
 * `data` as JSON, for what the forms don't cover. The API checks it on
 * save, like the forms' data.
 */
export function JsonDataInput() {
  const { field, fieldState } = useInput({
    source: 'data',
    validate: validateJson,
  });
  const [text, setText] = useState(() =>
    JSON.stringify(field.value ?? {}, null, 2),
  );
  return (
    <TextField
      label="Data (JSON)"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        field.onChange(parseJsonObject(event.target.value));
      }}
      onBlur={field.onBlur}
      error={fieldState.invalid}
      helperText={
        fieldState.error?.message ??
        'Checked against the section type when saved'
      }
      multiline
      minRows={12}
      fullWidth
      slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: 13 } } }}
    />
  );
}
