/**
 * Material intelligence for fabric/trim inventory.
 * Tracks roll-level quantity, shade/batch consistency, wastage and consumption.
 */

export interface MaterialRoll {
  id: string;
  materialId: string;
  batchId?: string | null;
  shadeCode?: string | null;
  widthMeters?: number | null;
  quantityMeters: number;
  reservedMeters: number;
  costPerMeter: number;
  receivedAt: string;
  active: boolean;
}

export interface MaterialConsumption {
  materialId: string;
  plannedMeters: number;
  actualMeters: number;
  unitCost: number;
}

export interface MaterialIntelligenceResult {
  materialId: string;
  availableMeters: number;
  reservedMeters: number;
  stockValue: number;
  wastageMeters: number;
  wastagePercent: number;
  shadeCount: number;
  batchCount: number;
  lowCoverage: boolean;
}

function nonNegative(value: number | null | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

export function availableRollMeters(roll: MaterialRoll): number {
  return Math.max(0, nonNegative(roll.quantityMeters) - nonNegative(roll.reservedMeters));
}

export function consumeMaterialRoll(roll: MaterialRoll, meters: number): { roll: MaterialRoll; consumed: number; shortage: number } {
  const requested = nonNegative(meters);
  const available = availableRollMeters(roll);
  const consumed = Math.min(requested, available);
  return {
    roll: { ...roll, quantityMeters: Math.max(0, roll.quantityMeters - consumed) },
    consumed,
    shortage: Math.max(0, requested - consumed),
  };
}

export function calculateWastage(plannedMeters: number, actualMeters: number): { wastageMeters: number; wastagePercent: number } {
  const planned = nonNegative(plannedMeters);
  const actual = nonNegative(actualMeters);
  const wastageMeters = Math.max(0, actual - planned);
  const wastagePercent = planned > 0 ? (wastageMeters / planned) * 100 : 0;
  return { wastageMeters, wastagePercent: Math.round(wastagePercent * 100) / 100 };
}

export function buildMaterialIntelligence(
  rolls: MaterialRoll[],
  consumptions: MaterialConsumption[] = [],
  minimumCoverageMeters = 10,
): MaterialIntelligenceResult[] {
  const consumptionByMaterial = new Map<string, MaterialConsumption>();
  for (const consumption of consumptions) {
    const current = consumptionByMaterial.get(consumption.materialId);
    if (current) {
      current.plannedMeters += nonNegative(consumption.plannedMeters);
      current.actualMeters += nonNegative(consumption.actualMeters);
    } else {
      consumptionByMaterial.set(consumption.materialId, {
        ...consumption,
        plannedMeters: nonNegative(consumption.plannedMeters),
        actualMeters: nonNegative(consumption.actualMeters),
      });
    }
  }

  const grouped = new Map<string, MaterialRoll[]>();
  for (const roll of rolls) {
    if (!roll.active) continue;
    const list = grouped.get(roll.materialId) ?? [];
    list.push(roll);
    grouped.set(roll.materialId, list);
  }

  return [...grouped.entries()].map(([materialId, materialRolls]) => {
    const availableMeters = materialRolls.reduce((sum, roll) => sum + availableRollMeters(roll), 0);
    const reservedMeters = materialRolls.reduce((sum, roll) => sum + nonNegative(roll.reservedMeters), 0);
    const stockValue = materialRolls.reduce((sum, roll) => sum + nonNegative(roll.quantityMeters) * nonNegative(roll.costPerMeter), 0);
    const shadeCount = new Set(materialRolls.map((roll) => roll.shadeCode).filter(Boolean)).size;
    const batchCount = new Set(materialRolls.map((roll) => roll.batchId).filter(Boolean)).size;
    const consumption = consumptionByMaterial.get(materialId);
    const wastage = consumption ? calculateWastage(consumption.plannedMeters, consumption.actualMeters) : { wastageMeters: 0, wastagePercent: 0 };
    return {
      materialId,
      availableMeters,
      reservedMeters,
      stockValue: Math.round(stockValue * 100) / 100,
      wastageMeters: wastage.wastageMeters,
      wastagePercent: wastage.wastagePercent,
      shadeCount,
      batchCount,
      lowCoverage: availableMeters <= Math.max(0, minimumCoverageMeters),
    };
  }).sort((a, b) => Number(b.lowCoverage) - Number(a.lowCoverage) || a.materialId.localeCompare(b.materialId));
}

export function sameShade(rolls: MaterialRoll[]): boolean {
  const shades = new Set(rolls.map((roll) => roll.shadeCode).filter(Boolean));
  return shades.size <= 1;
}
