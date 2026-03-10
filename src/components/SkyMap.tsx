import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Row } from "../types";

interface SkyMapProps {
  rows: Row[];
  raColumn?: string;
  decColumn?: string;
  labelColumn?: string;
  detailColumns?: string[];
  loadToken: number;
  surveyId?: string;
}

const ALADIN_SCRIPT_ID = "aladin-lite-script";
const ALADIN_CSS_ID = "aladin-lite-css";
const ALADIN_SCRIPT_URL =
  "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.js";
const ALADIN_CSS_URL =
  "https://aladin.cds.unistra.fr/AladinLite/api/v3/latest/aladin.min.css";

const toNumeric = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const tokenizeSexagesimal = (value: string): string[] => {
  const cleaned = value
    .trim()
    .replace(/[hHdDmMsS]/g, " ")
    .replace(/[,:]+/g, " ")
    .replace(/\s+/g, " ");
  return cleaned.split(" ").filter(Boolean);
};

const parseRA = (value: unknown): number | null => {
  const direct = toNumeric(value);
  if (direct !== null) return direct;
  if (typeof value !== "string") return null;

  const parts = tokenizeSexagesimal(value);
  if (parts.length < 2) return null;

  const hh = Number(parts[0]);
  const mm = Number(parts[1] ?? 0);
  const ss = Number(parts[2] ?? 0);
  if (![hh, mm, ss].every(Number.isFinite)) return null;

  const sign = hh < 0 ? -1 : 1;
  const absHours = Math.abs(hh) + Math.abs(mm) / 60 + Math.abs(ss) / 3600;
  return sign * absHours * 15;
};

const parseDec = (value: unknown): number | null => {
  const direct = toNumeric(value);
  if (direct !== null) return direct;
  if (typeof value !== "string") return null;

  const parts = tokenizeSexagesimal(value);
  if (parts.length < 2) return null;

  const dd = Number(parts[0]);
  const mm = Number(parts[1] ?? 0);
  const ss = Number(parts[2] ?? 0);
  if (![dd, mm, ss].every(Number.isFinite)) return null;

  const sign = /^\s*-/.test(value) || dd < 0 ? -1 : 1;
  const absDeg = Math.abs(dd) + Math.abs(mm) / 60 + Math.abs(ss) / 3600;
  return sign * absDeg;
};

const ensureAladinLoaded = async (): Promise<void> => {
  if (!document.getElementById(ALADIN_CSS_ID)) {
    const link = document.createElement("link");
    link.id = ALADIN_CSS_ID;
    link.rel = "stylesheet";
    link.href = ALADIN_CSS_URL;
    document.head.appendChild(link);
  }

  if (window.A) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(
      ALADIN_SCRIPT_ID,
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Failed to load Aladin script.")),
        {
          once: true,
        },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = ALADIN_SCRIPT_ID;
    script.src = ALADIN_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Aladin script."));
    document.body.appendChild(script);
  });
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

const isTransientAladinInitError = (error: unknown): boolean => {
  const message =
    error instanceof Error ? error.message : String(error ?? "").toLowerCase();
  return (
    message.includes("setprojection") ||
    message.includes("this.wasm") ||
    message.includes("wasm")
  );
};

const computeCircularRaSpanDeg = (ras: number[]): number => {
  if (ras.length <= 1) return 0;
  const normalized = ras
    .map((r) => ((r % 360) + 360) % 360)
    .sort((a, b) => a - b);

  let maxGap = 0;
  for (let i = 0; i < normalized.length; i += 1) {
    const curr = normalized[i];
    const next =
      i === normalized.length - 1 ? normalized[0] + 360 : normalized[i + 1];
    maxGap = Math.max(maxGap, next - curr);
  }

  return 360 - maxGap;
};

const computeFovDeg = (points: Array<{ ra: number; dec: number }>): number => {
  if (points.length <= 1) return 1;
  const ras = points.map((p) => p.ra);
  const decs = points.map((p) => p.dec);

  const raSpan = computeCircularRaSpanDeg(ras);
  const decSpan = Math.max(...decs) - Math.min(...decs);
  const span = Math.max(raSpan, decSpan);

  return Math.min(180, Math.max(0.3, span * 1.25));
};

