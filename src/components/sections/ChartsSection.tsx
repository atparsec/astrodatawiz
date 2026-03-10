import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  Checkbox,
  ColorPicker,
  DefaultButton,
  Dropdown,
  PrimaryButton,
  TextField,
} from "@fluentui/react";
import type { IDropdownOption } from "@fluentui/react";
import type { ChartConfig, Dataset } from "../../types";

interface ChartsSectionProps {
  chartDraft: Omit<ChartConfig, "id">;
  setChartDraft: Dispatch<SetStateAction<Omit<ChartConfig, "id">>>;
  datasets: Dataset[];
  chartSourceColumns: string[];
  isDraftScatter: boolean;
  isDraftLine: boolean;
  isDraftHistogram: boolean;
  isDraftPie: boolean;
  isDraftXY: boolean;
  hasDraftSeries: boolean;
  clampResolution: (value: number) => number;
  updateChartSource: (datasetId: string) => void;
  updateChartXColumn: (xColumn: string) => void;
  toggleSeriesColumn: (column: string, checked: boolean) => void;
  addChart: () => void;
  exportAllCharts: () => void;
  charts: ChartConfig[];
  exportChartImage: (chartId: string) => void;
  removeChart: (chartId: string) => void;
  toggleChartBackgroundMode: (chartId: string) => void;
  getChartColumns: (chart: ChartConfig) => string[];
  getChartRows: (chart: ChartConfig) => Record<string, unknown>[];
  renderChart: (chart: ChartConfig) => ReactNode;
}

