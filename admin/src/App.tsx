import SettingsIcon from '@mui/icons-material/Settings';
import {
  Admin,
  CustomRoutes,
  Layout,
  Menu,
  Resource,
  type LayoutProps,
} from 'react-admin';
import { Route } from 'react-router-dom';
import { AppBarWithLogo, LoginPage } from './Branding';
import { Dashboard } from './Dashboard';
import { authProvider } from './providers/authProvider';
import { dataProvider } from './providers/dataProvider';
import { blogCategories, blogPosts } from './resources/blog';
import { productCategories, products } from './resources/catalog';
import { contactMessages } from './resources/contact';
import { media } from './resources/media';
import { menuItems, menus } from './resources/menus';
import { orders } from './resources/orders';
import { pageSections, pages } from './resources/pages';
import { SettingsPage } from './resources/settings';
import { users } from './resources/users';
import { darkTheme, lightTheme } from './theme';

const AppMenu = () => (
  <Menu>
    <Menu.DashboardItem />
    <Menu.ResourceItems />
    <Menu.Item
      to="/settings"
      primaryText="Site settings"
      leftIcon={<SettingsIcon />}
    />
  </Menu>
);

const AppLayout = ({ children }: LayoutProps) => (
  <Layout menu={AppMenu} appBar={AppBarWithLogo}>
    {children}
  </Layout>
);

/*
 * Served by the API at /admin/, same host: the refresh cookie and the
 * strict CSP depend on it. Hash routing (/admin/#/products), so the API
 * needs no fallback route.
 */
export function App() {
  return (
    <Admin
      title="SimpleFood admin"
      dataProvider={dataProvider}
      authProvider={authProvider}
      dashboard={Dashboard}
      layout={AppLayout}
      // Accounts log in by email only (names aren't unique).
      loginPage={LoginPage}
      // Follows the system's light or dark mode; the top bar has a toggle.
      lightTheme={lightTheme}
      darkTheme={darkTheme}
      requireAuth
      // react-admin would otherwise ping marmelab.com on every load.
      disableTelemetry
    >
      <Resource {...orders} />
      <Resource {...contactMessages} />
      <Resource {...products} />
      <Resource {...productCategories} />
      <Resource {...pages} />
      <Resource {...pageSections} />
      <Resource {...menus} />
      <Resource {...menuItems} />
      <Resource {...blogPosts} />
      <Resource {...blogCategories} />
      <Resource {...media} />
      <Resource {...users} />
      <CustomRoutes>
        <Route path="/settings" element={<SettingsPage />} />
      </CustomRoutes>
    </Admin>
  );
}
