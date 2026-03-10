import { SkyMap } from "../SkyMap";
import { Checkbox, ComboBox, DefaultButton, Dropdown } from "@fluentui/react";
import type { IDropdownOption } from "@fluentui/react";

interface SurveyOption {
  id: string;
  label: string;
}

interface SkySectionProps {
  selectedSkySurvey: string;
  setSelectedSkySurvey: (value: string) => void;
  filteredSkySurveys: SurveyOption[];
  skySurveyOptionsCount: number;
  resolvedSkySurveyId: string;
  effRACol: string;
  setRaColumn: (value: string) => void;
  effDecCol: string;
  setDecColumn: (value: string) => void;
  effLabelCol: string;
  setLabelColumn: (value: string) => void;
  activeColumns: string[];
  effectiveDetailColumns: string[];
  toggleDetailColumn: (column: string, checked: boolean) => void;
  bumpSkyLoadToken: () => void;
  activeRows: Record<string, unknown>[];
  skyLoadToken: number;
}

export function SkySection({
  selectedSkySurvey,
  setSelectedSkySurvey,
  filteredSkySurveys,
  skySurveyOptionsCount,
  resolvedSkySurveyId,
  effRACol,
  setRaColumn,
  effDecCol,
  setDecColumn,
  effLabelCol,
  setLabelColumn,
  activeColumns,
  effectiveDetailColumns,
  toggleDetailColumn,
  bumpSkyLoadToken,
  activeRows,
  skyLoadToken,
}: SkySectionProps) {
  const columnOptions: IDropdownOption[] = activeColumns.map((c) => ({
    key: c,
    text: c,
  }));
  const surveyOptions: IDropdownOption[] = filteredSkySurveys.map((s) => ({
    key: s.id,
    text: s.label,
  }));

  return (
    <section className="sky-layout">
      <div className="panel sky-controls-panel">
        <h2>Sky Map (Aladin Lite)</h2>

        <div className="form-grid">
          <div className="field-group field-span-2">
            <label htmlFor="sky-survey-combo">Imagery source</label>
            <ComboBox
              id="sky-survey-combo"
              allowFreeform
              autoComplete="on"
              selectedKey={selectedSkySurvey}
              options={surveyOptions}
              text={selectedSkySurvey}
              onChange={(_, option, __, value) =>
                setSelectedSkySurvey(String(option?.key ?? value ?? ""))
              }
              placeholder="Type to filter surveys, then pick one..."
            />
            <small className="field-hint">
              Loaded {skySurveyOptionsCount} surveys. Using:{" "}
              {resolvedSkySurveyId}
            </small>
          </div>
        </div>

        <div className="form-grid">
          <Dropdown
            label="RA column"
            selectedKey={effRACol || undefined}
            options={columnOptions}
            onChange={(_, option) => {
              const value = String(option?.key ?? "");
              setRaColumn(value);
              if (effDecCol && value) {
                bumpSkyLoadToken();
              }
            }}
          />
          <Dropdown
            label="Dec column"
            selectedKey={effDecCol || undefined}
            options={columnOptions}
            onChange={(_, option) => {
              const value = String(option?.key ?? "");
              setDecColumn(value);
              if (effRACol && value) {
                bumpSkyLoadToken();
              }
            }}
          />
          <Dropdown
            label="Label column"
            selectedKey={effLabelCol || undefined}
            options={columnOptions}
            onChange={(_, option) => setLabelColumn(String(option?.key ?? ""))}
          />
        </div>

        <div className="field-group">
          <label>Detail columns</label>
          <div className="series-picker">
            {activeColumns
              .filter((c) => c !== effRACol && c !== effDecCol)
              .map((c) => (
                <label key={c} className="series-option">
                  <Checkbox
                    label={c}
                    checked={effectiveDetailColumns.includes(c)}
                    onChange={(_, checked) =>
                      toggleDetailColumn(c, Boolean(checked))
                    }
                  />
                </label>
              ))}
          </div>
        </div>

        <div className="inline-actions">
          <DefaultButton
            text="🛰 Load Sky Map"
            onClick={bumpSkyLoadToken}
            disabled={!effRACol || !effDecCol}
          />
        </div>
      </div>

      <div className="panel sky-view-panel">
        <SkyMap
          rows={activeRows}
          raColumn={effRACol}
          decColumn={effDecCol}
          labelColumn={effLabelCol}
          detailColumns={effectiveDetailColumns}
          loadToken={skyLoadToken}
          surveyId={resolvedSkySurveyId}
        />
      </div>
    </section>
  );
}
