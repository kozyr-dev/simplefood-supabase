import Box from '@mui/material/Box';
import {
  AppBar,
  Login,
  LoginForm,
  PasswordInput,
  required,
  TextInput,
  TitlePortal,
} from 'react-admin';
import { Link } from 'react-router-dom';
import logo from './assets/logo.png';
import logoMark from './assets/logo-mark.png';

/*
 * The shop's logo (frontend/public/logo*.png). It's white, made for the
 * site's green header, so it sits on the brand green here too.
 */
const BRAND_GREEN = '#46ba3c';

/** The top bar: the logo mark (to the dashboard), then the page's title. */
export function AppBarWithLogo() {
  return (
    <AppBar>
      <Box
        component={Link}
        to="/"
        aria-label="SimpleFood: dashboard"
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 32,
          height: 32,
          mr: 1.5,
          flexShrink: 0,
          // A round badge, like the site's icon.
          borderRadius: '50%',
          bgcolor: BRAND_GREEN,
        }}
      >
        <Box component="img" src={logoMark} alt="" sx={{ height: 20 }} />
      </Box>
      <TitlePortal />
    </AppBar>
  );
}

/** Sign-in by email (accounts log in by email only), under the full logo. */
export function LoginPage() {
  return (
    <Login
      avatarIcon={
        <Box
          component="img"
          src={logo}
          alt="SimpleFood"
          sx={{ height: 28, display: 'block' }}
        />
      }
    >
      <LoginForm>
        <TextInput
          autoFocus
          source="email"
          label="Email"
          type="email"
          autoComplete="email"
          validate={required()}
        />
        <PasswordInput
          source="password"
          label="Password"
          autoComplete="current-password"
          validate={required()}
        />
      </LoginForm>
    </Login>
  );
}
