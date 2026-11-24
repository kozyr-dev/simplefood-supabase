import { alpha, type Theme } from '@mui/material/styles';
import { deepmerge } from '@mui/utils';
import {
  defaultDarkTheme,
  defaultLightTheme,
  type RaThemeOptions,
} from 'react-admin';

/*
 * The admin app's look: the site's green and orange on calm neutrals,
 * hairline borders instead of shadows, rounded corners, outlined inputs.
 * Built on react-admin's default themes, which keep its layout settings
 * (full-width inputs, iterators). Colors are hex values, not CSS variables,
 * so `alpha()` works on them.
 */

/** The site's colors (frontend/src/shared/ui/base/Button). */
const BRAND_GREEN = '#46ba3c';
const BRAND_ORANGE = '#ea5b21';

interface Tokens {
  mode: 'light' | 'dark';
  /** Buttons, links, the active menu item: 4.5:1 or more against `paper`. */
  primary: { main: string; light: string; dark: string; contrastText: string };
  secondary: { main: string; contrastText: string };
  background: string;
  paper: string;
  /** Table headers, hovered menu items. */
  subtle: string;
  border: string;
  /** An input's outline: stronger than `border`, as inputs need to be found. */
  inputBorder: string;
  text: string;
  textSecondary: string;
}

const LIGHT: Tokens = {
  mode: 'light',
  // The brand green is too light for white text (2.5:1); this is 5:1.
  primary: {
    main: '#2b7f24',
    light: BRAND_GREEN,
    dark: '#1f6f1a',
    contrastText: '#ffffff',
  },
  secondary: { main: '#c2410c', contrastText: '#ffffff' },
  background: '#f6f7f9',
  paper: '#ffffff',
  subtle: '#f9fafb',
  border: '#e6e8ec',
  inputBorder: '#d0d5dd',
  text: '#18181b',
  textSecondary: '#5c6370',
};

const DARK: Tokens = {
  mode: 'dark',
  primary: {
    main: BRAND_GREEN,
    light: '#6fd066',
    dark: '#2b7f24',
    contrastText: '#0e1a0d',
  },
  secondary: { main: '#f08a5d', contrastText: '#1a0d07' },
  background: '#111214',
  paper: '#18191c',
  subtle: '#1e2023',
  border: '#2a2c31',
  inputBorder: '#3a3d44',
  text: '#ececee',
  textSecondary: '#9ca3af',
};

/** The system's own UI font: nothing to download. */
const FONT = [
  '-apple-system',
  'BlinkMacSystemFont',
  '"Segoe UI"',
  'Roboto',
  '"Helvetica Neue"',
  'Arial',
  'sans-serif',
].join(',');

/** MUI's `breakpoints.down('sm')`: phones. */
const PHONE = '@media (max-width: 599.95px)';

/** For the few things that float: menus, popovers, dialogs. */
const floating = (t: Tokens) =>
  t.mode === 'light'
    ? '0 12px 32px -8px rgba(16, 24, 40, 0.16), 0 4px 8px -4px rgba(16, 24, 40, 0.08)'
    : '0 12px 32px -8px rgba(0, 0, 0, 0.6)';

/** Status chips: a tint of the color with readable text, not a solid block. */
const CHIP_COLORS = [
  'primary',
  'secondary',
  'success',
  'warning',
  'info',
  'error',
] as const;

