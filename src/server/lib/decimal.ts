import Decimal from "decimal.js";

Decimal.set({ precision: 34, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -30 });

export const QTY_DP = 4;
export const MONEY_DP = 3;

export type NumLike = Decimal.Value | null | undefined;

export function d(v: NumLike): Decimal {
  if (v === null || v === undefined || v === "") return new Decimal(0);
  return new Decimal(v);
}

export function qty(v: NumLike): Decimal {
  return d(v).toDecimalPlaces(QTY_DP, Decimal.ROUND_HALF_UP);
}

export function money(v: NumLike): Decimal {
  return d(v).toDecimalPlaces(MONEY_DP, Decimal.ROUND_HALF_UP);
}

export function add(a: NumLike, b: NumLike): string {
  return qty(d(a).plus(d(b))).toString();
}

export function sub(a: NumLike, b: NumLike): string {
  return qty(d(a).minus(d(b))).toString();
}

export function mul(a: NumLike, b: NumLike): string {
  return qty(d(a).times(d(b))).toString();
}

export function div(a: NumLike, b: NumLike): string {
  if (d(b).isZero()) return "0";
  return qty(d(a).div(d(b))).toString();
}

export function mulMoney(a: NumLike, b: NumLike): string {
  return money(d(a).times(d(b))).toString();
}

export function sum(nums: NumLike[]): Decimal {
  let acc = new Decimal(0);
  for (const n of nums) {
    acc = acc.plus(d(n));
  }
  return acc;
}

export function sumQty(nums: NumLike[]): string {
  return qty(sum(nums)).toString();
}

export function sumMoney(nums: NumLike[]): string {
  return money(sum(nums)).toString();
}

export function percent(numerator: NumLike, denominator: NumLike): string {
  const den = d(denominator);
  if (den.isZero()) return "0";
  return d(numerator).div(den).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toString();
}

export function isZero(v: NumLike): boolean {
  return d(v).isZero();
}

export function isNeg(v: NumLike): boolean {
  return d(v).isNegative();
}

export function isPos(v: NumLike): boolean {
  return d(v).isPositive();
}

export function cmp(a: NumLike, b: NumLike): number {
  return d(a).cmp(d(b));
}

export function min(a: NumLike, b: NumLike): string {
  return Decimal.min(d(a), d(b)).toDecimalPlaces(QTY_DP).toString();
}

export function max(a: NumLike, b: NumLike): string {
  return Decimal.max(d(a), d(b)).toDecimalPlaces(QTY_DP).toString();
}

export function roundQty(v: NumLike): string {
  return qty(v).toString();
}

export function roundMoney(v: NumLike): string {
  return money(v).toString();
}
