/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Ayush Agrawal
 * Source: agrayush13/laundry-lo-src@fd48e8ba2dd29b07f3487013f43fdf92f9e67920
 * api/src/http/money.ts; local type import adapted.
 * Full MIT notice: ./LICENSE
 */
import type { PriceUnit } from './catalog.js';

/** Money crosses the wire as integer minor units plus a currency, never a float. */
export interface Money {
    amount: number;
    currency: string;
}

export const money = (amount: number, currency = 'INR'): Money => ({ amount, currency });

export const moneyWithUnit = (
    amount: number,
    unit: PriceUnit,
    currency = 'INR'
): Money & { unit: PriceUnit } => ({ amount, currency, unit });
