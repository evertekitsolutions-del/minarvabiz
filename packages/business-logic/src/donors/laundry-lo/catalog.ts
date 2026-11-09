/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Ayush Agrawal
 * Source: agrayush13/laundry-lo-src@fd48e8ba2dd29b07f3487013f43fdf92f9e67920
 * Adapted toCatalog function from api/src/http/serializers.ts with local row typings.
 * Full MIT notice: ./LICENSE
 */
// Inlined from the donor api/src/http/money.ts to keep this module pure and portable.
const money = (amount: number, currency = 'INR') => ({ amount, currency });
export type PriceUnit = 'piece' | 'bag' | 'kg';
export type ServiceId = 'wash-fold' | 'wash-iron' | 'dry-cleaning' | 'premium-care';
export type CatalogRow = {
  category_id: string; service: ServiceId; category_name: string;
  item_id: string | null; item_name: string | null; description: string | null;
  price: number | null; currency: string | null; unit: PriceUnit | null; icon_key: string | null;
};
export type CatalogCategory = {
  id: string; service: ServiceId; name: string;
  items: Array<{ id: string; name: string; description: string | null;
    price: {amount: number; currency: string}; unit: PriceUnit; iconKey: string }>;
};
export const toCatalog = (rows: CatalogRow[]): CatalogCategory[] => {
    const categories = new Map<string, CatalogCategory>();
    for (const row of rows) {
        let category = categories.get(row.category_id);
        if (!category) {
            category = {
                id: row.category_id,
                service: row.service,
                name: row.category_name,
                items: [],
            };
            categories.set(row.category_id, category);
        }
        // The left join yields one null-item row for an empty category.
        if (row.item_id) {
            category.items.push({
                id: row.item_id,
                name: row.item_name ?? '',
                description: row.description,
                price: money(row.price ?? 0, row.currency ?? 'INR'),
                unit: (row.unit ?? 'piece') as PriceUnit,
                iconKey: row.icon_key ?? 'shirt',
            });
        }
    }
    return [...categories.values()];
};
