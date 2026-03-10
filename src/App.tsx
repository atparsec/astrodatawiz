import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import { toPng } from "html-to-image";
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import {
  DefaultButton,
  Dropdown,
  MessageBar,
  MessageBarType,
  Nav,
  Pivot,
  PivotItem,
  PrimaryButton,
  ThemeProvider,
  createTheme,
} from "@fluentui/react";
import type { IDropdownOption, INavLinkGroup } from "@fluentui/react";
import { AggregateSection } from "./components/sections/AggregateSection";
import { ChartsSection } from "./components/sections/ChartsSection";
import { DataSection } from "./components/sections/DataSection";
import { SkySection } from "./components/sections/SkySection";
import { SqlSection } from "./components/sections/SqlSection";
import {
  addFormulaColumn,
  aggregateColumns,
  applyFilters,
  applyTransform,
  datasetFromFile,
  sanitizeTableName,
} from "./lib/dataUtils";
import { executeSql } from "./lib/sqlUtils";
import type {
  ChartBackgroundMode,
  ChartConfig,
  ColumnFilter,
  Dataset,
  TransformDefinition,
  TransformName,
  TRefMode,
} from "./types";

type TabKey = "data" | "sql" | "charts" | "aggregate" | "sky";

interface TransformStep {
  id: string;
  datasetId: string;
  columns: string[];
  transform: TransformName;
  referenceMode?: TRefMode;
  referenceColumn?: string;
  referenceValue?: string;
}

interface SkySurveyOption {
  id: string;
  label: string;
}

const FILTER_OPERATORS: Array<{
  value: ColumnFilter["operator"];
  label: string;
}> = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "between", label: "between" },
  { value: "contains", label: "contains" },
];

const TRANSFORMS: TransformDefinition[] = [
  { name: "none", label: "none", referenceNeed: "none" },
  { name: "ln", label: "Ln", referenceNeed: "none" },
  {
    name: "log",
    label: "Log (base ref)",
    referenceNeed: "optional",
    defaultReferenceValue: "10",
  },
  {
    name: "root",
    label: "Root (degree ref)",
    referenceNeed: "optional",
    defaultReferenceValue: "2",
  },
  { name: "square", label: "^2", referenceNeed: "none" },
  {
    name: "exp",
    label: "Exp (base ref)^x",
    referenceNeed: "optional",
    defaultReferenceValue: String(Math.E),
  },
  {
    name: "pow",
    label: "x^(power ref)",
    referenceNeed: "optional",
    defaultReferenceValue: "2",
  },
  { name: "inv", label: "Inverse", referenceNeed: "none" },
  {
    name: "mag_to_int",
    label: "Magnitude to Intensity",
    referenceNeed: "none",
  },
  {
    name: "int_to_mag",
    label: "Intensity to Magnitude",
    referenceNeed: "optional",
    defaultReferenceValue: "1",
  },
  { name: "neg", label: "Negative", referenceNeed: "none" },
  { name: "abs", label: "Absolute Value", referenceNeed: "none" },
  { name: "floor", label: "Floor", referenceNeed: "none" },
  { name: "ceil", label: "Ceil", referenceNeed: "none" },
  {
    name: "precision",
    label: "Precision",
    referenceNeed: "required",
    defaultReferenceValue: "2",
  },
];

const moveReferenceColumnToEnd = (
  columns: string[],
  referenceMode: TRefMode,
  referenceColumn?: string,
): string[] => {
  if (referenceMode !== "column" || !referenceColumn) return columns;
  if (!columns.includes(referenceColumn)) return columns;
  return [...columns.filter((c) => c !== referenceColumn), referenceColumn];
};

const SERIES_PALETTE = [
  "#00F5FF",
  "#FF3B3B",
  "#C44DFF",
  "#39FF14",
  "#FFD300",
  "#00A6FF",
  "#FF7A00",
  "#FF2FB2",
  "#2979FF",
  "#00E5FF",
  "#66FF66",
  "#B026FF",
];

const FALLBACK_SURVEYS: SkySurveyOption[] = [
  { id: "P/DSS2/color", label: "DSS2 Color" },
  { id: "P/2MASS/color", label: "2MASS Color" },
  { id: "P/allWISE/color", label: "AllWISE Color" },
  { id: "P/PanSTARRS/DR1/color-z-zg-g", label: "Pan-STARRS DR1 Color" },
  { id: "CDS/P/GALEXGR6/AIS/color", label: "GALEX AIS Color" },
];

const makeChartTitle = (type: ChartConfig["type"], yColumns: string[]) =>
  `${type.toUpperCase()} · ${yColumns.length ? yColumns.join(", ") : "Untitled"}`;

const defaultResolutionForSize = (size: number): number => {
  if (size < 500) return 1;
  if (size < 1500) return 0.5;
  return 0.2;
};

const clampResolution = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.1, value));
};

const dataUrlToBlob = (dataUrl: string): Blob => {
  const [header, base64Data] = dataUrl.split(",");
  const mimeMatch = /data:(.*?);base64/.exec(header ?? "");
  const mime = mimeMatch?.[1] ?? "image/png";
  const bytes = atob(base64Data);
  const buf = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 1) {
    buf[i] = bytes.charCodeAt(i);
  }
  return new Blob([buf], { type: mime });
};

const sampleRowsByResolution = (
  rows: Array<Record<string, unknown> & { __index: number }>,
  xKey: string,
  resolution: number,
) => {
  const safeResolution = clampResolution(resolution);
  if (safeResolution >= 1 || rows.length <= 2) return rows;

  const step = Math.max(1, Math.round(1 / safeResolution));
  const sorted = [...rows].sort((a, b) => {
    const ax = Number(a[xKey]);
    const bx = Number(b[xKey]);
    if (Number.isFinite(ax) && Number.isFinite(bx)) return ax - bx;
    return Number(a.__index) - Number(b.__index);
  });

  const sampled = sorted.filter((_, idx) => idx % step === 0);
  const last = sorted[sorted.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }

  return sampled;
};

const computeNumericYDomain = (
  values: number[],
): [number, number] | undefined => {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return undefined;
  const min = Math.min(...finite);
  const max = Math.max(...finite);
  if (min === max) {
    const pad = Math.max(1, Math.abs(min) * 0.05);
    return [min - pad, max + pad];
  }
  const span = max - min;
  const pad = span * 0.05;
  return [min - pad, max + pad];
};

const formatChartNum = (value: number | string | unknown): string => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : String(value ?? "");
};

const chartBackgroundColor = (mode?: ChartBackgroundMode): string =>
  mode === "light" ? "#ffffff" : "#0f1117";