export function ChartsSection({
  chartDraft,
  setChartDraft,
  datasets,
  chartSourceColumns,
  isDraftScatter,
  isDraftLine,
  isDraftHistogram,
  isDraftPie,
  isDraftXY,
  hasDraftSeries,
  clampResolution,
  updateChartSource,
  updateChartXColumn,
  toggleSeriesColumn,
  addChart,
  exportAllCharts,
  charts,
  exportChartImage,
  removeChart,
  toggleChartBackgroundMode,
  getChartColumns,
  getChartRows,
  renderChart,
}: ChartsSectionProps) {
  const datasetOptions: IDropdownOption[] = datasets.map((d) => ({
    key: d.id,
    text: d.name,
  }));
  const chartTypeOptions: IDropdownOption[] = [
    { key: "scatter", text: "Scatter" },
    { key: "line", text: "Line" },
    { key: "histogram", text: "Histogram" },
    { key: "pie", text: "Pie" },
  ];
  const sourceColumnOptions: IDropdownOption[] = chartSourceColumns.map(
    (c) => ({
      key: c,
      text: c,
    }),
  );

  return (
    <section className="panel-grid single">
      <div className="panel">
        <div className="panel-head">
          <h2>Chart Builder</h2>
          <div className="inline-actions">
            <PrimaryButton text="Chart" onClick={addChart} iconProps={{iconName: "Add"}} />
            <DefaultButton
              text="Export all (ZIP)"
              iconProps={{iconName: "Download" }}
              onClick={exportAllCharts}
              disabled={charts.length === 0}
            />
          </div>
        </div>

        <div className="chart-steps">
          <section className="chart-step">
            <h3>Step 1 · Choose source and chart</h3>
            <div className="form-grid">
              <div className="field-group">
                <label htmlFor="chart-title">Chart title</label>
                <TextField
                  id="chart-title"
                  value={chartDraft.title}
                  onChange={(_, value) =>
                    setChartDraft((old) => ({
                      ...old,
                      title: value ?? "",
                    }))
                  }
                  placeholder="e.g. Gaia brightness trend"
                />
              </div>
              <div className="field-group">
                <label htmlFor="chart-source">Source dataset</label>
                <Dropdown
                  id="chart-source"
                  placeholder="Source dataset"
                  selectedKey={chartDraft.sourceDatasetId || undefined}
                  options={datasetOptions}
                  onChange={(_, option) =>
                    updateChartSource(String(option?.key ?? ""))
                  }
                />
              </div>
              <div className="field-group">
                <label htmlFor="chart-type">Chart type</label>
                <Dropdown
                  id="chart-type"
                  selectedKey={chartDraft.type}
                  options={chartTypeOptions}
                  onChange={(_, option) =>
                    setChartDraft((old) => ({
                      ...old,
                      type: String(
                        option?.key ?? "scatter",
                      ) as ChartConfig["type"],
                    }))
                  }
                />
              </div>
            </div>
          </section>

          <section className="chart-step">
            <h3>Step 2 · Map data fields</h3>
            <div className="form-grid">
              {isDraftXY ? (
                <>
                  <div className="field-group">
                    <label htmlFor="chart-x">X column</label>
                    <Dropdown
                      id="chart-x"
                      placeholder="X Column"
                      selectedKey={chartDraft.xColumn || undefined}
                      options={sourceColumnOptions}
                      onChange={(_, option) =>
                        updateChartXColumn(String(option?.key ?? ""))
                      }
                    />
                  </div>
                  <div className="field-group field-span-2">
                    <label>Y series columns</label>
                    <div className="series-picker">
                      {chartSourceColumns
                        .filter((c) => c !== chartDraft.xColumn)
                        .map((c) => (
                          <label key={c} className="series-option">
                            <Checkbox
                              label={c}
                              checked={chartDraft.yColumns.includes(c)}
                              onChange={(_, checked) =>
                                toggleSeriesColumn(c, Boolean(checked))
                              }
                            />
                          </label>
                        ))}
                    </div>
                  </div>
                </>
              ) : null}

              {isDraftPie ? (
                <>
                  <div className="field-group">
                    <label htmlFor="pie-label-col">Label column</label>
                    <Dropdown
                      id="pie-label-col"
                      selectedKey={chartDraft.labelColumn || undefined}
                      options={sourceColumnOptions}
                      onChange={(_, option) =>
                        setChartDraft((old) => ({
                          ...old,
                          labelColumn: String(option?.key ?? ""),
                        }))
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="pie-value-col">Value column</label>
                    <Dropdown
                      id="pie-value-col"
                      selectedKey={chartDraft.valueColumn || undefined}
                      options={sourceColumnOptions}
                      onChange={(_, option) =>
                        setChartDraft((old) => ({
                          ...old,
                          valueColumn: String(option?.key ?? ""),
                        }))
                      }
                    />
                  </div>
                </>
              ) : null}

              {isDraftHistogram ? (
                <>
                  <div className="field-group">
                    <label htmlFor="hist-value-col">Value column</label>
                    <Dropdown
                      id="hist-value-col"
                      selectedKey={chartDraft.valueColumn || undefined}
                      options={sourceColumnOptions}
                      onChange={(_, option) =>
                        setChartDraft((old) => ({
                          ...old,
                          valueColumn: String(option?.key ?? ""),
                        }))
                      }
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="hist-bins">Bin count</label>
                    <TextField
                      id="hist-bins"
                      type="number"
                      value={String(chartDraft.histogramBins ?? 20)}
                      onChange={(_, value) =>
                        setChartDraft((old) => ({
                          ...old,
                          histogramBins: Number(value ?? 20),
                        }))
                      }
                    />
                  </div>
                </>
              ) : null}
            </div>
          </section>

          <section className="chart-step">
            <h3>Step 3 · Styling and performance</h3>
            <div className="form-grid">
              <div className="field-group">
                <label htmlFor="chart-color">Primary color</label>
                <ColorPicker
                  color={chartDraft.color ?? "#ff2b2b"}
                  alphaType="none"
                  showPreview
                  onChange={(_, color) =>
                    setChartDraft((old) => ({
                      ...old,
                      color: color.str,
                    }))
                  }
                />
              </div>

              {isDraftXY ? (
                <div className="field-group">
                  <label htmlFor="chart-resolution">
                    Resolution (sampling)
                  </label>
                  <TextField
                    id="chart-resolution"
                    type="number"
                    value={String(chartDraft.resolution ?? 1)}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        resolution: clampResolution(Number(value ?? 1)),
                      }))
                    }
                  />
                </div>
              ) : null}

              {hasDraftSeries && isDraftXY ? (
                <div className="field-group">
                  <label htmlFor="chart-primary-series">
                    Primary color target series
                  </label>
                  <Dropdown
                    id="chart-primary-series"
                    selectedKey={chartDraft.primaryColorSeries || undefined}
                    options={chartDraft.yColumns.map((c) => ({
                      key: c,
                      text: c,
                    }))}
                    onChange={(_, option) =>
                      setChartDraft((old) => ({
                        ...old,
                        primaryColorSeries: String(option?.key ?? ""),
                      }))
                    }
                  />
                </div>
              ) : null}

              {isDraftScatter ? (
                <div className="field-group">
                  <label htmlFor="chart-dot-size">Scatter dot size</label>
                  <TextField
                    id="chart-dot-size"
                    type="number"
                    value={String(chartDraft.scatterDotSize ?? 5)}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        scatterDotSize: Number(value ?? 5),
                      }))
                    }
                  />
                </div>
              ) : null}

              {isDraftLine ? (
                <div className="field-group">
                  <label htmlFor="chart-line-width">Line width</label>
                  <TextField
                    id="chart-line-width"
                    type="number"
                    value={String(chartDraft.lineWidth ?? 2)}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        lineWidth: Number(value ?? 2),
                      }))
                    }
                  />
                </div>
              ) : null}

              {isDraftHistogram ? (
                <div className="field-group">
                  <label htmlFor="chart-bar-size">Histogram bar width</label>
                  <TextField
                    id="chart-bar-size"
                    type="number"
                    value={String(chartDraft.histBarSize ?? 24)}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        histBarSize: Number(value ?? 24),
                      }))
                    }
                  />
                </div>
              ) : null}
            </div>
          </section>

          {isDraftXY || isDraftHistogram ? (
            <section className="chart-step">
              <h3>Step 4 · Axis and offsets</h3>
              <div className="form-grid">
                <div className="field-group">
                  <label htmlFor="chart-x-label">X axis label</label>
                  <TextField
                    id="chart-x-label"
                    placeholder="e.g. Observation time"
                    value={chartDraft.xLabel}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        xLabel: value ?? "",
                      }))
                    }
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="chart-y-label">Y axis label</label>
                  <TextField
                    id="chart-y-label"
                    placeholder="e.g. Magnitude"
                    value={chartDraft.yLabel}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        yLabel: value ?? "",
                      }))
                    }
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="chart-x-angle">X tick angle</label>
                  <TextField
                    id="chart-x-angle"
                    type="number"
                    placeholder="0"
                    value={String(chartDraft.xTickAngle ?? 0)}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        xTickAngle: Number(value ?? 0),
                      }))
                    }
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="chart-y-format">Y tick format</label>
                  <TextField
                    id="chart-y-format"
                    placeholder="e.g. .3f"
                    value={chartDraft.yTickFormat}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        yTickFormat: value ?? "",
                      }))
                    }
                  />
                </div>

                <div className="field-group">
                  <label htmlFor="chart-invert-y">Y Axis</label>
                  <label className="series-option" htmlFor="chart-invert-y">
                    <Checkbox
                      label="Invert Y"
                      id="chart-invert-y"
                      checked={Boolean(chartDraft.invertY)}
                      onChange={(_, checked) =>
                        setChartDraft((old) => ({
                          ...old,
                          invertY: Boolean(checked),
                        }))
                      }
                    />
                  </label>
                </div>

                <div className="field-group">
                  <label htmlFor="chart-y-offset">Y Offset</label>
                  <TextField
                    id="chart-y-offset"
                    type="number"
                    placeholder="0"
                    value={String(chartDraft.yOffset ?? 0)}
                    onChange={(_, value) =>
                      setChartDraft((old) => ({
                        ...old,
                        yOffset: Number(value ?? 0),
                      }))
                    }
                  />
                  <small className="field-hint">
                    Offset is applied to plotted Y data and auto-bounds.
                  </small>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="chart-grid">
          {charts.map((chart) => (
            <div className="chart-card" key={chart.id}>
              <div className="chart-card-head">
                <span>{chart.title}</span>
                <div className="inline-actions">
                  <DefaultButton
                    iconProps={{
                      iconName: "Sunny"
                    }}
                    onClick={() => toggleChartBackgroundMode(chart.id)}
                  />
                  <DefaultButton
                    text="PNG"
                    iconProps={{
                      iconName: "Download"
                    }}
                    onClick={() => exportChartImage(chart.id)}
                  />
                  <DefaultButton
                    iconProps={{
                      iconName: "Delete"
                    }}
                    onClick={() => removeChart(chart.id)}
                  />
                </div>
              </div>
              <div className="panel-muted">
                Source columns: {getChartColumns(chart).length} · Rows:{" "}
                {getChartRows(chart).length}
                {(chart.type === "line" || chart.type === "scatter") &&
                chart.resolution
                  ? ` · Resolution ${chart.resolution.toFixed(1)}`
                  : ""}
              </div>
              {renderChart(chart)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
