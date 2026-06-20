import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { openDb } from '@techparts/shared';

const RETURN_WINDOW_DAYS = 30;

interface OrderRow {
  id: number;
  customer_id: number;
  sku: string;
  quantity: number;
  total: number;
  status: string;
  order_date: string;
  delivered_date: string | null;
  product_name?: string;
}

export function getCustomerOrders(input: { customerId: number }) {
  const db = openDb();
  const customer = db.prepare('SELECT id, name, email FROM customers WHERE id = ?').get(input.customerId) as
    | { id: number; name: string; email: string }
    | undefined;
  if (!customer) {
    db.close();
    return { error: `No customer found with id ${input.customerId}.`, orders: [] };
  }
  const rows = db
    .prepare(
      `SELECT o.*, p.name AS product_name FROM orders o
       JOIN products p ON p.sku = o.sku
       WHERE o.customer_id = ? ORDER BY o.order_date DESC`,
    )
    .all(input.customerId) as unknown as OrderRow[];
  db.close();
  return {
    customer,
    orders: rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      productName: r.product_name,
      quantity: r.quantity,
      total: r.total,
      status: r.status,
      orderDate: r.order_date,
      deliveredDate: r.delivered_date,
    })),
  };
}

export function getOrderDetails(input: { orderId: number }) {
  const db = openDb();
  const row = db
    .prepare(
      `SELECT o.*, p.name AS product_name, c.name AS customer_name FROM orders o
       JOIN products p ON p.sku = o.sku
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = ?`,
    )
    .get(input.orderId) as unknown as (OrderRow & { customer_name: string }) | undefined;
  db.close();
  if (!row) return { error: `No order found with id ${input.orderId}.` };
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    sku: row.sku,
    productName: row.product_name,
    quantity: row.quantity,
    total: row.total,
    status: row.status,
    orderDate: row.order_date,
    deliveredDate: row.delivered_date,
  };
}

export function checkReturnEligibility(input: { orderId: number }) {
  const details = getOrderDetails(input);
  if ('error' in details) return { eligible: false, reason: details.error };
  if (details.status === 'returned') {
    return { eligible: false, reason: `Order ${details.id} has already been returned.` };
  }
  if (details.status !== 'delivered' || !details.deliveredDate) {
    return {
      eligible: false,
      reason: `Order ${details.id} has status '${details.status}' — only delivered orders can be returned.`,
    };
  }
  const daysSinceDelivery = Math.floor((Date.now() - Date.parse(details.deliveredDate)) / 86_400_000);
  const daysLeft = RETURN_WINDOW_DAYS - daysSinceDelivery;
  if (daysLeft < 0) {
    return {
      eligible: false,
      reason: `Delivered ${daysSinceDelivery} days ago — outside the ${RETURN_WINDOW_DAYS}-day return window.`,
    };
  }
  return {
    eligible: true,
    daysLeft,
    reason: `Delivered ${daysSinceDelivery} days ago; within the ${RETURN_WINDOW_DAYS}-day return window (${daysLeft} days left).`,
    order: { id: details.id, sku: details.sku, productName: details.productName, total: details.total },
  };
}

export const getCustomerOrdersTool = new FunctionTool({
  name: 'get_customer_orders',
  description: 'List all orders of a customer (most recent first), including product names and statuses.',
  parameters: z.object({ customerId: z.number().describe('Customer id, e.g. 1042.') }),
  execute: getCustomerOrders,
});

export const getOrderDetailsTool = new FunctionTool({
  name: 'get_order_details',
  description: 'Get full details of a single order by order id.',
  parameters: z.object({ orderId: z.number().describe('Order id, e.g. 88231.') }),
  execute: getOrderDetails,
});

export const checkReturnEligibilityTool = new FunctionTool({
  name: 'check_return_eligibility',
  description:
    'Check whether an order can still be returned under the TechParts 30-day return policy (counted from delivery date).',
  parameters: z.object({ orderId: z.number().describe('Order id, e.g. 88231.') }),
  execute: checkReturnEligibility,
});
