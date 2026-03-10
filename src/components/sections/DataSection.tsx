import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  DefaultButton,
  Dropdown,
  PrimaryButton,
  TextField,
  Checkbox,
} from "@fluentui/react";
import type { IDropdownOption } from "@fluentui/react";
import type { ColumnFilter, Dataset, TransformName } from "../../types";

interface TransformStepView {
  id: string;
  columns: string[];
  transform: TransformName;
  referenceColumn?: string;
}

interface DataSectionProps {
  activeColumns: string[];
  newFilter: ColumnFilter;
  setNewFilter: Dispatch<SetStateAction<ColumnFilter>>;
  filterOperators: Array<{ value: ColumnFilter["operator"]; label: string }>;
  filters: ColumnFilter[];
  addFilter: () => void;
  removeFilter: (index: number) => void;
  transforms: TransformName[];
  transformCfg: { transform: TransformName; referenceColumn?: string };
  setTransformCfg: Dispatch<
    SetStateAction<{ transform: TransformName; referenceColumn?: string }>
  >;
  addTransformStep: () => void;
  transformColumns: string[];
  toggleTransformColumn: (column: string, checked: boolean) => void;
  activeTransformSteps: TransformStepView[];
  draggingTransformId: string | null;
  setDraggingTransformId: Dispatch<SetStateAction<string | null>>;
  reorderTransformSteps: (dragId: string, targetId: string) => void;
  removeTransformStep: (stepId: string) => void;
  formulaName: string;
  setFormulaName: Dispatch<SetStateAction<string>>;
  formulaExpression: string;
  setFormulaExpression: Dispatch<SetStateAction<string>>;
  applyFormulaToActive: () => void;
  activeDataset: Dataset | null;
  activeRows: Record<string, unknown>[];
  hasTableModifiers: boolean;
  addEmptyRow: () => void;
  addEmptyColumn: () => void;
  exportFilteredCsv: () => void;
  editingCell: { rowIndex: number; column: string } | null;
  draftCellValue: string;
  startCellEdit: (rowIndex: number, column: string, value: unknown) => void;
  setDraftCellValue: Dispatch<SetStateAction<string>>;
  commitCellEdit: () => void;
  cancelCellEdit: () => void;
}