function createTheme(t: Tokens): RaThemeOptions {
  const isLight = t.mode === 'light';
  return {
    palette: {
      mode: t.mode,
      primary: t.primary,
      secondary: t.secondary,
      background: { default: t.background, paper: t.paper },
      text: { primary: t.text, secondary: t.textSecondary },
      divider: t.border,
      bulkActionsToolbarBackgroundColor: alpha(t.primary.main, 0.08),
    },
    shape: { borderRadius: 8 },
    sidebar: { width: 232, closedWidth: 56 },
    typography: {
      fontFamily: FONT,
      h1: { fontWeight: 650, letterSpacing: '-0.02em' },
      h2: { fontWeight: 650, letterSpacing: '-0.02em' },
      h3: { fontWeight: 650, letterSpacing: '-0.015em' },
      h4: { fontWeight: 650, letterSpacing: '-0.01em' },
      h5: { fontWeight: 600 },
      h6: { fontWeight: 600, fontSize: '1.0625rem' },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ':root': { colorScheme: t.mode },
          body: {
            backgroundColor: t.background,
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          },
        },
      },

      // Surfaces: a hairline border; only floating ones get a shadow.
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          elevation1: { boxShadow: 'none', border: `1px solid ${t.border}` },
          elevation8: {
            boxShadow: floating(t),
            border: `1px solid ${t.border}`,
          },
          elevation24: { boxShadow: floating(t) },
        },
      },
      MuiCard: {
        styleOverrides: { root: { borderRadius: 12 } },
      },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: 14 } },
      },
      MuiPopover: {
        styleOverrides: { paper: { borderRadius: 10 } },
      },

      // The top bar: the page's own color, a line below it.
      RaAppBar: {
        defaultProps: { color: 'inherit' },
        styleOverrides: {
          root: {
            '& .RaAppBar-toolbar': { paddingLeft: 8, paddingRight: 12 },
            '& .RaAppBar-title': { fontWeight: 600 },
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: alpha(t.paper, 0.85),
            backdropFilter: 'saturate(180%) blur(8px)',
            color: t.text,
            boxShadow: 'none',
            borderBottom: `1px solid ${t.border}`,
          },
        },
      },

      // The menu: rounded items, the active one tinted green.
      RaMenuItemLink: {
        styleOverrides: {
          root: {
            margin: '1px 8px',
            padding: '7px 10px',
            borderRadius: 8,
            fontSize: '0.875rem',
            fontWeight: 500,
            '&:hover': { backgroundColor: alpha(t.text, 0.05) },
            '&.RaMenuItemLink-active': {
              color: t.primary.main,
              fontWeight: 600,
              backgroundColor: alpha(t.primary.main, isLight ? 0.09 : 0.14),
              '& .RaMenuItemLink-icon': { color: t.primary.main },
            },
            '& .RaMenuItemLink-icon': { minWidth: 34 },
            '& .MuiSvgIcon-root': { fontSize: '1.25rem' },
          },
        },
      },
      RaSidebar: {
        styleOverrides: {
          root: {
            '& .RaSidebar-fixed': { paddingTop: 8 },
          },
        },
      },
      RaLayout: {
        styleOverrides: {
          root: {
            // react-admin's `fit-content` lets a wide table widen the whole
            // page; this way it scrolls in its own card (RaList below).
            minWidth: 0,
            '& .RaLayout-content': { padding: '8px 24px 24px', minWidth: 0 },
            [PHONE]: {
              '& .RaLayout-content': { padding: '8px' },
            },
          },
        },
      },

      // Buttons and inputs.
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: { borderRadius: 8 },
          sizeSmall: { padding: '4px 10px' },
        },
      },
      MuiIconButton: {
        styleOverrides: { root: { borderRadius: 8 } },
      },
      MuiTextField: {
        defaultProps: { variant: 'outlined' },
      },
      // More room below a field than above it, so a helper text reads as
      // its field's, not the next one's.
      MuiFormControl: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { marginDense: { marginBottom: 12 } },
      },
      MuiFormHelperText: {
        styleOverrides: { root: { marginTop: 2 } },
      },
      // Forms and details at a readable width, not across a wide screen.
      RaEdit: {
        styleOverrides: { root: { '& .RaEdit-main': { maxWidth: 960 } } },
      },
      RaCreate: {
        styleOverrides: { root: { '& .RaCreate-main': { maxWidth: 960 } } },
      },
      RaShow: {
        styleOverrides: { root: { '& .RaShow-main': { maxWidth: 960 } } },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: t.paper,
            borderRadius: 8,
            '&:hover:not(.Mui-focused):not(.Mui-error):not(.Mui-disabled) .MuiOutlinedInput-notchedOutline':
              { borderColor: t.textSecondary },
            '&.Mui-focused': {
              boxShadow: `0 0 0 3px ${alpha(t.primary.main, 0.16)}`,
            },
          },
          notchedOutline: { borderColor: t.inputBorder },
        },
      },

      // Tables: a quiet header, a hover tint, no line under the last row.
      MuiTableCell: {
        styleOverrides: {
          root: { borderBottom: `1px solid ${t.border}` },
          head: {
            backgroundColor: t.subtle,
            color: t.textSecondary,
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          },
          sizeSmall: { padding: '10px 12px' },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            '&:last-child > td': { borderBottom: 0 },
            '&.MuiTableRow-hover:hover': {
              backgroundColor: alpha(t.primary.main, isLight ? 0.04 : 0.08),
            },
          },
        },
      },
      MuiTableSortLabel: {
        styleOverrides: {
          root: {
            '&.Mui-active': { color: t.text },
          },
        },
      },
      RaDatagrid: {
        styleOverrides: {
          root: {
            '& .RaDatagrid-headerCell': { backgroundColor: t.subtle },
          },
        },
      },
      RaList: {
        styleOverrides: {
          root: {
            // Keeps the rounded corners; a wide table scrolls in its card
            // instead of widening the page.
            '& .RaList-main': { minWidth: 0 },
            '& .RaList-content': { overflowX: 'auto' },
          },
        },
      },
      // On phones react-admin paints these white; the page's color is
      // calmer.
      RaListToolbar: {
        styleOverrides: {
          root: { [PHONE]: { backgroundColor: 'transparent' } },
        },
      },
      RaTopToolbar: {
        styleOverrides: {
          root: { [PHONE]: { backgroundColor: 'transparent' } },
        },
      },

      // The save bar under a form: part of the card, a line above it.
      RaToolbar: {
        styleOverrides: {
          root: {
            backgroundColor: t.paper,
            borderTop: `1px solid ${t.border}`,
            paddingLeft: 16,
            paddingRight: 16,
          },
        },
      },

      MuiChip: {
        styleOverrides: {
          root: {
            fontWeight: 600,
            borderRadius: 6,
            variants: CHIP_COLORS.map((color) => ({
              props: { variant: 'filled', color },
              style: ({ theme }: { theme: Theme }) => {
                const { main, dark } = theme.palette[color];
                return {
                  backgroundColor: alpha(main, isLight ? 0.12 : 0.2),
                  color: isLight ? dark : main,
                };
              },
            })),
          },
          sizeSmall: { height: 22, fontSize: '0.75rem' },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 10 } },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 6, fontSize: '0.75rem' },
        },
      },
      MuiTab: {
        styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } },
      },
      MuiLinearProgress: {
        styleOverrides: { root: { borderRadius: 4 } },
      },

      // The sign-in page: a soft brand tint instead of react-admin's navy.
      RaLogin: {
        styleOverrides: {
          root: {
            justifyContent: 'center',
            backgroundColor: t.background,
            backgroundImage: `radial-gradient(60rem 30rem at 50% -10%, ${alpha(BRAND_GREEN, isLight ? 0.14 : 0.12)}, transparent 70%), radial-gradient(40rem 24rem at 100% 110%, ${alpha(BRAND_ORANGE, isLight ? 0.1 : 0.08)}, transparent 70%)`,
            '& .RaLogin-card': {
              marginTop: 0,
              width: 360,
              maxWidth: 'calc(100vw - 32px)',
              padding: '8px 8px 4px',
              borderRadius: 16,
              boxShadow: floating(t),
            },
            // The logo (Branding.tsx) on the site's green, as in its header.
            '& .RaLogin-avatar': { margin: '16px 16px 8px' },
            '& .RaLogin-icon': {
              width: 'auto',
              height: 56,
              padding: '0 24px',
              borderRadius: 12,
              backgroundColor: BRAND_GREEN,
            },
          },
        },
      },
    },
  };
}

export const lightTheme = deepmerge(defaultLightTheme, createTheme(LIGHT));
export const darkTheme = deepmerge(defaultDarkTheme, createTheme(DARK));
