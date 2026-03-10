import { Checkbox } from "@fluentui/react";

interface AggregateSectionProps {
  activeColumns: string[];
  aggColumns: string[];
  toggleAggColumn: (column: string, checked: boolean) => void;
  aggRowsForTable: Record<string, unknown>[];
}

const toTable = (
  rows: Record<string, unknown>[],
  columns: string[],
  maxRows = 100,
) => {
  if (rows.length === 0) {
    return <div className="panel-muted">No rows to display.</div>;
  }

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
          {rows.slice(0, maxRows).map((row, i) => (
            <tr key={`r-${i}`}>
              {columns.map((c) => (
                <td key={`${i}-${c}`}>{String(row[c] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="panel-muted">
        Showing {Math.min(rows.length, maxRows)} / {rows.length} rows.
      </div>
    </div>
  );
};

export function AggregateSection({
  activeColumns,
  aggColumns,
  toggleAggColumn,
  aggRowsForTable,
}: AggregateSectionProps) {
  return (
    <section className="panel-grid single">
      <div className="panel">
        <h2>Column Aggregations</h2>
        <p className="panel-muted">
          Choose one or more numeric columns from the active (filtered) table.
        </p>

        <div className="series-picker">
          {activeColumns.map((c) => (
            <label key={c} className="series-option">
              <Checkbox
                label={c}
                checked={aggColumns.includes(c)}
                onChange={(_, checked) => toggleAggColumn(c, Boolean(checked))}
              />
            </label>
          ))}
        </div>

        {aggRowsForTable.length > 0 ? (
          toTable(aggRowsForTable, Object.keys(aggRowsForTable[0]))
        ) : (
          <div className="panel-muted">No aggregations yet.</div>
        )}
      </div>
    </section>
  );
}
