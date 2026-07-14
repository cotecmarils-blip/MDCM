import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { escenarios, omoeApi } from '../../api';
import SplitColumnLayout from '../../layout/SplitColumnLayout';
import EscenariosListSidebar from './EscenariosListSidebar';
import EscenarioFormPanel from './EscenarioFormPanel';
import { usesEscenarioPesos } from '../criterios/escenarioAgregacionConstants';

function PesosPanel({ proyectoId }) {
  const [escenariosList, setEscenariosList] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [loadingEscenarios, setLoadingEscenarios] = useState(true);
  const [dimensiones, setDimensiones] = useState([]);
  const [filterOmoeId, setFilterOmoeId] = useState('');

  const loadEscenarios = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoadingEscenarios(true);
      const res = await escenarios.getByProyecto(proyectoId);
      setEscenariosList(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoadingEscenarios(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    loadEscenarios();
  }, [loadEscenarios]);

  useEffect(() => {
    const loadDimensiones = async () => {
      try {
        const res = await omoeApi.getByProyecto(proyectoId);
        setDimensiones(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        console.error(err);
      }
    };
    loadDimensiones();
  }, [proyectoId]);

  const filteredEscenarios = useMemo(() => {
    if (!filterOmoeId) return escenariosList;
    return escenariosList.filter((e) => String(e.omoe) === String(filterOmoeId));
  }, [escenariosList, filterOmoeId]);

  const filterDimension = useMemo(
    () => dimensiones.find((d) => String(d.id) === String(filterOmoeId)),
    [dimensiones, filterOmoeId],
  );

  const showPesoSummary = filterOmoeId
    ? usesEscenarioPesos(filterDimension?.escenario_agregacion)
    : false;

  const pesoTotalFiltrado = useMemo(() => (
    showPesoSummary
      ? filteredEscenarios.reduce((sum, e) => sum + Number(e.peso || 0), 0)
      : null
  ), [filteredEscenarios, showPesoSummary]);

  const handleNew = () => {
    setIsNew(true);
    setSelectedId(null);
  };

  const handleSelect = (id) => {
    setIsNew(false);
    setSelectedId(id);
  };

  const handleEscenarioSaved = (id) => {
    setIsNew(false);
    setSelectedId(id);
    loadEscenarios({ silent: true });
  };

  const handleEscenarioDeleted = () => {
    setSelectedId(null);
    setIsNew(false);
    loadEscenarios({ silent: true });
  };

  const rightContent = () => {
    if (isNew) {
      return (
        <EscenarioFormPanel
          proyectoId={proyectoId}
          isNew
          escenariosList={escenariosList}
          onSaved={handleEscenarioSaved}
          onCancelNew={() => setIsNew(false)}
        />
      );
    }

    if (!selectedId) {
      return (
        <p className="text-gray-500 dark:text-gray-400 text-center py-16">
          Selecciona un escenario o crea uno nuevo.
        </p>
      );
    }

    return (
      <EscenarioFormPanel
        proyectoId={proyectoId}
        escenarioId={selectedId}
        isNew={false}
        escenariosList={escenariosList}
        onSaved={() => loadEscenarios({ silent: true })}
        onDeleted={handleEscenarioDeleted}
      />
    );
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col h-full">
      <SplitColumnLayout
        title="Definición de escenarios"
        description="Cada escenario pertenece a una dimensión; el tipo OMOE/OMOC/OMOR se hereda de ella."
        leftLabel="Escenarios"
        rightLabel="Datos del escenario"
        left={
          <EscenariosListSidebar
            items={filteredEscenarios}
            dimensiones={dimensiones}
            filterOmoeId={filterOmoeId}
            onFilterOmoeChange={setFilterOmoeId}
            pesoTotal={pesoTotalFiltrado}
            showPesoSummary={showPesoSummary}
            selectedId={selectedId}
            isNew={isNew}
            onSelect={handleSelect}
            onNew={handleNew}
            loading={loadingEscenarios}
          />
        }
        right={rightContent()}
      />
    </div>
  );
}

export default PesosPanel;
