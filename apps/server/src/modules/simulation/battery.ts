export function hasMinimumBattery(reading: { batteryBp: number; batteryRemainder: number }, minimumBp: number): boolean {
  // remainder is consumed fractional bp (denominator 60000), carried between rides.
  return reading.batteryBp > minimumBp || (reading.batteryBp === minimumBp && reading.batteryRemainder === 0);
}
