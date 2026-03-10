export type Row = Record<string, unknown>;

export interface Dataset {
  id: string;
  name: string;
  sourceType: "csv" | "xml" | "vot" | "b64" | "sql";
  columns: string[];
  rows: Row[];
}

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "contains";

export interface ColumnFilter {
  column: string;
  operator: FilterOperator;
  value: string;
  secondValue?: string;
}

export type TransformName =
  | "none"
  | "ln"
  | "log10"
  | "log2"
  | "sqrt"
  | "square"
  | "exp"
  | "inv"
  | "mag_to_int"
  | "int_to_mag"
  | "neg";

export interface ColumnTransform {
  column: string;
  transform: TransformName;
  referenceColumn?: string;
}

export interface AggregationResult {
  column: string;
  count: number;
  sum?: number;
  mean?: number;
  median?: number;
  stddev?: number;
  min?: number;
  max?: number;
}

export type ChartType = "scatter" | "line" | "histogram" | "pie";
export type ChartBackgroundMode = "dark" | "light";

export interface ChartConfig {
  id: string;
  title: string;
  sourceDatasetId: string;
  type: ChartType;
  backgroundMode?: ChartBackgroundMode;
  xColumn?: string;
  yColumns: string[];
  resolution?: number;
  labelColumn?: string;
  valueColumn?: string;
  histogramBins?: number;
  color?: string;
  primaryColorSeries?: string;
  xLabel?: string;
  yLabel?: string;
  xTickAngle?: number;
  yTickFormat?: string;
  invertY?: boolean;
  yOffset?: number;
  scatterDotSize?: number;
  lineWidth?: number;
  histBarSize?: number;
  showLegend: boolean;
}
