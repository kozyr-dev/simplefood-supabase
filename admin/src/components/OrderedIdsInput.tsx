import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ClearIcon from '@mui/icons-material/Clear';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import {
  Labeled,
  useGetList,
  useGetMany,
  useInput,
  type RaRecord,
} from 'react-admin';
import { MediaById, MediaPickerDialog } from './media';

/** Moves the item at `from` one place up (-1) or down (+1). */
export function move<T>(items: readonly T[], from: number, step: -1 | 1): T[] {
  const to = from + step;
  if (to < 0 || to >= items.length) return [...items];
  const next = [...items];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/**
 * An ordered list of ids (selected products, gallery images): the order
 * is what the site shows. Up/down, remove, and add: by search for records
 * (`reference` + `labelField`), or from the image library (`reference="media"`).
 */
export function OrderedIdsInput({
  source,
  label,
  reference,
  labelField = 'title',
}: {
  source: string;
  label?: string;
  reference: string;
  labelField?: string;
}) {
  const { field, fieldState } = useInput({ source });
  const ids = (Array.isArray(field.value) ? field.value : []) as string[];
  const isMedia = reference === 'media';
  const { data: records = [] } = useGetMany(
    reference,
    { ids },
    { enabled: !isMedia && ids.length > 0 },
  );
  const byId = new Map(records.map((record) => [String(record.id), record]));
  const [search, setSearch] = useState('');
  const [picking, setPicking] = useState(false);
  const { data: options = [] } = useGetList<RaRecord>(
    reference,
    {
      pagination: { page: 1, perPage: 20 },
      sort: { field: labelField, order: 'ASC' },
      filter: { q: search },
    },
    { enabled: !isMedia },
  );
  const add = (id: string) => {
    if (!ids.includes(id)) field.onChange([...ids, id]);
  };

  return (
    <Labeled label={label ?? source} sx={{ mb: 2 }} fullWidth>
      <Box>
        {ids.map((id, index) => (
          <Box
            key={id}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}
          >
            <Typography variant="body2" sx={{ width: 24 }}>
              {index + 1}.
            </Typography>
            {isMedia ? (
              <MediaById id={id} size={40} />
            ) : (
              <Typography variant="body2" sx={{ flex: 1 }}>
                {byId.has(id)
                  ? String(byId.get(id)?.[labelField])
                  : '(deleted)'}
              </Typography>
            )}
            <IconButton
              size="small"
              aria-label="Move up"
              disabled={index === 0}
              onClick={() => field.onChange(move(ids, index, -1))}
            >
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Move down"
              disabled={index === ids.length - 1}
              onClick={() => field.onChange(move(ids, index, 1))}
            >
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              aria-label="Remove"
              onClick={() =>
                field.onChange(ids.filter((other) => other !== id))
              }
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {isMedia ? (
          <>
            <Button size="small" onClick={() => setPicking(true)}>
              Add image…
            </Button>
            <MediaPickerDialog
              open={picking}
              onClose={() => setPicking(false)}
              onPick={(id) => {
                add(id);
                setPicking(false);
              }}
            />
          </>
        ) : (
          <Autocomplete
            size="small"
            sx={{ maxWidth: 400, mt: 1 }}
            options={options.filter(
              (option) => !ids.includes(String(option.id)),
            )}
            getOptionLabel={(option) => String(option[labelField] ?? '')}
            filterOptions={(x) => x}
            onInputChange={(_, value) => setSearch(value)}
            onChange={(_, option) => option && add(String(option.id))}
            value={null}
            renderInput={(params) => <TextField {...params} label="Add…" />}
          />
        )}
        {fieldState.error && (
          <FormHelperText error>{fieldState.error.message}</FormHelperText>
        )}
      </Box>
    </Labeled>
  );
}
