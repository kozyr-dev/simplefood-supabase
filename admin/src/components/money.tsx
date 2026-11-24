import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';
import { useEffect, useRef, useState } from 'react';
import {
  FieldTitle,
  useInput,
  useRecordContext,
  type Validator,
} from 'react-admin';
import {
  displayHryvnias,
  formatHryvnias,
  parseHryvnias,
  validateHryvnias,
} from '../lib/money';

/**
 * A price typed in hryvnias ("189.50"), stored in kopiykas (18950). The
 * text stays as typed while editing (formatting each keystroke would turn
 * "1" into "1.00" under the cursor); it is reformatted when a value comes
 * from outside (the record loading, a form reset).
 */
export function MoneyInput({
  source,
  label,
  validate,
}: {
  source: string;
  label?: string;
  validate?: Validator | Validator[];
}) {
  const { id, field, fieldState, isRequired } = useInput({
    source,
    validate: [validateHryvnias, ...[validate ?? []].flat()],
  });
  const [text, setText] = useState(() => formatHryvnias(field.value));
  // The value this input last stored: a different one came from outside.
  const stored = useRef<unknown>(field.value);
  useEffect(() => {
    if (field.value !== stored.current) {
      stored.current = field.value;
      setText(formatHryvnias(field.value));
    }
  }, [field.value]);

  return (
    <TextField
      id={id}
      name={field.name}
      inputRef={field.ref}
      label={
        <FieldTitle label={label} source={source} isRequired={isRequired} />
      }
      value={text}
      onChange={(event) => {
        const value = parseHryvnias(event.target.value);
        setText(event.target.value);
        stored.current = value;
        field.onChange(value);
      }}
      onBlur={field.onBlur}
      error={fieldState.invalid}
      helperText={fieldState.error?.message ?? ' '}
      inputMode="decimal"
      sx={{ mb: 1 }}
      slotProps={{
        input: {
          endAdornment: <InputAdornment position="end">₴</InputAdornment>,
        },
      }}
    />
  );
}

/** Kopiykas shown as "189,50 ₴". */
export function MoneyField({
  source,
}: {
  source: string;
  label?: string;
  sortable?: boolean;
}) {
  const record = useRecordContext();
  const value = record?.[source];
  return <span>{typeof value === 'number' ? displayHryvnias(value) : ''}</span>;
}
