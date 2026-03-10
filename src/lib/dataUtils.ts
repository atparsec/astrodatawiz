import Papa from "papaparse";
import { XMLParser } from "fast-xml-parser";
import { Parser } from "expr-eval";
import type {
  AggregationResult,
  ColumnFilter,
  ColumnTransform,
  Dataset,
  FilterOperator,
  Row,
  TransformName,
} from "../types";

const expressionParser = new Parser({
  operators: {
    logical: true,
    comparison: true,
    conditional: true,
  },
});

const asArray = <T>(value: T | T[] | undefined | null): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const coerceValue = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (trimmed.toLowerCase() === "null") return null;
  if (trimmed.toLowerCase() === "true") return true;
  if (trimmed.toLowerCase() === "false") return false;
  const n = Number(trimmed);
  if (!Number.isNaN(n) && trimmed !== "") return n;
  return trimmed;
};

const getExtension = (fileName: string): Dataset["sourceType"] => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".b64")) return "b64";
  if (lower.endsWith(".vot")) return "vot";
  if (lower.endsWith(".xml")) return "xml";
  return "csv";
};

const findFirstTableNode = (node: unknown): Record<string, unknown> | null => {
  if (!node || typeof node !== "object") return null;
  const obj = node as Record<string, unknown>;
  if (obj.TABLE && typeof obj.TABLE === "object") {
    const t = obj.TABLE;
    return Array.isArray(t)
      ? (t[0] as Record<string, unknown>)
      : (t as Record<string, unknown>);
  }

  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      const nested = findFirstTableNode(value);
      if (nested) return nested;
    }
  }
  return null;
};

const parseVOTableLikeText = (
  text: string,
): { columns: string[]; rows: Row[] } => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    trimValues: true,
    parseTagValue: false,
  });

  const xmlObj = parser.parse(text) as Record<string, unknown>;
  const votable = (xmlObj.VOTABLE ?? xmlObj.votable ?? xmlObj) as Record<
    string,
    unknown
  >;
  const table = findFirstTableNode(votable);

  if (!table) {
    throw new Error("Unable to locate a TABLE node in XML/VOTable content.");
  }

  const fields = asArray<Record<string, unknown>>(
    table.FIELD as Record<string, unknown> | Record<string, unknown>[],
  );
  const columns = fields
    .map((field, idx) =>
      String(field["@_name"] ?? field["@_ID"] ?? `col_${idx}`),
    )
    .filter(Boolean);

  const tr = asArray<Record<string, unknown>>(
    (
      (table.DATA as Record<string, unknown> | undefined)?.TABLEDATA as
        | Record<string, unknown>
        | undefined
    )?.TR as Record<string, unknown> | Record<string, unknown>[] | undefined,
  );

  const rows: Row[] = tr.map((row, rowIdx) => {
    const tdValues = asArray<unknown>(
      (row as Record<string, unknown>).TD as unknown | unknown[],
    );
    const record: Row = {};

    columns.forEach((col, i) => {
      record[col] = coerceValue(tdValues[i] ?? null);
    });

    if (columns.length === 0) {
      Object.entries(row).forEach(([key, value]) => {
        if (key !== "TD") record[key] = coerceValue(value);
      });
      record.__rowIndex = rowIdx;
    }

    return record;
  });

  return { columns, rows };
};

const decodeBase64IfNeeded = (rawText: string): string => {
  if (
    rawText.includes("<VOTABLE") ||
    rawText.includes("<votable") ||
    rawText.includes("<TABLE")
  ) {
    return rawText;
  }
  try {
    const cleaned = rawText.replace(/\s+/g, "");
    return atob(cleaned);
  } catch {
    return rawText;
  }
};

const columnLetterName = (index: number): string => {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const parseCsvRows = (
  text: string,
  hasHeader: boolean,
): { columns: string[]; rows: Row[] } => {
  if (hasHeader) {
    const parsed = Papa.parse<Row>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      transform: (value) => coerceValue(value) as string,
    });

    const rows = parsed.data as Row[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return { columns, rows };
  }

  const parsed = Papa.parse<unknown[]>(text, {
    header: false,
    skipEmptyLines: true,
    dynamicTyping: true,
    transform: (value) => coerceValue(value) as string,
  });

  const matrix = parsed.data as unknown[][];
  const widest = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: widest }, (_, i) => columnLetterName(i));
  const rows: Row[] = matrix.map((row) => {
    const record: Row = {};
    columns.forEach((col, i) => {
      record[col] = row[i] ?? null;
    });
    return record;
  });

  return { columns, rows };
};

export const datasetFromFile = async (
  file: File,
  options?: { csvHasHeader?: boolean },
): Promise<Dataset> => {
  const sourceType = getExtension(file.name);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  if (sourceType === "csv") {
    const text = await file.text();
    const { columns, rows } = parseCsvRows(text, options?.csvHasHeader ?? true);

    return {
      id,
      name: file.name,
      sourceType,
      columns,
      rows,
    };
  }

  const raw = await file.text();
  const xmlLikeText = sourceType === "b64" ? decodeBase64IfNeeded(raw) : raw;
  const { columns, rows } = parseVOTableLikeText(xmlLikeText);

  return {
    id,
    name: file.name,
    sourceType,
    columns,
    rows,
  };
};

