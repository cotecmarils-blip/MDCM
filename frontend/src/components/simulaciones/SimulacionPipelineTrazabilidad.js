import React, { useMemo, useState } from 'react';
import { PipelineTimeline } from './SimulacionPipelineSteps';
import { buildPasosFromResultado, enrichPasosForDisplay } from './simulacionPipelineViewUtils';

function SimulacionPipelineTrazabilidad({ resultado }) {
  const [expandedIds, setExpandedIds] = useState(() => new Set());

  const steps = useMemo(() => {
    const pasos = buildPasosFromResultado(resultado);
    return enrichPasosForDisplay(pasos);
  }, [resultado]);

  React.useEffect(() => {
    if (steps.length) {
      setExpandedIds(new Set(steps.map((s) => s.id)));
    }
  }, [steps]);

  const onToggleStep = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!steps.length) return null;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/60 bg-white/80 dark:bg-navy-950/40 p-4 sm:p-5">
      <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
        Trazabilidad del cálculo
      </h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 mb-4">
        Paso a paso: cómo se procesó la información desde la matriz de utilidades hasta el ranking
        final. Use la flecha ▼ a la derecha de cada paso para desplegar u ocultar.
      </p>
      <PipelineTimeline
        steps={steps}
        expandedIds={expandedIds}
        onToggleStep={onToggleStep}
      />
    </div>
  );
}

export default SimulacionPipelineTrazabilidad;
