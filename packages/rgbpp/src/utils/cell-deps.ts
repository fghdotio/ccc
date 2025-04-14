import { CellDep } from "@ckb-ccc/shell";

export function deduplicateCellDeps(cellDeps: CellDep[]): CellDep[] {
  const seen = new Set<string>();
  return cellDeps.filter((dep) => {
    const key = `${dep.outPoint.txHash}-${dep.outPoint.index.toString()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