const computeCenter = (points: Array<{ ra: number; dec: number }>) => {
  if (points.length === 0) return { ra: 0, dec: 0 };
  if (points.length === 1) return { ra: points[0].ra, dec: points[0].dec };

  const rasRad = points.map((p) => (p.ra * Math.PI) / 180);
  const x = rasRad.reduce((acc, r) => acc + Math.cos(r), 0) / rasRad.length;
  const y = rasRad.reduce((acc, r) => acc + Math.sin(r), 0) / rasRad.length;
  let raDeg = (Math.atan2(y, x) * 180) / Math.PI;
  if (raDeg < 0) raDeg += 360;

  const decDeg =
    points.reduce((acc, p) => acc + p.dec, 0) / Math.max(1, points.length);

  return { ra: raDeg, dec: decDeg };
};

export function SkyMap({
  rows,
  raColumn,
  decColumn,
  labelColumn,
  detailColumns = [],
  loadToken,
  surveyId,
}: SkyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerId = `aladin-sky-${useId().replace(/[:]/g, "")}`;
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(
    "Pick columns and click Load Sky Map.",
  );

  const points = useMemo(() => {
    if (!raColumn || !decColumn) return [];

    return rows
      .map((row) => {
        const ra = parseRA(row[raColumn]);
        const dec = parseDec(row[decColumn]);
        if (ra === null || dec === null) return null;

        const label = labelColumn ? String(row[labelColumn] ?? "") : "";
        const details =
          detailColumns
            ?.filter(Boolean)
            .map((c) => `${c}: ${String(row[c] ?? "")}`)
            .join("<br/>") || "";

        return { ra, dec, label, details };
      })
      .filter(
        (p): p is { ra: number; dec: number; label: string; details: string } =>
          p !== null,
      );
  }, [rows, raColumn, decColumn, labelColumn, detailColumns]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      if (!containerRef.current) return;
      if (loadToken <= 0) return;

      if (!raColumn || !decColumn) {
        setStatus("Select RA and Dec columns, then click Load Sky Map.");
        return;
      }

      if (points.length === 0) {
        setError(
          "No valid coordinates found. Check RA/Dec values and selected columns.",
        );
        setStatus("No points to render.");
        containerRef.current.innerHTML = "";
        return;
      }

      try {
        setStatus("Loading Aladin Lite...");
        setError(null);
        await ensureAladinLoaded();
        if (!mounted || !containerRef.current || !window.A) return;

        const center = computeCenter(points);
        const fov = computeFovDeg(points) * 3;

        let initialized = false;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < 4 && !initialized; attempt += 1) {
          try {
            if (!mounted || !containerRef.current || !window.A) return;
            containerRef.current.innerHTML = "";
            containerRef.current.id = containerId;

            const aladin = window.A.aladin(`#${containerId}`, {
              survey: surveyId || "P/DSS2/color",
              fov,
              target: `${center.ra} ${center.dec}`,
              showReticle: true,
              showFrame: true,
              showZoomControl: true,
            });

            const catalog = window.A.catalog({
              name: "Objects",
              sourceSize: 8,
              color: "#4de2ff",
              onClick: "showPopup",
              displayLabel: true,
              labelColumn: "name",
            });

            const markers = points.map((p, idx) => {
              const name = p.label || `Object ${idx + 1}`;
              if (window.A!.source) {
                return window.A!.source(p.ra, p.dec, {
                  name,
                  desc: p.details,
                });
              }
              return window.A!.marker(p.ra, p.dec, {
                popupTitle: name,
                popupDesc: p.details,
              });
            });

            catalog.addSources(markers);
            aladin.addCatalog(catalog);
            initialized = true;
          } catch (e) {
            lastError = e;
            const retryable = isTransientAladinInitError(e);
            if (!retryable || attempt >= 3) break;
            setStatus(`Finalizing Aladin engine (attempt ${attempt + 2}/4)...`);
            await sleep(350 * (attempt + 1));
          }
        }

        if (!initialized) {
          throw lastError instanceof Error
            ? lastError
            : new Error("Unable to initialize Aladin viewer.");
        }

        setError(null);
        setStatus(
          `Loaded ${points.length} sources centered at RA ${center.ra.toFixed(4)}, Dec ${center.dec.toFixed(4)} · FOV ${fov.toFixed(2)}° · ${surveyId || "P/DSS2/color"}.`,
        );
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Unable to initialize sky map.";
        setError(message);
        setStatus("Sky map failed to load.");
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, [points, loadToken, raColumn, decColumn, containerId, surveyId]);

  if (!raColumn || !decColumn) {
    return (
      <div className="panel-muted">
        Select RA/Dec columns to render the sky map.
      </div>
    );
  }

  return (
    <div className="sky-map-wrap">
      {error ? <div className="error-banner">{error}</div> : null}
      <div ref={containerRef} className="sky-map" />
      <div className="panel-muted">{status}</div>
    </div>
  );
}