const darkTheme = createTheme({
  palette: {
    themePrimary: "#ff2b2b",
    themeDarkAlt: "#ff5b24",
    themeDark: "#b74f00",
    themeDarker: "#8e0a0a",
    themeLight: "#ff6767",
    themeLighter: "#ffb3b3",
    themeLighterAlt: "#2a0707",
    neutralLighterAlt: "#171114",
    neutralLighter: "#1d1519",
    neutralLight: "#2a1f24",
    neutralQuaternaryAlt: "#33242b",
    neutralQuaternary: "#423039",
    neutralTertiaryAlt: "#5a434f",
    neutralTertiary: "#8a6978",
    neutralSecondary: "#e2e8f0",
    neutralPrimaryAlt: "#f1f5f9",
    neutralPrimary: "#f8fafc",
    neutralDark: "#ffffff",
    black: "#ffffff",
    white: "#0a0d14",
  },
  semanticColors: {
    bodyBackground: "#000000",
    bodyText: "#ffffff",
    bodyFrameBackground: "#000000",
    bodyFrameDivider: "#000000",
    inputBackground: "#000000",
    inputBorder: "#6b3f4d",
    focusBorder: "#ff2b2b",
    smallInputBorder: "#6b3f4d",
    buttonBackground: "transparent",
    buttonBackgroundHovered: "rgba(255, 43, 43, 0.18)",
    buttonText: "#f8fafc",
    buttonTextHovered: "#ffffff",
    primaryButtonBackground: "transparent",
    primaryButtonBackgroundHovered: "rgba(255, 43, 43, 0.2)",
    primaryButtonText: "#ffb4b4",
  },
});

const lightTheme = createTheme({
  palette: {
    themePrimary: "#c81414",
    themeDarkAlt: "#b41212",
    themeDark: "#9d1010",
    themeDarker: "#6f0a0a",
    themeLight: "#df4a4a",
    themeLighter: "#f5a1a1",
    themeLighterAlt: "#fff2f2",
    neutralLighterAlt: "#f8fafc",
    neutralLighter: "#f1f5f9",
    neutralLight: "#e2e8f0",
    neutralQuaternaryAlt: "#e1cbcb",
    neutralQuaternary: "#d5b8b8",
    neutralTertiaryAlt: "#b89494",
    neutralTertiary: "#8b6464",
    neutralSecondary: "#553333",
    neutralPrimaryAlt: "#3b1e1e",
    neutralPrimary: "#2a0f0f",
    neutralDark: "#200b0b",
    black: "#000000",
    white: "#ffffff",
  },
  semanticColors: {
    bodyBackground: "#f7fafc",
    bodyText: "#0f172a",
    bodyFrameBackground: "#ffffff",
    bodyFrameDivider: "#cbd5e1",
    inputBackground: "#ffffff",
    inputBorder: "#b89494",
    focusBorder: "#c81414",
    smallInputBorder: "#94a3b8",
    buttonBackground: "transparent",
    buttonBackgroundHovered: "rgba(200, 20, 20, 0.12)",
    buttonText: "#0f172a",
    buttonTextHovered: "#020617",
    primaryButtonBackground: "transparent",
    primaryButtonBackgroundHovered: "rgba(200, 20, 20, 0.18)",
    primaryButtonText: "#9d1010",
  },
});

