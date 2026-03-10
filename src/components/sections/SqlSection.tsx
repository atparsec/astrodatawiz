import type { Dataset } from "../../types";
import {
  DefaultButton,
  Dropdown,
  PrimaryButton,
  TextField,
} from "@fluentui/react";
import type { IDropdownOption } from "@fluentui/react";

interface SqlSectionProps {
  datasets: Dataset[];
  aliasPreview: Record<string, string>;
  joinLeftId: string;
  setJoinLeftId: (value: string) => void;
  joinRightId: string;
  setJoinRightId: (value: string) => void;
  appendName: string;
  setAppendName: (value: string) => void;
  loadJoinTemplate: () => void;
  appendTables: () => void;
  sqlQuery: string;
  setSqlQuery: (value: string) => void;
  runSql: () => void;
  saveSqlResultAsDataset: () => void;
  exportSqlRows: () => void;
  sqlRows: Record<string, unknown>[];
  sqlColumns: string[];
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

export function SqlSection({
  datasets,
  aliasPreview,
  joinLeftId,
  setJoinLeftId,
  joinRightId,
  setJoinRightId,
  appendName,
  setAppendName,
  loadJoinTemplate,
  appendTables,
  sqlQuery,
  setSqlQuery,
  runSql,
  saveSqlResultAsDataset,
  exportSqlRows,
  sqlRows,
  sqlColumns,
}: SqlSectionProps) {
  const tableOptions: IDropdownOption[] = datasets.map((d) => ({
    key: d.id,
    text: d.name,
  }));

  return (
    <section className="panel-grid single">
      <div className="panel">
        <h2>SQL Query Workbench</h2>
        <p className="panel-muted">
          JOIN tables with SQL, or append rows with the quick append tool.
        </p>
        <div className="alias-grid">
          {datasets.map((d) => (
            <span className="chip" key={d.id}>
              {d.name} → <strong>{aliasPreview[d.id]}</strong>
            </span>
          ))}
        </div>

        <div className="form-grid">
          <div className="field-group">
            <label htmlFor="join-left">Left table</label>
            <Dropdown
              id="join-left"
              placeholder="Select left table..."
              selectedKey={joinLeftId || undefined}
              options={tableOptions}
              onChange={(_, option) => setJoinLeftId(String(option?.key ?? ""))}
            />
          </div>

          <div className="field-group">
            <label htmlFor="join-right">Right table</label>
            <Dropdown
              id="join-right"
              placeholder="Select right table..."
              selectedKey={joinRightId || undefined}
              options={tableOptions}
              onChange={(_, option) =>
                setJoinRightId(String(option?.key ?? ""))
              }
            />
          </div>

          <div className="field-group">
            <label htmlFor="append-name">Append output name</label>
            <TextField
              id="append-name"
              value={appendName}
              onChange={(_, value) => setAppendName(value ?? "")}
              placeholder="optional_dataset_name"
            />
          </div>
        </div>

        <div className="inline-actions">
          <DefaultButton
            text="Insert SQL JOIN template"
            onClick={loadJoinTemplate}
          />
          <PrimaryButton
            text="Append rows as new dataset"
            onClick={appendTables}
          />
        </div>

        <TextField
          multiline
          rows={10}
          value={sqlQuery}
          onChange={(_, value) => setSqlQuery(value ?? "")}
          placeholder={"SELECT * FROM your_table_alias LIMIT 100;"}
        />
        <div className="inline-actions">
          <PrimaryButton text="Run SQL" onClick={runSql} />
          <DefaultButton
            text="Save output as dataset"
            onClick={saveSqlResultAsDataset}
            disabled={sqlRows.length === 0}
          />
          <DefaultButton
            text="Export SQL output CSV"
            onClick={exportSqlRows}
            disabled={sqlRows.length === 0}
          />
        </div>

        {sqlRows.length > 0 ? (
          toTable(sqlRows, sqlColumns)
        ) : (
          <div className="panel-muted">Run a query to view results.</div>
        )}
      </div>
    </section>
  );
}
