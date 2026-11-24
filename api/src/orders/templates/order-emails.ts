import { escapeHtml, formatMoney, layout } from '@/mail/templates/format';
import type { MailContent } from '@/mail/types/mail.types';
import type { OrderDto, OrderItemDto } from '../dto/order.dto';
import { ShippingMethod } from '../entities/order.entity';

const SHIPPING: Record<ShippingMethod, string> = {
  [ShippingMethod.Delivery]: 'Доставка кур’єром',
  [ShippingMethod.Pickup]: 'Самовивіз',
};

const itemLine = (item: OrderItemDto) =>
  `${item.title} — ${formatMoney(item.unitPrice)} × ${item.quantity} = ${formatMoney(item.lineTotal)}`;

function itemsText(order: OrderDto): string[] {
  return [
    'Товари:',
    ...order.items.map((item, index) => `${index + 1}. ${itemLine(item)}`),
    `Разом: ${formatMoney(order.subtotal)}`,
  ];
}

function itemsHtml(order: OrderDto): string {
  const rows = order.items
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.title)}</td>` +
        `<td align="right">${formatMoney(item.unitPrice)}</td>` +
        `<td align="right">× ${item.quantity}</td>` +
        `<td align="right">${formatMoney(item.lineTotal)}</td></tr>`,
    )
    .join('\n');
  return (
    `<table cellpadding="6" style="border-collapse:collapse">\n${rows}\n</table>\n` +
    `<p><strong>Разом: ${formatMoney(order.subtotal)}</strong></p>`
  );
}

/**
 * To the shop's inbox: everything needed to call the customer back. The
 * caller sets `Reply-To` to the customer. User input is escaped in the HTML;
 * the subject is fixed text and the number.
 */
export function orderShopNotification(
  order: OrderDto,
  { registered }: { registered: boolean },
): MailContent {
  const subject = `Нове замовлення №${order.number}`;
  const details: [string, string | null][] = [
    ['Клієнт', order.name],
    ['Телефон', order.phone],
    ['Email', order.email],
    ['Отримання', SHIPPING[order.shippingMethod]],
    ['Адреса', order.address],
    ['Коментар', order.comments],
    ['Замовник', registered ? 'зареєстрований клієнт' : 'гість'],
  ];
  const shown = details.filter(
    (row): row is [string, string] => row[1] !== null,
  );

  return {
    subject,
    text: [
      subject,
      '',
      ...shown.map(([label, value]) => `${label}: ${value}`),
      '',
      ...itemsText(order),
    ].join('\n'),
    html: layout(
      subject,
      `<h2>${escapeHtml(subject)}</h2>\n` +
        `<table cellpadding="4">\n${shown
          .map(
            ([label, value]) =>
              `<tr><th align="left" valign="top">${escapeHtml(label)}</th>` +
              `<td style="white-space:pre-line">${escapeHtml(value)}</td></tr>`,
          )
          .join('\n')}\n</table>\n` +
        `<h3>Товари</h3>\n${itemsHtml(order)}`,
    ),
  };
}

/**
 * To the address given at checkout. Nothing the customer typed is repeated
 * (no name, address or comments): a guest can enter anyone's address, and
 * the API must not deliver a stranger's text to it. Product titles and
 * prices come from the database.
 */
export function orderConfirmation(order: OrderDto): MailContent {
  const subject = `Замовлення №${order.number} прийнято`;
  const thanks =
    'Дякуємо за замовлення! Ми зателефонуємо вам, щоб його підтвердити.';
  const ignore =
    'Якщо ви не робили цього замовлення, просто проігноруйте цей лист.';

  return {
    subject,
    text: [
      subject,
      '',
      thanks,
      '',
      ...itemsText(order),
      `Отримання: ${SHIPPING[order.shippingMethod]}`,
      '',
      ignore,
    ].join('\n'),
    html: layout(
      subject,
      `<h2>${escapeHtml(subject)}</h2>\n<p>${thanks}</p>\n` +
        `${itemsHtml(order)}\n` +
        `<p>Отримання: ${SHIPPING[order.shippingMethod]}</p>\n` +
        `<p style="color:#888">${ignore}</p>`,
    ),
  };
}