function App() {
  const [tab, setTab] = useState<TabKey>("data");
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [activeDatasetId, setActiveDatasetId] = useState<string>("");
  const [errors, setErrors] = useState<string[]>([]);

  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [newFilter, setNewFilter] = useState<ColumnFilter>({
    column: "",
    operator: "eq",
    value: "",
    secondValue: "",
  });

  const [transformCfg, setTransformCfg] = useState<{
    transform: TransformName;
    referenceMode: TRefMode;
    referenceColumn?: string;
    referenceValue?: string;
  }>({
    transform: "none",
    referenceMode: "column",
  });
  const [transformColumns, setTransformColumns] = useState<string[]>([]);
  const [transformSteps, setTransformSteps] = useState<TransformStep[]>([]);
  const [draggingTransformId, setDraggingTransformId] = useState<string | null>(
    null,
  );
  const [formulaName, setFormulaName] = useState<string>("");
  const [formulaExpression, setFormulaExpression] = useState<string>("");

  const [sqlQuery, setSqlQuery] = useState<string>("");
  const [sqlRows, setSqlRows] = useState<Record<string, unknown>[]>([]);
  const [sqlColumns, setSqlColumns] = useState<string[]>([]);
  const [joinLeftId, setJoinLeftId] = useState<string>("");
  const [joinRightId, setJoinRightId] = useState<string>("");
  const [appendName, setAppendName] = useState<string>("");

  const [chartDraft, setChartDraft] = useState<Omit<ChartConfig, "id">>({
    title: "New Chart",
    sourceDatasetId: "",
    type: "scatter",
    backgroundMode: "dark",
    xColumn: "",
    yColumns: [],
    resolution: 1,
    labelColumn: "",
    valueColumn: "",
    histogramBins: 20,
    color: "#5be7ff",
    primaryColorSeries: "",
    xLabel: "",
    yLabel: "",
    xTickAngle: 0,
    yTickFormat: "",
    invertY: false,
    yOffset: 0,
    scatterDotSize: 2,
    lineWidth: 2,
    histBarSize: 24,
    showLegend: true,
  });
  const [charts, setCharts] = useState<ChartConfig[]>([]);
  const chartRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [pendingCsvFiles, setPendingCsvFiles] = useState<File[]>([]);
  const [showCsvHeaderDialog, setShowCsvHeaderDialog] = useState(false);
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    column: string;
  } | null>(null);
  const [draftCellValue, setDraftCellValue] = useState<string>("");

  const [aggColumns, setAggColumns] = useState<string[]>([]);
  const [raColumn, setRaColumn] = useState<string>("");
  const [decColumn, setDecColumn] = useState<string>("");
  const [labelColumn, setLabelColumn] = useState<string>("");
  const [detailColumns, setDetailColumns] = useState<string[]>([]);
  const [skyLoadToken, setSkyLoadToken] = useState<number>(0);
  const [skySurveyOptions, setSkySurveyOptions] =
    useState<SkySurveyOption[]>(FALLBACK_SURVEYS);
  const [selectedSkySurvey, setSelectedSkySurvey] =
    useState<string>("P/DSS2/color");
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeDataset = useMemo(
    () => datasets.find((d) => d.id === activeDatasetId) ?? null,
    [datasets, activeDatasetId],
  );

  const activeTransformSteps = useMemo(
    () => transformSteps.filter((s) => s.datasetId === activeDatasetId),
    [transformSteps, activeDatasetId],
  );

  const selectedTransformDefinition = useMemo(
    () =>
      TRANSFORMS.find((t) => t.name === transformCfg.transform) ??
      TRANSFORMS[0],
    [transformCfg.transform],
  );

  const transformedRows = useMemo(() => {
    if (!activeDataset) return [];

    let working: Dataset = {
      ...activeDataset,
      rows: activeDataset.rows.map((r) => ({ ...r })),
    };

    activeTransformSteps.forEach((step) => {
      step.columns.forEach((col) => {
        working = applyTransform(working, {
          column: col,
          transform: step.transform,
          referenceMode: step.referenceMode,
          referenceColumn: step.referenceColumn,
          referenceValue: step.referenceValue,
        });
      });
    });

    return working.rows;
  }, [activeDataset, activeTransformSteps]);

  const activeRows = useMemo(() => {
    return applyFilters(transformedRows, filters);
  }, [transformedRows, filters]);

  const syncDraftResolutionForDatasetSize = (size: number) => {
    setChartDraft((old) =>
      old.sourceDatasetId
        ? old
        : {
            ...old,
            resolution: defaultResolutionForSize(size),
          },
    );
  };

  const aliasPreview = useMemo(() => {
    const map: Record<string, string> = {};
    datasets.forEach((ds, idx) => {
      map[ds.id] = sanitizeTableName(ds.name, idx);
    });
    return map;
  }, [datasets]);

  const chartSourceDataset = useMemo(() => {
    const sourceId = chartDraft.sourceDatasetId || activeDatasetId;
    return datasets.find((d) => d.id === sourceId) ?? null;
  }, [datasets, chartDraft.sourceDatasetId, activeDatasetId]);

  const chartSourceColumns = chartSourceDataset?.columns ?? [];
  const activeColumns = useMemo(
    () => activeDataset?.columns ?? [],
    [activeDataset],
  );

  const fluentTheme = useMemo(
    () => (isDarkTheme ? darkTheme : lightTheme),
    [isDarkTheme],
  );

  const datasetOptions = useMemo<IDropdownOption[]>(
    () => [
      { key: "", text: "Select dataset..." },
      ...datasets.map((d) => ({
        key: d.id,
        text: `${d.name} (${d.rows.length} rows)`,
      })),
    ],
    [datasets],
  );

  const navLinks = useMemo<INavLinkGroup[]>(
    () => [
      {
        links: [
          { key: "data", name: "DATA", url: "#", icon: "Database" },
          { key: "sql", name: "SQL", url: "#", icon: "Code" },
          { key: "charts", name: "CHARTS", url: "#", icon: "AreaChart" },
          {
            key: "aggregate",
            name: "AGGREGATE",
            url: "#",
            icon: "BarChartVertical",
          },
          { key: "sky", name: "SKY", url: "#", icon: "World" },
        ],
      },
    ],
    [],
  );

  const guessedRaColumn = useMemo(
    () =>
      activeColumns.find((c) => c.trim().toLowerCase().startsWith("ra")) ?? "",
    [activeColumns],
  );
  const guessedDecColumn = useMemo(
    () =>
      activeColumns.find((c) => c.trim().toLowerCase().startsWith("dec")) ?? "",
    [activeColumns],
  );
  const guessedLabelColumn = useMemo(
    () =>
      activeColumns.find((c) => /^(name|object|obj|source|id)/i.test(c)) ?? "",
    [activeColumns],
  );

  const effRACol =
    raColumn && activeColumns.includes(raColumn) ? raColumn : guessedRaColumn;
  const effDecCol =
    decColumn && activeColumns.includes(decColumn)
      ? decColumn
      : guessedDecColumn;
  const effLabelCol =
    labelColumn && activeColumns.includes(labelColumn)
      ? labelColumn
      : guessedLabelColumn;
  const effectiveDetailColumns = useMemo(
    () => detailColumns.filter((c) => activeColumns.includes(c)),
    [detailColumns, activeColumns],
  );

  useEffect(() => {
    let mounted = true;

    const loadSurveys = async () => {
      try {
        const response = await fetch(
          "https://aladin.cds.unistra.fr/hips/list?fmt=json",
        );
        if (!response.ok) return;

        const data = (await response.json()) as Array<Record<string, unknown>>;
        const parsedRaw: SkySurveyOption[] = data
          .map((d) => {
            const id = String(d.ID ?? d.id ?? "").trim();
            const title = String(
              d.obs_title ?? d.obs_collection ?? d.publisher_did ?? id,
            ).trim();
            return id ? { id, label: `${title} (${id})` } : null;
          })
          .filter((v): v is SkySurveyOption => v !== null);

        const deduped = Array.from(
          new Map(parsedRaw.map((s) => [s.id, s])).values(),
        );

        if (!mounted || deduped.length === 0) return;
        setSkySurveyOptions(deduped);
      } catch {
        console.warn("Failed to load sky surveys, using fallback list.");
      }
    };

    loadSurveys();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredSkySurveys = useMemo(() => {
    const q = selectedSkySurvey.trim().toLowerCase();
    if (!q) return skySurveyOptions.slice(0, 400);
    return skySurveyOptions
      .filter(
        (s) =>
          s.label.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
      )
      .slice(0, 400);
  }, [skySurveyOptions, selectedSkySurvey]);

  const resolvedSkySurveyId = useMemo(() => {
    const q = selectedSkySurvey.trim().toLowerCase();
    if (!q) return "P/DSS2/color";

    const exactId = skySurveyOptions.find((s) => s.id.toLowerCase() === q);
    if (exactId) return exactId.id;

    const exactLabel = skySurveyOptions.find(
      (s) => s.label.toLowerCase() === q,
    );
    if (exactLabel) return exactLabel.id;

    const contains = skySurveyOptions.find(
      (s) =>
        s.id.toLowerCase().includes(q) || s.label.toLowerCase().includes(q),
    );
    return contains?.id ?? selectedSkySurvey;
  }, [skySurveyOptions, selectedSkySurvey]);

  const aggResults = useMemo(
    () => aggregateColumns(activeRows, aggColumns),
    [activeRows, aggColumns],
  );
  const aggRowsForTable = useMemo(
    () => aggResults.map((r) => ({ ...r }) as Record<string, unknown>),
    [aggResults],
  );

  const seriesColor = (i: number, preferred?: string) => {
    if (i === 0 && preferred) return preferred;
    const offset = preferred ? 1 : 0;
    return SERIES_PALETTE[(i + offset) % SERIES_PALETTE.length];
  };

  const buildHistogramData = (
    rows: Record<string, unknown>[],
    column: string,
    bins = 20,
  ) => {
    const values = rows
      .map((r) => Number(r[column]))
      .filter((n) => Number.isFinite(n));
    if (values.length === 0) return [] as Array<{ bin: string; count: number }>;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const width = max === min ? 1 : (max - min) / bins;
    const counts = Array.from({ length: bins }, () => 0);

    values.forEach((v) => {
      const raw = Math.floor((v - min) / width);
      const idx = Math.min(bins - 1, Math.max(0, raw));
      counts[idx] += 1;
    });

    return counts.map((count, i) => {
      const start = min + i * width;
      const end = start + width;
      return { bin: `${start.toFixed(2)}-${end.toFixed(2)}`, count };
    });
  };

  const addError = (message: string) => {
    setErrors((old) => [message, ...old].slice(0, 12));
  };

  const importFiles = async (files: File[], csvHasHeader?: boolean) => {
    if (files.length === 0) return;

    try {
      const loaded = await Promise.all(
        files.map((file) =>
          datasetFromFile(
            file,
            file.name.toLowerCase().endsWith(".csv")
              ? { csvHasHeader }
              : undefined,
          ),
        ),
      );
      setDatasets((old) => [...old, ...loaded]);

      if (!activeDatasetId && loaded.length > 0) {
        setActiveDatasetId(loaded[0].id);
        syncDraftResolutionForDatasetSize(loaded[0].rows.length);
      }
      setErrors([]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed.";
      addError(msg);
    }
  };

  const onFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    const csvFiles = files.filter((f) => f.name.toLowerCase().endsWith(".csv"));
    const otherFiles = files.filter(
      (f) => !f.name.toLowerCase().endsWith(".csv"),
    );

    if (otherFiles.length > 0) {
      await importFiles(otherFiles);
    }

    if (csvFiles.length > 0) {
      setPendingCsvFiles(csvFiles);
      setShowCsvHeaderDialog(true);
    }

    event.target.value = "";
  };

  const resolveCsvHeaderChoice = async (csvHasHeader: boolean) => {
    const files = [...pendingCsvFiles];
    setPendingCsvFiles([]);
    setShowCsvHeaderDialog(false);
    await importFiles(files, csvHasHeader);
  };

  const addFilter = () => {
    if (!newFilter.column) {
      addError("Select a column for the filter first.");
      return;
    }
    setFilters((old) => [...old, newFilter]);
    setNewFilter({ column: "", operator: "eq", value: "", secondValue: "" });
  };

  const removeFilter = (index: number) => {
    setFilters((old) => old.filter((_, i) => i !== index));
  };

  const updateTransformType = (transform: TransformName) => {
    const selected =
      TRANSFORMS.find((t) => t.name === transform) ?? TRANSFORMS[0];
    const defaultReferenceValue = selected.defaultReferenceValue ?? "";
    setTransformCfg((old) => ({
      ...old,
      transform,
      ...(selected.referenceNeed === "none"
        ? { referenceColumn: undefined, referenceValue: undefined }
        : { referenceValue: defaultReferenceValue }),
    }));
  };

  const updateTransformReferenceMode = (referenceMode: TRefMode) => {
    setTransformCfg((old) => ({ ...old, referenceMode }));
    setTransformColumns((old) =>
      moveReferenceColumnToEnd(
        old,
        referenceMode,
        transformCfg.referenceColumn,
      ),
    );
  };

  const updateTransformReferenceColumn = (referenceColumn: string) => {
    setTransformCfg((old) => ({ ...old, referenceColumn }));
    setTransformColumns((old) =>
      moveReferenceColumnToEnd(
        old,
        transformCfg.referenceMode,
        referenceColumn,
      ),
    );
  };

  const updateTransformReferenceValue = (referenceValue: string) => {
    setTransformCfg((old) => ({ ...old, referenceValue }));
  };

  const addTransformStep = () => {
    if (!activeDataset) return;
    if (transformCfg.transform === "none") {
      addError("Choose a transform type before adding a step.");
      return;
    }
    if (transformColumns.length === 0) {
      addError("Select one or more columns for the transform step.");
      return;
    }

    const selected =
      TRANSFORMS.find((t) => t.name === transformCfg.transform) ??
      TRANSFORMS[0];
    const needsReference = selected.referenceNeed !== "none";
    const referenceMode = needsReference
      ? transformCfg.referenceMode
      : undefined;
    const referenceValue =
      transformCfg.referenceValue?.trim() ||
      selected.defaultReferenceValue?.trim() ||
      "";

    if (selected.referenceNeed === "required") {
      if (referenceMode === "column" && !transformCfg.referenceColumn) {
        addError("Select a reference column for this transform.");
        return;
      }
      if (referenceMode === "value" && referenceValue === "") {
        addError("Enter a reference value for this transform.");
        return;
      }
    }

    const step: TransformStep = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      datasetId: activeDataset.id,
      columns: transformColumns,
      transform: transformCfg.transform,
      referenceMode,
      referenceColumn:
        referenceMode === "column" ? transformCfg.referenceColumn : undefined,
      referenceValue:
        referenceMode === "value" && referenceValue !== ""
          ? referenceValue
          : undefined,
    };

    setTransformSteps((old) => [...old, step]);
    setTransformColumns([]);
  };

  const removeTransformStep = (stepId: string) => {
    setTransformSteps((old) => old.filter((s) => s.id !== stepId));
  };

  const toggleTransformColumn = (column: string, checked: boolean) => {
    setTransformColumns((old) =>
      moveReferenceColumnToEnd(
        checked
          ? Array.from(new Set([...old, column]))
          : old.filter((c) => c !== column),
        transformCfg.referenceMode,
        transformCfg.referenceColumn,
      ),
    );
  };

  const moveTransformColumn = (column: string, direction: "up" | "down") => {
    setTransformColumns((old) => {
      const idx = old.indexOf(column);
      if (idx < 0) return old;

      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= old.length) return old;

      const reordered = [...old];
      const [moved] = reordered.splice(idx, 1);
      reordered.splice(target, 0, moved);
      return reordered;
    });
  };

  const reorderTransformColumns = (
    dragColumn: string,
    targetColumn: string,
  ) => {
    if (dragColumn === targetColumn) return;

    setTransformColumns((old) => {
      const from = old.indexOf(dragColumn);
      const to = old.indexOf(targetColumn);
      if (from < 0 || to < 0) return old;

      const reordered = [...old];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      return reordered;
    });
  };

  const reorderTransformSteps = (dragId: string, targetId: string) => {
    if (dragId === targetId) return;

    setTransformSteps((old) => {
      const active = old.filter((s) => s.datasetId === activeDatasetId);
      const rest = old.filter((s) => s.datasetId !== activeDatasetId);
      const from = active.findIndex((s) => s.id === dragId);
      const to = active.findIndex((s) => s.id === targetId);
      if (from < 0 || to < 0) return old;

      const reordered = [...active];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      return [...rest, ...reordered];
    });
  };

  const applyFormulaToActive = () => {
    if (!activeDataset) return;
    if (!formulaName || !formulaExpression) {
      addError("Formula column name and expression are both required.");
      return;
    }

    try {
      const updated = addFormulaColumn(
        activeDataset,
        formulaName,
        formulaExpression,
      );
      setDatasets((old) =>
        old.map((d) => (d.id === activeDataset.id ? updated : d)),
      );
      setFormulaName("");
      setFormulaExpression("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Formula error";
      addError(msg);
    }
  };

  const runSql = () => {
    if (!sqlQuery.trim()) {
      addError("SQL query cannot be empty.");
      return;
    }

    try {
      const out = executeSql(sqlQuery, datasets);
      setSqlRows(out.rows);
      setSqlColumns(out.rows.length > 0 ? Object.keys(out.rows[0]) : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SQL query failed.";
      addError(msg);
    }
  };

  const loadJoinTemplate = () => {
    if (!joinLeftId || !joinRightId) {
      addError("Select left and right tables to generate a JOIN template.");
      return;
    }
    const leftAlias = aliasPreview[joinLeftId];
    const rightAlias = aliasPreview[joinRightId];
    setSqlQuery(
      `SELECT l.*, r.*\nFROM [${leftAlias}] l\nJOIN [${rightAlias}] r ON l.<key> = r.<key>\nLIMIT 200;`,
    );
  };

  const appendTables = () => {
    if (!joinLeftId || !joinRightId) {
      addError("Select two datasets to append.");
      return;
    }

    const left = datasets.find((d) => d.id === joinLeftId);
    const right = datasets.find((d) => d.id === joinRightId);
    if (!left || !right) {
      addError("Unable to find selected datasets for append.");
      return;
    }

    const columns = Array.from(new Set([...left.columns, ...right.columns]));
    const normalize = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      columns.forEach((c) => {
        out[c] = row[c] ?? null;
      });
      return out;
    };

    const rows = [...left.rows.map(normalize), ...right.rows.map(normalize)];
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const name =
      appendName.trim() ||
      `${left.name.replace(/\.[^.]+$/, "")}_append_${right.name.replace(/\.[^.]+$/, "")}`;

    const merged: Dataset = {
      id,
      name,
      sourceType: "sql",
      columns,
      rows,
    };

    setDatasets((old) => [...old, merged]);
    setActiveDatasetId(id);
    setAppendName("");
  };

  const saveSqlResultAsDataset = () => {
    if (sqlRows.length === 0) return;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const ds: Dataset = {
      id,
      name: `sql_result_${datasets.length + 1}`,
      sourceType: "sql",
      columns: sqlColumns,
      rows: sqlRows,
    };
    setDatasets((old) => [...old, ds]);
    setActiveDatasetId(id);
  };

  const addChart = () => {
    const sourceId = chartDraft.sourceDatasetId || activeDatasetId;
    if (!sourceId) {
      addError("Select a source dataset for the chart.");
      return;
    }

    if (
      (chartDraft.type === "scatter" || chartDraft.type === "line") &&
      (!chartDraft.xColumn || chartDraft.yColumns.length === 0)
    ) {
      addError(
        "Scatter/line charts need one X column and at least one Y series.",
      );
      return;
    }

    if (chartDraft.type === "histogram" && !chartDraft.valueColumn) {
      addError("Histogram charts need one numeric value column.");
      return;
    }

    if (
      chartDraft.type === "pie" &&
      (!chartDraft.labelColumn || !chartDraft.valueColumn)
    ) {
      addError("Pie charts need a label column and a value column.");
      return;
    }
    const id = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setCharts((old) => [
      ...old,
      {
        ...chartDraft,
        sourceDatasetId: sourceId,
        id,
        title:
          chartDraft.title ||
          makeChartTitle(chartDraft.type, chartDraft.yColumns),
      },
    ]);
  };

  const updateChartSource = (datasetId: string) => {
    const source = datasets.find((d) => d.id === datasetId);
    const defaultResolution = defaultResolutionForSize(
      source?.rows.length ?? 0,
    );
    setChartDraft((old) => ({
      ...old,
      sourceDatasetId: datasetId,
      xColumn: "",
      yColumns: [],
      resolution: defaultResolution,
      labelColumn: "",
      valueColumn: "",
      primaryColorSeries: "",
    }));
  };

  const updateChartXColumn = (xColumn: string) => {
    const sourceId = chartDraft.sourceDatasetId || activeDatasetId;
    const cols = datasets.find((d) => d.id === sourceId)?.columns ?? [];
    const yColumns = cols.filter((c) => c !== xColumn);
    setChartDraft((old) => ({
      ...old,
      xColumn,
      yColumns,
      primaryColorSeries: yColumns[0] ?? "",
    }));
  };

  const toggleSeriesColumn = (column: string, checked: boolean) => {
    setChartDraft((old) => {
      const next = checked
        ? Array.from(new Set([...old.yColumns, column]))
        : old.yColumns.filter((c) => c !== column);
      const currentPrimary = old.primaryColorSeries;
      const primaryColorSeries =
        currentPrimary && next.includes(currentPrimary)
          ? currentPrimary
          : (next[0] ?? "");
      return { ...old, yColumns: next, primaryColorSeries };
    });
  };

  const startCellEdit = (rowIndex: number, column: string, value: unknown) => {
    setEditingCell({ rowIndex, column });
    setDraftCellValue(String(value ?? ""));
  };

  const commitCellEdit = () => {
    if (!activeDataset || !editingCell) return;
    const { rowIndex, column } = editingCell;
    const nextValue: unknown = draftCellValue;

    const updatedRows = activeDataset.rows.map((row, i) =>
      i === rowIndex ? { ...row, [column]: nextValue } : row,
    );
    const updated: Dataset = { ...activeDataset, rows: updatedRows };
    setDatasets((old) => old.map((d) => (d.id === updated.id ? updated : d)));
    setEditingCell(null);
  };

  const cancelCellEdit = () => {
    setEditingCell(null);
    setDraftCellValue("");
  };

  const addEmptyRow = () => {
    if (!activeDataset) return;
    const row: Record<string, unknown> = {};
    activeDataset.columns.forEach((c) => {
      row[c] = "";
    });
    const updated: Dataset = {
      ...activeDataset,
      rows: [...activeDataset.rows, row],
    };
    setDatasets((old) => old.map((d) => (d.id === updated.id ? updated : d)));
  };

  const addEmptyColumn = () => {
    if (!activeDataset) return;
    const baseName = `Column_${activeDataset.columns.length + 1}`;
    let name = baseName;
    let i = 2;
    while (activeDataset.columns.includes(name)) {
      name = `${baseName}_${i}`;
      i += 1;
    }

    const updated: Dataset = {
      ...activeDataset,
      columns: [...activeDataset.columns, name],
      rows: activeDataset.rows.map((row) => ({ ...row, [name]: "" })),
    };

    setDatasets((old) => old.map((d) => (d.id === updated.id ? updated : d)));
  };

  const toggleAggColumn = (column: string, checked: boolean) => {
    setAggColumns((old) =>
      checked
        ? Array.from(new Set([...old, column]))
        : old.filter((c) => c !== column),
    );
  };

  const toggleDetailColumn = (column: string, checked: boolean) => {
    setDetailColumns((old) =>
      checked
        ? Array.from(new Set([...old, column]))
        : old.filter((c) => c !== column),
    );
  };

  const removeChart = (id: string) => {
    setCharts((old) => old.filter((c) => c.id !== id));
    delete chartRefs.current[id];
  };

  const toggleChartBackgroundMode = (id: string) => {
    setCharts((old) =>
      old.map((chart) =>
        chart.id === id
          ? {
              ...chart,
              backgroundMode:
                chart.backgroundMode === "light" ? "dark" : "light",
            }
          : chart,
      ),
    );
  };

  const registerChartRef = (id: string, graphDiv: HTMLDivElement | null) => {
    chartRefs.current[id] = graphDiv;
  };

  const exportChartImage = async (chartId: string) => {
    const graphDiv = chartRefs.current[chartId];
    if (!graphDiv) return;
    const chart = charts.find((c) => c.id === chartId);
    const image = await toPng(graphDiv, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: chartBackgroundColor(chart?.backgroundMode),
    });
    saveAs(dataUrlToBlob(image), `${chartId}.png`);
  };

  const exportAllCharts = async () => {
    const zip = new JSZip();
    const ids = Object.keys(chartRefs.current);

    for (const id of ids) {
      const graphDiv = chartRefs.current[id];
      if (!graphDiv) continue;
      const chart = charts.find((c) => c.id === id);
      const image = await toPng(graphDiv, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: chartBackgroundColor(chart?.backgroundMode),
      });
      zip.file(`${id}.png`, dataUrlToBlob(image));
    }

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, "charts.zip");
  };

  const exportRowsAsCsv = (
    rows: Record<string, unknown>[],
    fileName: string,
  ) => {
    const csv = Papa.unparse(rows);
    saveAs(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName);
  };

  const getChartRows = (chart: ChartConfig) => {
    const source = datasets.find((d) => d.id === chart.sourceDatasetId);
    if (!source) return [];
    if (source.id === activeDatasetId) {
      return activeRows;
    }
    return source.rows;
  };

  const getChartColumns = (chart: ChartConfig): string[] => {
    const source = datasets.find((d) => d.id === chart.sourceDatasetId);
    return source?.columns ?? [];
  };

  const renderChart = (chart: ChartConfig) => {
    const rows = getChartRows(chart);
    const xKey = chart.xColumn || "__index";
    const fullData: Array<Record<string, unknown> & { __index: number }> =
      rows.map((row, idx) => ({
        ...row,
        __index: idx + 1,
      }));
    const chartResolution = clampResolution(
      chart.resolution ?? defaultResolutionForSize(rows.length),
    );
    const sampledData =
      chart.type === "line" || chart.type === "scatter"
        ? sampleRowsByResolution(fullData, xKey, chartResolution)
        : fullData;
    const data = sampledData;
    const color = chart.color ?? "#5be7ff";
    const isLightBackground = chart.backgroundMode === "light";
    const themeTextColor = isLightBackground ? "#0f172a" : "#dce8ff";
    const themeGridColor = isLightBackground ? "#d8dee9" : "#23314d";
    const themeCanvasBorder = isLightBackground ? "#b8c3d6" : "#3b475e";
    const themeTooltipBg = isLightBackground ? "#ffffff" : "#111827";
    const chartCanvasClassName = `chart-canvas ${
      isLightBackground ? "chart-canvas-light" : "chart-canvas-dark"
    }`;
    const tooltipStyle = {
      backgroundColor: themeTooltipBg,
      border: `1px solid ${themeCanvasBorder}`,
      color: themeTextColor,
    };
    const effectivePrimarySeries =
      chart.primaryColorSeries &&
      chart.yColumns.includes(chart.primaryColorSeries)
        ? chart.primaryColorSeries
        : chart.yColumns[0];
    const seriesColorByColumn = (series: string, fallbackIndex: number) => {
      if (series === effectivePrimarySeries && color) return color;
      const nonPrimary = chart.yColumns.filter(
        (c) => c !== effectivePrimarySeries,
      );
      const idx = nonPrimary.indexOf(series);
      const paletteIndex = idx >= 0 ? idx : fallbackIndex;
      const offset = color ? 1 : 0;
      return SERIES_PALETTE[(paletteIndex + offset) % SERIES_PALETTE.length];
    };

    if (chart.type === "pie") {
      const labelKey = chart.labelColumn || chart.xColumn || "__index";
      const valueKey = chart.valueColumn || chart.yColumns[0];
      const pieData = data.map((d) => ({
        name: String(d[labelKey] ?? d.__index),
        value: Number(d[valueKey] ?? 0),
      }));

      return (
        <div
          className={chartCanvasClassName}
          ref={(el) => registerChartRef(chart.id, el)}
        >
          <ResponsiveContainer width="100%" height={420}>
            <PieChart>
              <Tooltip
                contentStyle={tooltipStyle}
                labelStyle={{ color: themeTextColor }}
                itemStyle={{ color: themeTextColor }}
              />
              <Legend wrapperStyle={{ color: themeTextColor }} />
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                outerRadius={135}
                label={{ fill: themeTextColor }}
              >
                {pieData.map((_, i) => (
                  <Cell key={`c-${i}`} fill={seriesColor(i, color)} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chart.type === "histogram") {
      const y = chart.valueColumn || chart.yColumns[0];
      const histData = buildHistogramData(data, y, chart.histogramBins ?? 20);
      return (
        <div
          className={chartCanvasClassName}
          ref={(el) => registerChartRef(chart.id, el)}
        >
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={histData}>
              <CartesianGrid stroke={themeGridColor} strokeDasharray="3 3" />
              <XAxis
                dataKey="bin"
                angle={chart.xTickAngle ?? 0}
                interval={0}
                height={70}
                stroke={themeTextColor}
                tick={{ fill: themeTextColor }}
              />
              <YAxis
                stroke={themeTextColor}
                tick={{ fill: themeTextColor }}
                reversed={chart.invertY}
                tickFormatter={formatChartNum as (value: number) => string}
              />
              <Tooltip
                formatter={(value) => formatChartNum(value)}
                contentStyle={tooltipStyle}
                labelStyle={{ color: themeTextColor }}
                itemStyle={{ color: themeTextColor }}
              />
              <Legend wrapperStyle={{ color: themeTextColor }} />
              <Bar
                dataKey="count"
                name={y}
                fill={color}
                barSize={chart.histBarSize ?? 24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (chart.type === "line") {
      const yOffset = chart.yOffset ?? 0;
      const lineSeries = chart.yColumns.map((yCol, i) => ({
        source: yCol,
        key: yOffset === 0 ? yCol : `__offset_${i}_${yCol}`,
      }));
      const lineData =
        yOffset === 0
          ? [...data]
          : data.map((d) => {
              const next = { ...d };
              lineSeries.forEach((series) => {
                const n = Number(d[series.source]);
                next[series.key] = Number.isFinite(n) ? n + yOffset : null;
              });
              return next;
            });
      const numericX = lineData
        .map((d) => Number(d[xKey]))
        .filter((n) => Number.isFinite(n));
      const hasNumericX =
        numericX.length > 0 && numericX.length === lineData.length;
      if (hasNumericX) {
        lineData.sort((a, b) => Number(a[xKey]) - Number(b[xKey]));
      }
      const yDomain = computeNumericYDomain(
        lineSeries.flatMap((series) =>
          lineData
            .map((row) => Number(row[series.key]))
            .filter((n) => Number.isFinite(n)),
        ),
      );
      return (
        <div
          className={chartCanvasClassName}
          ref={(el) => registerChartRef(chart.id, el)}
        >
          <ResponsiveContainer width="100%" height={420}>
            <LineChart data={lineData}>
              <CartesianGrid stroke={themeGridColor} strokeDasharray="3 3" />
              <XAxis
                dataKey={xKey}
                type={hasNumericX ? "number" : "category"}
                domain={hasNumericX ? ["dataMin", "dataMax"] : undefined}
                angle={chart.xTickAngle ?? 0}
                height={50}
                stroke={themeTextColor}
                tick={{ fill: themeTextColor }}
                tickFormatter={
                  formatChartNum as (value: number | string) => string
                }
              />
              <YAxis
                stroke={themeTextColor}
                tick={{ fill: themeTextColor }}
                reversed={chart.invertY}
                tickFormatter={formatChartNum as (value: number) => string}
                domain={yDomain ?? undefined}
              />
              <Tooltip
                formatter={(value) => formatChartNum(value)}
                contentStyle={tooltipStyle}
                labelStyle={{ color: themeTextColor }}
                itemStyle={{ color: themeTextColor }}
              />
              {chart.showLegend ? (
                <Legend wrapperStyle={{ color: themeTextColor }} />
              ) : null}
              {lineSeries.map((series, i) => (
                <Line
                  key={series.source}
                  type="monotone"
                  dataKey={series.key}
                  name={series.source}
                  stroke={seriesColorByColumn(series.source, i)}
                  dot={false}
                  strokeWidth={chart.lineWidth ?? 2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    const scatterSets = chart.yColumns.map((yCol, i) => ({
      key: yCol,
      fill: seriesColorByColumn(yCol, i),
      values: data.map((d) => ({
        x: d[xKey] as number | string,
        y: Number(d[yCol] ?? Number.NaN) + (chart.yOffset ?? 0),
      })),
    }));
    const scatterYDomain = computeNumericYDomain(
      scatterSets.flatMap((s) =>
        s.values.map((v) => Number(v.y)).filter((n) => Number.isFinite(n)),
      ),
    );

    return (
      <div
        className={chartCanvasClassName}
        ref={(el) => registerChartRef(chart.id, el)}
      >
        <ResponsiveContainer width="100%" height={420}>
          <ScatterChart>
            <CartesianGrid stroke={themeGridColor} strokeDasharray="3 3" />
            {(() => {
              const xVals = scatterSets.flatMap((s) =>
                s.values
                  .map((v) => Number(v.x))
                  .filter((n) => Number.isFinite(n)),
              );
              const hasNumericX =
                xVals.length > 0 &&
                xVals.length === scatterSets.flatMap((s) => s.values).length;
              return (
                <XAxis
                  dataKey="x"
                  type={hasNumericX ? "number" : "category"}
                  domain={hasNumericX ? ["dataMin", "dataMax"] : undefined}
                  angle={chart.xTickAngle ?? 0}
                  height={50}
                  stroke={themeTextColor}
                  tick={{ fill: themeTextColor }}
                  tickFormatter={
                    formatChartNum as (value: number | string) => string
                  }
                />
              );
            })()}
            <YAxis
              dataKey="y"
              stroke={themeTextColor}
              tick={{ fill: themeTextColor }}
              reversed={chart.invertY}
              tickFormatter={formatChartNum as (value: number) => string}
              domain={scatterYDomain ?? undefined}
            />
            <Tooltip
              formatter={(value) => formatChartNum(value)}
              contentStyle={tooltipStyle}
              labelStyle={{ color: themeTextColor }}
              itemStyle={{ color: themeTextColor }}
            />
            {chart.showLegend ? (
              <Legend wrapperStyle={{ color: themeTextColor }} />
            ) : null}
            {scatterSets.map((s) => (
              <Scatter
                key={s.key}
                data={s.values}
                name={s.key}
                fill={s.fill}
                shape={(props: { cx?: number; cy?: number; fill?: string }) => (
                  <circle
                    cx={props.cx ?? 0}
                    cy={props.cy ?? 0}
                    r={chart.scatterDotSize ?? 5}
                    fill={props.fill ?? s.fill}
                  />
                )}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const isDraftScatter = chartDraft.type === "scatter";
  const isDraftLine = chartDraft.type === "line";
  const isDraftHistogram = chartDraft.type === "histogram";
  const isDraftPie = chartDraft.type === "pie";
  const isDraftXY = isDraftScatter || isDraftLine;
  const hasDraftSeries = chartDraft.yColumns.length > 0;
  const hasTableModifiers =
    activeTransformSteps.length > 0 || filters.length > 0;

  const exportActiveRowsCsv = () => {
    exportRowsAsCsv(
      activeRows,
      `${activeDataset?.name.replace(/\.[^.]+$/, "") || "table"}_filtered.csv`,
    );
  };

  const exportSqlRowsCsv = () => {
    exportRowsAsCsv(sqlRows, "sql_result.csv");
  };

  const bumpSkyLoadToken = () => {
    setSkyLoadToken((n) => n + 1);
  };

  return (
    <ThemeProvider theme={fluentTheme}>
      <div
        className={`app-shell ${isDarkTheme ? "theme-dark" : "theme-light"}`}
      >
        <header className="app-header">
          <div>
            <h1>AstroDataWiz</h1>
          </div>
          <div className="inline-actions">
            <DefaultButton
              text={isDarkTheme ? "Dark" : "Light"}
              iconProps={{ iconName: isDarkTheme ? "ClearNight" : "Sunny" }}
              onClick={() => setIsDarkTheme((v) => !v)}
              ariaLabel="Toggle light or dark theme"
            />
            <PrimaryButton
              text="Import data"
              iconProps={{ iconName: "Upload" }}
              onClick={() => fileInputRef.current?.click()}
            />
            <input
              ref={fileInputRef}
              className="hidden-file-input"
              aria-label="Import data files"
              type="file"
              multiple
              accept=".csv,.xml,.vot,.b64"
              onChange={onFileUpload}
            />
          </div>
        </header>

        {showCsvHeaderDialog ? (
          <div className="dialog-backdrop" role="presentation">
            <div className="dialog" role="dialog" aria-modal="true">
              <h3>CSV Import</h3>
              <p>
                Should the first row be treated as column names for{" "}
                {pendingCsvFiles.length} CSV file
                {pendingCsvFiles.length === 1 ? "" : "s"}?
              </p>
              <div className="inline-actions">
                <PrimaryButton
                  text="Yes"
                  onClick={() => resolveCsvHeaderChoice(true)}
                />
                <DefaultButton
                  text="No (Use A, B, C...)"
                  onClick={() => resolveCsvHeaderChoice(false)}
                />
              </div>
            </div>
          </div>
        ) : null}

        <section className="top-controls">
          <div className="control-group">
            <label>Active Dataset</label>
            <Dropdown
              placeholder="Select dataset..."
              selectedKey={activeDatasetId}
              options={datasetOptions}
              onChange={(_, option) => {
                const id = String(option?.key ?? "");
                setActiveDatasetId(id);
                const size =
                  datasets.find((d) => d.id === id)?.rows.length ?? 0;
                syncDraftResolutionForDatasetSize(size);
              }}
            />
          </div>

          <div className="control-group wide">
            <label>Loaded Sources</label>
            <div className="dataset-list">
              {datasets.map((d) => (
                <span className="chip" key={d.id}>
                  {d.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        <div className="app-main">
          <nav className="tabs tabs-desktop">
            <Nav
              groups={navLinks}
              selectedKey={tab}
              onLinkClick={(ev, item) => {
                ev?.preventDefault();
                if (item?.key) setTab(item.key as TabKey);
              }}
            />
          </nav>

          <nav className="tabs tabs-mobile">
            <Pivot
              selectedKey={tab}
              onLinkClick={(item) =>
                setTab((item?.props.itemKey as TabKey) ?? "data")
              }
            >
              <PivotItem itemKey="data" headerText="DATA" itemIcon="Database" />
              <PivotItem itemKey="sql" headerText="SQL" itemIcon="Code" />
              <PivotItem
                itemKey="charts"
                headerText="CHARTS"
                itemIcon="AreaChart"
              />
              <PivotItem
                itemKey="aggregate"
                headerText="AGG"
                itemIcon="BarChartVertical"
              />
              <PivotItem itemKey="sky" headerText="SKY" itemIcon="World" />
            </Pivot>
          </nav>

          <div className="app-content">
            {errors.length > 0 ? (
              <section className="error-stack">
                {errors.map((err, idx) => (
                  <MessageBar
                    key={`${err}-${idx}`}
                    messageBarType={MessageBarType.error}
                    isMultiline={false}
                  >
                    {err}
                  </MessageBar>
                ))}
              </section>
            ) : null}

            {tab === "data" ? (
              <DataSection
                activeColumns={activeColumns}
                newFilter={newFilter}
                setNewFilter={setNewFilter}
                filterOperators={FILTER_OPERATORS}
                filters={filters}
                addFilter={addFilter}
                removeFilter={removeFilter}
                transforms={TRANSFORMS}
                selectedTransformDefinition={selectedTransformDefinition}
                transformCfg={transformCfg}
                onTransformTypeChange={updateTransformType}
                onTransformReferenceModeChange={updateTransformReferenceMode}
                onTransformReferenceColumnChange={
                  updateTransformReferenceColumn
                }
                onTransformReferenceValueChange={updateTransformReferenceValue}
                addTransformStep={addTransformStep}
                transformColumns={transformColumns}
                toggleTransformColumn={toggleTransformColumn}
                moveTransformColumn={moveTransformColumn}
                reorderTransformColumns={reorderTransformColumns}
                activeTransformSteps={activeTransformSteps}
                draggingTransformId={draggingTransformId}
                setDraggingTransformId={setDraggingTransformId}
                reorderTransformSteps={reorderTransformSteps}
                removeTransformStep={removeTransformStep}
                formulaName={formulaName}
                setFormulaName={setFormulaName}
                formulaExpression={formulaExpression}
                setFormulaExpression={setFormulaExpression}
                applyFormulaToActive={applyFormulaToActive}
                activeDataset={activeDataset}
                activeRows={activeRows}
                hasTableModifiers={hasTableModifiers}
                addEmptyRow={addEmptyRow}
                addEmptyColumn={addEmptyColumn}
                exportFilteredCsv={exportActiveRowsCsv}
                editingCell={editingCell}
                draftCellValue={draftCellValue}
                startCellEdit={startCellEdit}
                setDraftCellValue={setDraftCellValue}
                commitCellEdit={commitCellEdit}
                cancelCellEdit={cancelCellEdit}
              />
            ) : null}

            {tab === "sql" ? (
              <SqlSection
                datasets={datasets}
                aliasPreview={aliasPreview}
                joinLeftId={joinLeftId}
                setJoinLeftId={setJoinLeftId}
                joinRightId={joinRightId}
                setJoinRightId={setJoinRightId}
                appendName={appendName}
                setAppendName={setAppendName}
                loadJoinTemplate={loadJoinTemplate}
                appendTables={appendTables}
                sqlQuery={sqlQuery}
                setSqlQuery={setSqlQuery}
                runSql={runSql}
                saveSqlResultAsDataset={saveSqlResultAsDataset}
                exportSqlRows={exportSqlRowsCsv}
                sqlRows={sqlRows}
                sqlColumns={sqlColumns}
              />
            ) : null}

            {tab === "charts" ? (
              <ChartsSection
                chartDraft={chartDraft}
                setChartDraft={setChartDraft}
                datasets={datasets}
                chartSourceColumns={chartSourceColumns}
                isDraftScatter={isDraftScatter}
                isDraftLine={isDraftLine}
                isDraftHistogram={isDraftHistogram}
                isDraftPie={isDraftPie}
                isDraftXY={isDraftXY}
                hasDraftSeries={hasDraftSeries}
                clampResolution={clampResolution}
                updateChartSource={updateChartSource}
                updateChartXColumn={updateChartXColumn}
                toggleSeriesColumn={toggleSeriesColumn}
                addChart={addChart}
                exportAllCharts={exportAllCharts}
                charts={charts}
                exportChartImage={exportChartImage}
                removeChart={removeChart}
                toggleChartBackgroundMode={toggleChartBackgroundMode}
                getChartColumns={getChartColumns}
                getChartRows={getChartRows}
                renderChart={renderChart}
              />
            ) : null}

            {tab === "aggregate" ? (
              <AggregateSection
                activeColumns={activeColumns}
                aggColumns={aggColumns}
                toggleAggColumn={toggleAggColumn}
                aggRowsForTable={aggRowsForTable}
              />
            ) : null}

            {tab === "sky" ? (
              <SkySection
                selectedSkySurvey={selectedSkySurvey}
                setSelectedSkySurvey={setSelectedSkySurvey}
                filteredSkySurveys={filteredSkySurveys}
                skySurveyOptionsCount={skySurveyOptions.length}
                resolvedSkySurveyId={resolvedSkySurveyId}
                effRACol={effRACol}
                setRaColumn={setRaColumn}
                effDecCol={effDecCol}
                setDecColumn={setDecColumn}
                effLabelCol={effLabelCol}
                setLabelColumn={setLabelColumn}
                activeColumns={activeColumns}
                effectiveDetailColumns={effectiveDetailColumns}
                toggleDetailColumn={toggleDetailColumn}
                bumpSkyLoadToken={bumpSkyLoadToken}
                activeRows={activeRows}
                skyLoadToken={skyLoadToken}
              />
            ) : null}
          </div>
        </div>
      </div>
    </ThemeProvider>
  );
}

export default App;
