import React from 'react';
import {
  TIPOS_CRITERIO,
  getFamiliasForTipo,
  getTipoLabel,
  getFamiliaLabel,
  normalizeMopCriterioFields,
} from './mopCriterioOptions';
import { getFamiliaFormula } from './mopCriterioFormulas';
import { defaultParametrosForFamilia } from './mopFuncionParams';
import MopFuncionParamFields from './MopFuncionParamFields';
import MopOptionCardPicker from './MopOptionCardPicker';
import MopOptionCard from './MopOptionCard';
import UtilidadCurveChart from './UtilidadCurveChart';

function MopCriterioFields({
  tipoCriterio,
  familiaFunciones,
  parametrosFuncion,
  onChange,
  disabled,
  inputClass,
  compact = false,
}) {
  const familias = getFamiliasForTipo(tipoCriterio);
  const fieldGap = compact ? 'gap-3' : 'space-y-4';
  const labelClass = compact
    ? 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5'
    : 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  const handleTipoChange = (e) => {
    const nextTipo = e.target.value;
    const normalized = normalizeMopCriterioFields(nextTipo, familiaFunciones);
    onChange({
      ...normalized,
      parametros_funcion: defaultParametrosForFamilia(normalized.familia_funciones),
    });
  };

  const handleFamiliaChange = (nextFamilia) => {
    onChange({
      tipo_criterio: tipoCriterio,
      familia_funciones: nextFamilia,
      parametros_funcion: defaultParametrosForFamilia(nextFamilia),
    });
  };

  const handleParametrosChange = (parametros) => {
    onChange({
      tipo_criterio: tipoCriterio,
      familia_funciones: familiaFunciones,
      parametros_funcion: parametros,
    });
  };

  if (disabled) {
    const familiaMeta = getFamiliaFormula(familiaFunciones);

    return (
      <div className={fieldGap}>
        <div>
          <label className={labelClass}>Tipo de criterio</label>
          <p className={`${inputClass} opacity-60 text-sm py-1.5`}>{getTipoLabel(tipoCriterio)}</p>
        </div>

        <div className="space-y-1.5">
          <p className={labelClass}>Familia de función</p>
          <MopOptionCard
            selected
            label={getFamiliaLabel(tipoCriterio, familiaFunciones)}
            latex={familiaMeta.latex}
            curvePreview={{
              familia: familiaFunciones,
              params: parametrosFuncion || {},
              tipoCriterio,
            }}
            disabled
          />
        </div>

        <MopFuncionParamFields
          familia={familiaFunciones}
          parametros={parametrosFuncion || {}}
          onChange={() => {}}
          disabled
          inputClass={inputClass}
          compact={compact}
        />
      </div>
    );
  }

  return (
    <div className={fieldGap}>
      <div>
        <label className={labelClass}>Tipo de criterio *</label>
        <select
          name="tipo_criterio"
          value={tipoCriterio}
          onChange={handleTipoChange}
          required
          className={`${inputClass} ${compact ? 'py-1.5 text-sm' : ''}`}
        >
          {TIPOS_CRITERIO.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <MopOptionCardPicker
        label="Familia de función"
        name="familia_funciones"
        options={familias}
        value={familiaFunciones}
        onChange={handleFamiliaChange}
        getMeta={(value) => getFamiliaFormula(value)}
        getCurvePreview={(familia) => ({
          familia,
          params: familia === familiaFunciones
            ? (parametrosFuncion || defaultParametrosForFamilia(familia))
            : defaultParametrosForFamilia(familia),
          tipoCriterio,
        })}
        compact
        disabled={!familias.length}
        required
      />

      {familiaFunciones && (
        <UtilidadCurveChart
          familia={familiaFunciones}
          params={parametrosFuncion || {}}
          tipoCriterio={tipoCriterio}
          compact={false}
          showLabel
          className="rounded-lg border border-gray-100 dark:border-navy-800 bg-gray-50/80 dark:bg-navy-900/40 p-2"
        />
      )}

      <MopFuncionParamFields
        familia={familiaFunciones}
        parametros={parametrosFuncion || {}}
        onChange={handleParametrosChange}
        disabled={false}
        inputClass={inputClass}
        compact={compact}
      />
    </div>
  );
}

export default MopCriterioFields;