const compare = (
  left: unknown,
  operator: FilterOperator,
  right: unknown,
  right2?: unknown,
): boolean => {
  const ln = toNumber(left);
  const rn = toNumber(right);
  const rn2 = toNumber(right2);

  switch (operator) {
    case "eq":
      return String(left ?? "") === String(right ?? "");
    case "neq":
      return String(left ?? "") !== String(right ?? "");
    case "gt":
      return ln !== null && rn !== null
        ? ln > rn
        : String(left ?? "") > String(right ?? "");
    case "gte":
      return ln !== null && rn !== null
        ? ln >= rn
        : String(left ?? "") >= String(right ?? "");
    case "lt":
      return ln !== null && rn !== null
        ? ln < rn
        : String(left ?? "") < String(right ?? "");
    case "lte":
      return ln !== null && rn !== null
        ? ln <= rn
        : String(left ?? "") <= String(right ?? "");
    case "between":
      return ln !== null && rn !== null && rn2 !== null
        ? ln >= rn && ln <= rn2
        : false;
    case "contains":
      return String(left ?? "")
        .toLowerCase()
        .includes(String(right ?? "").toLowerCase());
    default:
      return true;
  }
};

export const applyFilters = (rows: Row[], filters: ColumnFilter[]): Row[] => {
  if (filters.length === 0) return rows;

  return rows.filter((row) =>
    filters.every((f) =>
      compare(
        row[f.column],
        f.operator,
        coerceValue(f.value),
        coerceValue(f.secondValue),
      ),
    ),
  );
};

const applySingleTransform = (
  value: unknown,
  transform: TransformName,
  referenceValue?: unknown,
): number | unknown => {
  const n = toNumber(value);
  if (transform === "none") return value;
  if (n === null) return value;

  switch (transform) {
    case "ln":
      return n > 0 ? Math.log(n) : Number.NaN;
    case "log10":
      return n > 0 ? Math.log10(n) : Number.NaN;
    case "log2":
      return n > 0 ? Math.log2(n) : Number.NaN;
    case "sqrt":
      return n >= 0 ? Math.sqrt(n) : Number.NaN;
    case "square":
      return n ** 2;
    case "exp":
      return Math.exp(n);
    case "inv":
      return n !== 0 ? 1 / n : Number.NaN;
    case "mag_to_int":
      return 10 ** (-n / 2.5);
    case "int_to_mag": {
      const ref = toNumber(referenceValue);
      if (ref !== null && ref > 0) {
        return -2.5 * Math.log10(n / ref);
      }
      return n > 0 ? -2.5 * Math.log10(n) : Number.NaN;
    }
    case "neg":
      return -n;
    default:
      return value;
  }
};

export const applyTransform = (
  dataset: Dataset,
  config: ColumnTransform,
): Dataset => {
  const { column, transform, referenceColumn } = config;

  const rows = dataset.rows.map((row) => ({
    ...row,
    [column]: applySingleTransform(
      row[column],
      transform,
      referenceColumn ? row[referenceColumn] : undefined,
    ),
  }));

  return {
    ...dataset,
    rows,
  };
};

export const addFormulaColumn = (
  dataset: Dataset,
  newColumn: string,
  expression: string,
): Dataset => {
  const compiled = expressionParser.parse(expression);

  const rows = dataset.rows.map((row) => {
    const scope: Record<string, number | string | boolean | null> = {};
    Object.entries(row).forEach(([key, value]) => {
      if (
        typeof value === "number" ||
        typeof value === "string" ||
        typeof value === "boolean" ||
        value === null
      ) {
        scope[key] = value;
      }
    });

    let computed: unknown = null;
    try {
      computed = compiled.evaluate(scope as unknown as Record<string, number>);
    } catch {
      computed = null;
    }

    return {
      ...row,
      [newColumn]: computed,
    };
  });

  return {
    ...dataset,
    columns: dataset.columns.includes(newColumn)
      ? dataset.columns
      : [...dataset.columns, newColumn],
    rows,
  };
};

const percentile = (arr: number[], p: number): number => {
  if (arr.length === 0) return Number.NaN;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
};

export const aggregateColumns = (
  rows: Row[],
  columns: string[],
): AggregationResult[] => {
  return columns.map((column) => {
    const values = rows
      .map((r) => toNumber(r[column]))
      .filter((v): v is number => v !== null);
    const count = values.length;

    if (count === 0) {
      return { column, count: 0 };
    }

    const sum = values.reduce((acc, n) => acc + n, 0);
    const mean = sum / count;
    const variance =
      values.reduce((acc, n) => acc + (n - mean) ** 2, 0) / count;

    return {
      column,
      count,
      sum,
      mean,
      median: percentile(values, 0.5),
      stddev: Math.sqrt(variance),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  });
};

export const sanitizeTableName = (name: string, idx: number): string => {
  const safe = name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/^\d+/, "_$&");
  return `${safe || "table"}_${idx}`;
};
