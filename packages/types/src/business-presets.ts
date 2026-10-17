/** UBP-01: versioned, immutable business presentation presets. No permissions granted here. */
import type { BusinessGroup, BusinessCapability } from "./universal-business-profile";

export interface BusinessPreset {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly businessGroup: BusinessGroup;
  readonly defaultAddons: readonly BusinessCapability[];
}
export const BUSINESS_PRESET_VERSION = 1 as const;

const entries: readonly (readonly [BusinessGroup, string, readonly BusinessCapability[]])[] = [
  ["RETAIL", "FMCG / Kirana Stores", []], // 001
  ["RETAIL", "Fancy Stores", []], // 002
  ["RETAIL", "Gift & Toy Shops", []], // 003
  ["RETAIL", "Footwear Stores", []], // 004
  ["RETAIL", "Stationery & Bookstores", []], // 005
  ["RETAIL", "Mobile Accessories Kiosks", []], // 006
  ["RETAIL", "Bespoke Garment & Textile Outlets", []], // 007
  ["RETAIL", "Automobile Spare Parts Shops", []], // 008
  ["RETAIL", "Sports Goods & Fitness Equipment", []], // 009
  ["RETAIL", "Pet Food & Supply Shops", []], // 010
  ["RETAIL", "Fruit & Vegetable Vendors", []], // 011
  ["RETAIL", "Bicycle Sales Hubs", []], // 012
  ["RETAIL", "Computer Accessory Shops", []], // 013
  ["RETAIL", "Plasticware & Houseware Stores", []], // 014
  ["RETAIL", "Tea & Coffee Stalls (Chai Hubs)", []], // 015
  ["RETAIL", "Ice Cream Parlors", []], // 016
  ["RETAIL", "Juice Bars & Shake Hubs", []], // 017
  ["RETAIL", "Fast Food Joints", []], // 018
  ["RETAIL", "Sweet Stalls (Mithai Shops)", []], // 019
  ["RETAIL", "Paan & Cigarette Kiosks", []], // 020
  ["RETAIL", "Crockery & Utensil Shops", []], // 021
  ["RETAIL", "Innerwear & Hosiery Stores", []], // 022
  ["RETAIL", "Bag & Luggage Showrooms", []], // 023
  ["RETAIL", "Automated Laundromats", []], // 024
  ["RETAIL", "Drinking Water Vending Hubs", []], // 025
  ["RETAIL", "Military & Uniform Outlets", []], // 026
  ["RETAIL", "Pooja Stores", []], // 027
  ["RETAIL", "Baby Product Stores", []], // 028
  ["RETAIL", "Highway Rest Stops (Dhabas)", []], // 029
  ["RETAIL", "Pop-up Food Trucks", []], // 030
  ["EXPIRE_BASED", "Medical Stores / Pharmacies", []], // 031
  ["EXPIRE_BASED", "Bakeries & Confectioneries", []], // 032
  ["EXPIRE_BASED", "Fresh Meat & Poultry Counters", []], // 033
  ["EXPIRE_BASED", "Dairy Outlets & Milk Booths", []], // 034
  ["EXPIRE_BASED", "Organic Food Pharmacies", []], // 035
  ["EXPIRE_BASED", "Agro-Chemical & Seed Stores", []], // 036
  ["EXPIRE_BASED", "Poultry & Livestock Feed Outlets", []], // 037
  ["EXPIRE_BASED", "Wine & Liquor Stores", []], // 038
  ["EXPIRE_BASED", "Chemical & Solvent Suppliers", []], // 039
  ["EXPIRE_BASED", "Lab Glassware & Chemical Suppliers", []], // 040
  ["EXPIRE_BASED", "Ice Block Factories", []], // 041
  ["EXPIRE_BASED", "Ayurvedic Medicine Stores", []], // 042
  ["EXPIRE_BASED", "Seafood Processing Hubs", []], // 043
  ["EXPIRE_BASED", "Frozen Food Outlets", []], // 044
  ["EXPIRE_BASED", "Cosmetics & Beauty Supply Stores", []], // 045
  ["SERIALIZED", "Mobile Phone & Electronic Gadget Shops", []], // 046
  ["SERIALIZED", "Consumer Electronics & Appliance Stores", []], // 047
  ["SERIALIZED", "Computer & IT Peripheral Shops", []], // 048
  ["SERIALIZED", "Car & Bike Battery Dealers", []], // 049
  ["SERIALIZED", "Watch & Luxury Timepiece Boutiques", []], // 050
  ["SERIALIZED", "Tractor & Agri-Machinery Showrooms", []], // 051
  ["SERIALIZED", "Musical Instrument Stores", []], // 052
  ["SERIALIZED", "Automobile Showrooms (Two-Wheelers)", []], // 053
  ["SERIALIZED", "CCTV & Security System Integrators", ["booking"]], // 054
  ["SERIALIZED", "Water Purifier Showrooms", ["booking"]], // 055
  ["SERIALIZED", "Power Generator Outlets", []], // 056
  ["SERIALIZED", "Air Compressor Dealers", []], // 057
  ["SERIALIZED", "E-Scooter Showrooms", []], // 058
  ["SERIALIZED", "Heavy Equipment Parts Outlets", []], // 059
  ["SERIALIZED", "High-End Sneaker & Hypebeast Resale Hubs", []], // 060
  ["DIMENSIONAL", "Hardware & Power Tool Stores", []], // 061
  ["DIMENSIONAL", "Paint & Wallpaper Centers", []], // 062
  ["DIMENSIONAL", "Timber Log & Wood Yards", []], // 063
  ["DIMENSIONAL", "Plywood & Decorative Laminate Merchants", []], // 064
  ["DIMENSIONAL", "Glass & Mirror Fabricators", []], // 065
  ["DIMENSIONAL", "Marble, Tile & Granite Showrooms", []], // 066
  ["DIMENSIONAL", "Electrical & Lighting Retailers", []], // 067
  ["DIMENSIONAL", "Plumbing & PVC Pipe Outlets", []], // 068
  ["DIMENSIONAL", "Curtain, Mattress & Fabric Showrooms", []], // 069
  ["DIMENSIONAL", "Sanitaryware Stores", []], // 070
  ["DIMENSIONAL", "Iron & Steel Steel Yards", []], // 071
  ["DIMENSIONAL", "Cement & Brick Depots", []], // 072
  ["DIMENSIONAL", "Wallpaper & Carpet Showrooms", []], // 073
  ["DIMENSIONAL", "Photo Framing Workshops", []], // 074
  ["DIMENSIONAL", "Scrap & Recycling Collection Stalls (Kabadiwala)", []], // 075
  ["DIMENSIONAL", "Awnings & Custom Blind Manufacturers", []], // 076
  ["DIMENSIONAL", "Hydraulic Hose Fitting Workshops", []], // 077
  ["DIMENSIONAL", "Flour Mills (Chakki Outlets)", []], // 078
  ["DIMENSIONAL", "Oil Expeller Stalls", []], // 079
  ["DIMENSIONAL", "Flex & Signboard Printing Factories", []], // 080
  ["SERVICE", "Hair Salons & Barber Shops", []], // 081
  ["SERVICE", "Beauty & Wellness Spas", []], // 082
  ["SERVICE", "Car & Bike Washing Bays", []], // 083
  ["SERVICE", "Mobile Phone Repair Kiosks", ["barcode", "serial"]], // 084
  ["SERVICE", "Computer & Laptop Service Centers", ["barcode", "serial"]], // 085
  ["SERVICE", "Home Appliance Repair Centers", []], // 086
  ["SERVICE", "Sofa Repair & Upholstery Workshops", []], // 087
  ["SERVICE", "Watch & Clock Repair Hubs", []], // 088
  ["SERVICE", "Passport Photo Studios", []], // 089
  ["SERVICE", "Notary & Typing Stalls", []], // 090
  ["SERVICE", "Plumbing, Electrical & HVAC Contracting Agencies", []], // 091
  ["SERVICE", "Sports Turf & Badminton Court Rentals", []], // 092
  ["SERVICE", "Video Game Cafés", []], // 093
  ["SERVICE", "Event Management Equipment Rentals", []], // 094
  ["SERVICE", "Pet Grooming Salons", []], // 095
  ["SERVICE", "Daycare Centers & Play Schools", []], // 096
  ["SERVICE", "Driving & Motor Training Schools", []], // 097
  ["SERVICE", "Yoga & Fitness Studios", []], // 098
  ["SERVICE", "Shared Co-working Spaces", []], // 099
  ["SERVICE", "Bicycle & E-Bike Repair Bays", []], // 100
];

export const BUSINESS_PRESETS: readonly BusinessPreset[] = Object.freeze(
  entries.map(([businessGroup, name, defaultAddons], index) => {
    const id = String(index + 1).padStart(3, "0");
    return Object.freeze({
      id,
      code: businessGroup.toLowerCase() + "_" + id,
      name,
      businessGroup,
      defaultAddons: Object.freeze([...defaultAddons]),
    });
  }),
);

const byId = new Map(BUSINESS_PRESETS.map(preset => [preset.id, preset]));
const byCode = new Map(BUSINESS_PRESETS.map(preset => [preset.code, preset]));

export function getBusinessPresetById(id: string): BusinessPreset | undefined {
  return byId.get(id);
}

export function getBusinessPresetByCode(code: string): BusinessPreset | undefined {
  return byCode.get(code);
}
