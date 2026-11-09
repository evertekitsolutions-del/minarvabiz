import { PriceUnit } from '../models/catalogModels';
import { Money, rupees } from '../models/moneyModels';
import { CURRENCY } from '../config/brandConfig';
import { unsplashImage } from '../utils/imagesUtils';
import { formatAmount } from '../utils/moneyUtils';

export type ServiceId = 'wash-fold' | 'wash-iron' | 'dry-cleaning' | 'premium-care';

export interface ServiceType {
    id: ServiceId;
    name: string;
    /** Shown in the booking flow. */
    shortDescription: string;
    /** Shown on the homepage cards, where one line is all there is room for. */
    longDescription: string;
    /** Cheapest item in the category; the catalogue prices each garment. */
    startingPrice: Money;
    unit: PriceUnit;
    image: { url: string; alt: string };
}

export const SERVICE_TYPES: ServiceType[] = [
    {
        id: 'wash-fold',
        name: 'Wash & Fold',
        shortDescription: 'Regular clothes washed, dried & neatly folded',
        longDescription: 'Everyday clothes, washed, dried, folded.',
        startingPrice: rupees(20),
        unit: 'piece',
        image: {
            url: unsplashImage('photo-1545173168-9f1947eebb7f', 800),
            alt: 'A row of washing machines in a laundromat',
        },
    },
    {
        id: 'wash-iron',
        name: 'Wash & Iron',
        shortDescription: 'Washed and professionally pressed',
        longDescription: 'Washed and crisply pressed.',
        startingPrice: rupees(30),
        unit: 'piece',
        image: {
            url: unsplashImage('photo-1582735689369-4fe89db7114c', 800),
            alt: 'A stack of pressed white shirts beside an iron',
        },
    },
    {
        id: 'dry-cleaning',
        name: 'Dry Cleaning',
        shortDescription: 'Delicate fabrics handled with care',
        longDescription: 'Delicate fabrics, handled with care.',
        startingPrice: rupees(199),
        unit: 'piece',
        image: {
            url: unsplashImage('photo-1489274495757-95c7c837b101', 800),
            alt: 'Dry-cleaned suits and jackets hanging on a rail',
        },
    },
    {
        id: 'premium-care',
        name: 'Premium Care',
        shortDescription: 'Suits, sarees, lehengas & luxury items',
        longDescription: 'Suits, sarees, lehengas, luxury items.',
        startingPrice: rupees(349),
        unit: 'piece',
        image: {
            url: unsplashImage('photo-1558769132-cb1aea458c5e', 800),
            alt: 'A luxury garment on a hanger',
        },
    },
];

export const formatPrice = ({ startingPrice, unit }: Pick<ServiceType, 'startingPrice' | 'unit'>) =>
    `${CURRENCY.symbol}${formatAmount(startingPrice)}/${unit}`;
