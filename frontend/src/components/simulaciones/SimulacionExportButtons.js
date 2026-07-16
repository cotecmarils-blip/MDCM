import React, { useState } from 'react';
import { simulacionApi } from '../../api';
import ExportablesDropdown from '../evaluacion/ExportablesDropdown';
import {
  buildExportFilename,
  buildMatrizNormalizadaExport,
  buildRankingExport,
  downloadJson,
} from './simulacionGraficosUtils';

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function SimulacionExportButtons({ resultado, proyectoId }) {
  const [exporting, setExporting] = useState(null);
  const tieneMatriz = Boolean(resultado?.normalizacion?.normalized_matrix?.length);
  const historialId = resultado?.historial_id;
  const informeDisponible = Boolean(proyectoId && historialId);

  const handleExport = async (kind) => {
    try {
      setExporting(kind);
      if (kind === 'resultado') {
        const { debug_logs: _dbg, ...rest } = resultado || {};
        downloadJson(rest, buildExportFilename(resultado, 'resultado'));
      } else if (kind === 'ranking') {
        downloadJson(buildRankingExport(resultado), buildExportFilename(resultado, 'ranking'));
      } else if (kind === 'matriz') {
        const data = buildMatrizNormalizadaExport(resultado);
        if (data) {
          downloadJson(data, buildExportFilename(resultado, 'matriz_normalizada'));
        }
      } else if (kind === 'informe') {
        if (!proyectoId || !historialId) {
          return;
        }
        const res = await simulacionApi.exportInformeResultadosWord(proyectoId, historialId);
        const blob = new Blob([res.data], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const base = buildExportFilename(resultado, 'informe_resultados').replace(/\.json$/, '');
        downloadBlob(blob, `${base}.docx`);
      }
    } finally {
      setExporting(null);
    }
  };

  const items = [
    {
      key: 'informe',
      label: exporting === 'informe' ? 'Generando informe…' : 'Exportar informe (Word)',
      description: 'Documento .docx paso a paso del cálculo (Pareto, normalización y MADM).',
      onClick: () => handleExport('informe'),
      disabled: !informeDisponible || Boolean(exporting),
      title: informeDisponible
        ? ''
        : 'Guarde el cálculo en el historial para exportar el informe',
    },
    {
      key: 'resultado',
      label: exporting === 'resultado' ? 'Exportando…' : 'Exportar JSON',
      description: 'Resultado completo del cálculo en formato JSON.',
      onClick: () => handleExport('resultado'),
      disabled: Boolean(exporting),
    },
    {
      key: 'ranking',
      label: exporting === 'ranking' ? 'Exportando…' : 'Exportar ranking',
      description: 'Ranking de alternativas (posición y puntaje) en JSON.',
      onClick: () => handleExport('ranking'),
      disabled: Boolean(exporting),
    },
  ];

  if (tieneMatriz) {
    items.push({
      key: 'matriz',
      label: exporting === 'matriz' ? 'Exportando…' : 'Matriz normalizada',
      description: 'Matriz normalizada del cálculo en JSON.',
      onClick: () => handleExport('matriz'),
      disabled: Boolean(exporting),
    });
  }

  return (
    <ExportablesDropdown
      label={exporting ? 'Exportando…' : 'Exportables'}
      items={items}
      disabled={Boolean(exporting)}
    />
  );
}

export default SimulacionExportButtons;
