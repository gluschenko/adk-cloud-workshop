export interface StoreProduct {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  warehouse: string;
}

const tones = [
  'linear-gradient(135deg, #eef2f6 0%, #cfd8e3 100%)',
  'linear-gradient(135deg, #f8fafc 0%, #dbe7f3 100%)',
  'linear-gradient(135deg, #fff8ed 0%, #f1d6aa 100%)',
  'linear-gradient(135deg, #eefdf6 0%, #a7d8c2 100%)',
  'linear-gradient(135deg, #f7faff 0%, #bdd7ff 100%)',
  'linear-gradient(135deg, #f5f5f2 0%, #d7d7ce 100%)',
];

export function imageToneFor(product: StoreProduct): string {
  const code = Array.from(product.sku).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return tones[code % tones.length];
}

export function imageLabelFor(product: StoreProduct): string {
  return product.sku.split('-')[0]?.slice(0, 4).toUpperCase() || 'PART';
}

export function brandFor(product: StoreProduct): string {
  return product.name.split(/\s+/)[0] || 'TechParts';
}

export function fitmentFor(product: StoreProduct): string {
  return `SKU ${product.sku} - Warehouse ${product.warehouse}`;
}

export function stockBadgeFor(product: StoreProduct): string {
  if (product.stock <= 0) return 'Out of stock';
  if (product.stock < 5) return 'Low stock';
  return 'In stock';
}

export function deliveryFor(product: StoreProduct): string {
  if (product.stock <= 0) return 'Restock pending';
  return `Ships from warehouse ${product.warehouse}`;
}

export function categoriesFor(products: StoreProduct[]): string[] {
  return ['All', ...Array.from(new Set(products.map((product) => product.category)))];
}
