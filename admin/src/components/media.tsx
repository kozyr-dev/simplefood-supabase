import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import ClearIcon from '@mui/icons-material/Clear';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type ChangeEvent } from 'react';
import {
  Labeled,
  useCreate,
  useGetList,
  useGetOne,
  useInput,
  useNotify,
  useRecordContext,
  type RaRecord,
} from 'react-admin';

/** The parts of a media record the admin shows. */
export interface MediaRecord extends RaRecord {
  url: string;
  name?: string;
  alt: string | null;
  formats: Partial<Record<'thumbnail' | 'small', { url: string }>> | null;
}

/** The smallest copy there is. */
export const thumbnailOf = (media: Pick<MediaRecord, 'url' | 'formats'>) =>
  media.formats?.thumbnail?.url ?? media.formats?.small?.url ?? media.url;

export function Thumbnail({
  media,
  size = 64,
}: {
  media?: Pick<MediaRecord, 'url' | 'formats' | 'alt'> | null;
  size?: number;
}) {
  if (!media) {
    return (
      <Box
        sx={{
          width: size,
          height: size,
          bgcolor: 'action.hover',
          borderRadius: 1,
        }}
      />
    );
  }
  return (
    <img
      src={thumbnailOf(media)}
      alt={media.alt ?? ''}
      width={size}
      height={size}
      style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
    />
  );
}

/** A list column: the record's own image (`image` object, e.g. products). */
export function ImageField({
  source = 'image',
}: {
  source?: string;
  label?: string;
  sortable?: boolean;
}) {
  const record = useRecordContext();
  return <Thumbnail media={record?.[source] as MediaRecord | null} size={48} />;
}

/** One image by id, loaded (for pickers and section previews). */
export function MediaById({ id, size }: { id?: string | null; size?: number }) {
  const { data } = useGetOne<MediaRecord>(
    'media',
    { id: id ?? '' },
    { enabled: !!id },
  );
  return <Thumbnail media={id ? data : null} size={size} />;
}

/**
 * Picks an image from the library, or uploads one into it. `onPick` gets
 * the chosen image's id.
 */
export function MediaPickerDialog({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const perPage = 24;
  const {
    data = [],
    total = 0,
    refetch,
  } = useGetList<MediaRecord>(
    'media',
    {
      pagination: { page, perPage },
      sort: { field: 'createdAt', order: 'DESC' },
      filter: { q },
    },
    { enabled: open },
  );
  const [create, { isPending: uploading }] = useCreate();
  const notify = useNotify();

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    void create(
      'media',
      { data: { file } },
      {
        onSuccess: (media) => {
          void refetch();
          onPick(String(media.id));
        },
        onError: (error) => notify((error as Error).message, { type: 'error' }),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Choose an image</DialogTitle>
      <DialogContent>
        <Box
          sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, mt: 1 }}
        >
          <TextField
            label="Search by file name"
            size="small"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
          <Button
            component="label"
            variant="outlined"
            startIcon={<AddPhotoAlternateIcon />}
            disabled={uploading}
          >
            {uploading ? 'Uploading…' : 'Upload'}
            <input
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={upload}
            />
          </Button>
          <Typography variant="caption">
            JPEG, PNG or WebP, up to 10 MB
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
            gap: 1,
          }}
        >
          {data.map((media) => (
            <Button
              key={media.id}
              onClick={() => onPick(String(media.id))}
              sx={{ flexDirection: 'column', textTransform: 'none', p: 0.5 }}
              title={media.name}
            >
              <Thumbnail media={media} size={96} />
              <Typography variant="caption" noWrap sx={{ maxWidth: 100 }}>
                {media.name}
              </Typography>
            </Button>
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Typography variant="caption" sx={{ mr: 'auto', ml: 2 }}>
          {total} images
        </Typography>
        <Button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous
        </Button>
        <Button
          disabled={page * perPage >= total}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
}

/** One image, by id: a thumbnail, "Choose…" and "Remove". */
export function MediaInput({
  source,
  label,
}: {
  source: string;
  label?: string;
}) {
  const { field, fieldState } = useInput({ source });
  const [open, setOpen] = useState(false);
  const id = (field.value as string | null | undefined) || null;
  return (
    <Labeled label={label ?? source} sx={{ mb: 2 }}>
      <Box>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <MediaById id={id} />
          <Button size="small" onClick={() => setOpen(true)}>
            {id ? 'Change…' : 'Choose…'}
          </Button>
          {id && (
            <IconButton
              size="small"
              aria-label="Remove image"
              onClick={() => field.onChange(null)}
            >
              <ClearIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        {fieldState.error && (
          <FormHelperText error>{fieldState.error.message}</FormHelperText>
        )}
        <MediaPickerDialog
          open={open}
          onClose={() => setOpen(false)}
          onPick={(picked) => {
            field.onChange(picked);
            setOpen(false);
          }}
        />
      </Box>
    </Labeled>
  );
}