const toTable = (
  rows: Record<string, unknown>[],
  columns: string[],
  page: number,
  pageSize: number,
  onPageChange: (page: number) => void,
  onPageSizeChange: (size: number) => void,
) => {
  if (rows.length === 0) {
    return <div className="panel-muted">No rows to display.</div>;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const from = start + 1;
  const to = start + pageRows.length;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr key={`r-${i}`}>
              {columns.map((c) => (
                <td key={`${i}-${c}`}>{String(row[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-pagination">
        <div className="panel-muted">
          Showing {from}-{to} / {rows.length} rows · Page {safePage}/
          {totalPages}
        </div>
        <div className="inline-actions">
          <DefaultButton
            text="Prev"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
          />
          <DefaultButton
            text="Next"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
          />
          <Dropdown
            label="Rows/page"
            selectedKey={String(pageSize)}
            options={[
              { key: "25", text: "25" },
              { key: "50", text: "50" },
              { key: "100", text: "100" },
              { key: "250", text: "250" },
            ]}
            onChange={(_, option) =>
              onPageSizeChange(Number(option?.key ?? 50))
            }
          />
        </div>
      </div>
    </div>
  );
};

const toEditableTable = (
  rows: Record<string, unknown>[],
  columns: string[],
  editingCell: { rowIndex: number; column: string } | null,
  draftCellValue: string,
  onStartEdit: (rowIndex: number, column: string, value: unknown) => void,
  onCellDraftChange: (value: string) => void,
  onCommitCell: () => void,
  onCancelCell: () => void,
  page: number,
  pageSize: number,
  onPageChange: (page: number) => void,
  onPageSizeChange: (size: number) => void,
) => {
  if (rows.length === 0) {
    return <div className="panel-muted">No rows to display.</div>;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const from = start + 1;
  const to = start + pageRows.length;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pageRows.map((row, i) => (
            <tr key={`r-${i}`}>
              {columns.map((c) => {
                const absoluteIndex = start + i;
                const isEditing =
                  editingCell?.rowIndex === absoluteIndex &&
                  editingCell?.column === c;
                return (
                  <td key={`${i}-${c}`} className="editable-cell">
                    {isEditing ? (
                      <input
                        autoFocus
                        aria-label={`Edit row ${absoluteIndex + 1} column ${c}`}
                        value={draftCellValue}
                        onChange={(e) => onCellDraftChange(e.target.value)}
                        onBlur={onCommitCell}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") onCommitCell();
                          if (e.key === "Escape") onCancelCell();
                        }}
                      />
                    ) : (
                      <button
                        className="cell-btn"
                        onClick={() => onStartEdit(absoluteIndex, c, row[c])}
                        title="Click to edit"
                      >
                        {String(row[c] ?? "")}
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-pagination">
        <div className="panel-muted">
          Showing {from}-{to} / {rows.length} rows · Page {safePage}/
          {totalPages}
        </div>
        <div className="inline-actions">
          <DefaultButton
            text="Prev"
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
          />
          <DefaultButton
            text="Next"
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
          />
          <Dropdown
            label="Rows/page"
            selectedKey={String(pageSize)}
            options={[
              { key: "25", text: "25" },
              { key: "50", text: "50" },
              { key: "100", text: "100" },
              { key: "250", text: "250" },
            ]}
            onChange={(_, option) =>
              onPageSizeChange(Number(option?.key ?? 50))
            }
          />
        </div>
      </div>
    </div>
  );
};

export function DataSection({
  activeColumns,
  newFilter,
  setNewFilter,
  filterOperators,
  filters,
  addFilter,
  removeFilter,
  transforms,
  transformCfg,
  setTransformCfg,
  addTransformStep,
  transformColumns,
  toggleTransformColumn,
  activeTransformSteps,
  draggingTransformId,
  setDraggingTransformId,
  reorderTransformSteps,
  removeTransformStep,
  formulaName,
  setFormulaName,
  formulaExpression,
  setFormulaExpression,
  applyFormulaToActive,
  activeDataset,
  activeRows,
  hasTableModifiers,
  addEmptyRow,
  addEmptyColumn,
  exportFilteredCsv,
  editingCell,
  draftCellValue,
  startCellEdit,
  setDraftCellValue,
  commitCellEdit,
  cancelCellEdit,
}: DataSectionProps) {
  const [openSection, setOpenSection] = useState<
    "filters" | "transforms" | "functions"
  >("filters");
  const [tablePage, setTablePage] = useState(1);
  const [tablePageSize, setTablePageSize] = useState(50);

  const columnOptions: IDropdownOption[] = activeColumns.map((c) => ({
    key: c,
    text: c,
  }));
  const filterOperatorOptions: IDropdownOption[] = filterOperators.map((o) => ({
    key: o.value,
    text: o.label,
  }));
  const transformOptions: IDropdownOption[] = transforms.map((t) => ({
    key: t,
    text: t,
  }));

  return (
    <section className="panel-grid">
      <div className="panel">
        <div className="accordion-section">
          <DefaultButton
            className="accordion-header"
            text="Filters"
            iconProps={{
              iconName:
                openSection === "filters" ? "ChevronDown" : "ChevronRight",
            }}
            onClick={() => setOpenSection("filters")}
          />
          {openSection === "filters" ? (
            <>
              <div className="inline-grid">
                <Dropdown
                  label="Column"
                  placeholder="Column"
                  selectedKey={newFilter.column || undefined}
                  options={columnOptions}
                  onChange={(_, option) =>
                    setNewFilter((old) => ({
                      ...old,
                      column: String(option?.key ?? ""),
                    }))
                  }
                />

                <Dropdown
                  label="Operator"
                  selectedKey={newFilter.operator}
                  options={filterOperatorOptions}
                  onChange={(_, option) =>
                    setNewFilter((old) => ({
                      ...old,
                      operator: String(
                        option?.key ?? "eq",
                      ) as ColumnFilter["operator"],
                      secondValue:
                        String(option?.key ?? "eq") === "between"
                          ? (old.secondValue ?? "")
                          : "",
                    }))
                  }
                />

                <TextField
                  label="Value"
                  value={newFilter.value}
                  onChange={(_, value) =>
                    setNewFilter((old) => ({ ...old, value: value ?? "" }))
                  }
                />
                {newFilter.operator === "between" ? (
                  <TextField
                    label="Second value"
                    value={newFilter.secondValue ?? ""}
                    onChange={(_, value) =>
                      setNewFilter((old) => ({
                        ...old,
                        secondValue: value ?? "",
                      }))
                    }
                  />
                ) : null}
                <PrimaryButton
                  text="Filter"
                  onClick={addFilter}
                  iconProps={{ iconName: "Add" }}
                />
              </div>

              <div className="stacked-list">
                {filters.map((f, idx) => (
                  <div key={`${f.column}-${idx}`} className="list-row">
                    <span>
                      {f.column} {f.operator} {f.value}
                      {f.operator === "between" ? ` .. ${f.secondValue}` : ""}
                    </span>
                    <DefaultButton
                      text="Remove"
                      onClick={() => removeFilter(idx)}
                    />
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="accordion-section">
          <DefaultButton
            className="accordion-header"
            text="Transformations"
            iconProps={{
              iconName:
                openSection === "transforms" ? "ChevronDown" : "ChevronRight",
            }}
            onClick={() => setOpenSection("transforms")}
          />
          {openSection === "transforms" ? (
            <>
              <div className="inline-grid">
                <Dropdown
                  label="Transform"
                  selectedKey={transformCfg.transform}
                  options={transformOptions}
                  onChange={(_, option) =>
                    setTransformCfg((old) => ({
                      ...old,
                      transform: String(option?.key ?? "none") as TransformName,
                    }))
                  }
                />

                <Dropdown
                  label="Reference column"
                  placeholder="Optional"
                  selectedKey={transformCfg.referenceColumn || undefined}
                  options={columnOptions}
                  onChange={(_, option) =>
                    setTransformCfg((old) => ({
                      ...old,
                      referenceColumn: String(option?.key ?? ""),
                    }))
                  }
                />

                <PrimaryButton
                  text="Step"
                  onClick={addTransformStep}
                  iconProps={{ iconName: "Add" }}
                />
              </div>

              <div className="field-group">
                <label>Transform columns</label>
                <p className="panel-muted">
                  {transformCfg.referenceColumn
                    ? "If a reference column is specified, select that column last if transform is to be applied to it too."
                    : "Select one or more columns to apply the transform steps to."}
                </p>
                <div className="series-picker">
                  {activeColumns.map((c) => (
                    <label key={c} className="series-option">
                      <Checkbox
                        label={c}
                        checked={transformColumns.includes(c)}
                        onChange={(_, checked) =>
                          toggleTransformColumn(c, Boolean(checked))
                        }
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <label>Transform pipeline (drag to reorder)</label>
                <div className="transform-list">
                  {activeTransformSteps.length === 0 ? (
                    <div className="panel-muted">No transform steps yet.</div>
                  ) : (
                    activeTransformSteps.map((step) => (
                      <div
                        key={step.id}
                        className="transform-item"
                        draggable
                        onDragStart={() => setDraggingTransformId(step.id)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (draggingTransformId) {
                            reorderTransformSteps(draggingTransformId, step.id);
                          }
                          setDraggingTransformId(null);
                        }}
                        onDragEnd={() => setDraggingTransformId(null)}
                      >
                        <div>
                          <strong>{step.transform}</strong> on{" "}
                          {step.columns.join(", ")}
                          {step.referenceColumn
                            ? ` (ref: ${step.referenceColumn})`
                            : ""}
                        </div>
                        <DefaultButton
                          text="Delete"
                          onClick={() => removeTransformStep(step.id)}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="accordion-section">
          <DefaultButton
            className="accordion-header"
            text="Function Column"
            iconProps={{
              iconName:
                openSection === "functions" ? "ChevronDown" : "ChevronRight",
            }}
            onClick={() => setOpenSection("functions")}
          />
          {openSection === "functions" ? (
            <div className="inline-grid">
              <TextField
                label="Column name"
                value={formulaName}
                onChange={(_, value) => setFormulaName(value ?? "")}
                placeholder="New column name"
              />
              <TextField
                label="Expression"
                value={formulaExpression}
                onChange={(_, value) => setFormulaExpression(value ?? "")}
                placeholder="Expression, e.g. (Gmag-RPmag)/2"
              />
              <PrimaryButton text="Add" onClick={applyFormulaToActive} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Table</h2>
          <div className="inline-actions">
            <DefaultButton
              text="Row"
              onClick={addEmptyRow}
              disabled={!activeDataset}
              iconProps={{ iconName: "Add" }}
            />
            <DefaultButton
              text="Column"
              onClick={addEmptyColumn}
              disabled={!activeDataset}
              iconProps={{ iconName: "Add" }}
            />
            <PrimaryButton
              text="CSV"
              onClick={exportFilteredCsv}
              disabled={activeRows.length === 0}
              iconProps={{ iconName: "Download" }}
            />
          </div>
        </div>
        <div className="panel-muted">
          {hasTableModifiers
            ? `Previewing transformed/filtered rows: ${activeRows.length} / ${activeDataset?.rows.length ?? 0}`
            : `Editable base table · rows: ${activeDataset?.rows.length ?? 0}`}
        </div>
        {activeDataset ? (
          hasTableModifiers ? (
            toTable(
              activeRows,
              activeDataset.columns,
              tablePage,
              tablePageSize,
              setTablePage,
              (size) => {
                setTablePageSize(size);
                setTablePage(1);
              },
            )
          ) : (
            toEditableTable(
              activeDataset.rows,
              activeDataset.columns,
              editingCell,
              draftCellValue,
              startCellEdit,
              setDraftCellValue,
              commitCellEdit,
              cancelCellEdit,
              tablePage,
              tablePageSize,
              setTablePage,
              (size) => {
                setTablePageSize(size);
                setTablePage(1);
              },
            )
          )
        ) : (
          <div className="panel-muted">Import a file to begin.</div>
        )}
      </div>
    </section>
  );
}
