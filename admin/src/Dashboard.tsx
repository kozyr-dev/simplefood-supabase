import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import DateRangeIcon from '@mui/icons-material/DateRange';
import HourglassTopIcon from '@mui/icons-material/HourglassTop';
import MarkEmailUnreadIcon from '@mui/icons-material/MarkEmailUnread';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import TodayIcon from '@mui/icons-material/Today';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Loading, RecordContextProvider, Title } from 'react-admin';
import { Link } from 'react-router-dom';
import { OrderStatusField } from './components/fields';
import { displayHryvnias } from './lib/money';
import { adminActions } from './providers/dataProvider';

/** A link to a list with filters set. */
const listLink = (resource: string, filter: object) =>
  `/${resource}?filter=${encodeURIComponent(JSON.stringify(filter))}`;

type Tone = 'primary' | 'warning' | 'info' | 'secondary';

function Tile({
  label,
  value,
  to,
  icon,
  tone,
}: {
  label: string;
  value: number;
  to: string;
  icon: ReactNode;
  tone: Tone;
}) {
  return (
    <Card>
      <CardActionArea
        component={Link}
        to={to}
        sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}
      >
        <Box
          sx={(theme) => ({
            display: 'grid',
            placeItems: 'center',
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 2.5,
            color: theme.palette[tone].main,
            bgcolor: alpha(theme.palette[tone].main, 0.12),
          })}
        >
          {icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {label}
          </Typography>
          <Typography variant="h5" component="p" sx={{ fontWeight: 650 }}>
            {value}
          </Typography>
        </Box>
      </CardActionArea>
    </Card>
  );
}

export function Dashboard() {
  const { data, isPending, error } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => (await adminActions.dashboard()).data,
    refetchInterval: 60_000,
  });
  if (isPending) return <Loading />;
  if (error || !data)
    return <Typography color="error">The dashboard could not load.</Typography>;

  return (
    <Box sx={{ py: 2 }}>
      <Title title="SimpleFood" />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 2,
          mb: 3,
        }}
      >
        <Tile
          label="New orders"
          value={data.ordersByStatus.new}
          to={listLink('orders', { status: 'new' })}
          icon={<ShoppingCartOutlinedIcon />}
          tone="primary"
        />
        <Tile
          label="Processing"
          value={data.ordersByStatus.processing}
          to={listLink('orders', { status: 'processing' })}
          icon={<HourglassTopIcon />}
          tone="warning"
        />
        <Tile
          label="Orders today"
          value={data.ordersToday}
          to="/orders"
          icon={<TodayIcon />}
          tone="info"
        />
        <Tile
          label="Last 7 days"
          value={data.ordersLast7Days}
          to="/orders"
          icon={<DateRangeIcon />}
          tone="info"
        />
        <Tile
          label="New messages"
          value={data.unhandledMessages}
          to={listLink('contact-messages', { handled: 'false' })}
          icon={<MarkEmailUnreadIcon />}
          tone="secondary"
        />
      </Box>
      <Card>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: 2,
            py: 1.5,
          }}
        >
          <Typography variant="h6" component="h2">
            Latest orders
          </Typography>
          <Button
            component={Link}
            to="/orders"
            size="small"
            endIcon={<ArrowForwardIcon />}
          >
            All orders
          </Button>
        </Box>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>№</TableCell>
                <TableCell>Placed</TableCell>
                <TableCell>Name</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Total</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.latestOrders.map((order) => (
                <TableRow
                  key={order.id}
                  hover
                  component={Link}
                  to={`/orders/${order.id}/show`}
                  sx={{ textDecoration: 'none' }}
                >
                  <TableCell>№{order.number}</TableCell>
                  <TableCell>
                    {new Date(order.createdAt).toLocaleString('uk-UA')}
                  </TableCell>
                  <TableCell>{order.name}</TableCell>
                  <TableCell>
                    <RecordContextProvider value={order}>
                      <OrderStatusField />
                    </RecordContextProvider>
                  </TableCell>
                  <TableCell align="right">
                    {displayHryvnias(order.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Card>
    </Box>
  );
}
