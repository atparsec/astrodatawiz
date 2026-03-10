import alasql from "alasql";
import type { Dataset, Row } from "../types";
import { sanitizeTableName } from "./dataUtils";

export interface SqlExecutionResult {
  rows: Row[];
  tableAliases: Record<string, string>;
}

export const executeSql = (
  query: string,
  datasets: Dataset[],
): SqlExecutionResult => {
  const db = new (alasql as any).Database();
  const tableAliases: Record<string, string> = {};

  datasets.forEach((ds, idx) => {
    const alias = sanitizeTableName(ds.name, idx);
    tableAliases[ds.name] = alias;
    db.exec(`CREATE TABLE [${alias}]`);
    db.tables[alias].data = ds.rows;
  });

  const result = db.exec(query);
  const rows = Array.isArray(result)
    ? (result as Row[])
    : typeof result === "number"
      ? ([{ value: result }] as Row[])
      : ([{ value: JSON.stringify(result) }] as Row[]);

  return {
    rows,
    tableAliases,
  };
};
