import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { proyectos } from './api';
import Sidebar from './layout/Sidebar';
import Header from './layout/Header';
import ProjectInfoPanel from './components/ProjectInfoPanel';
import AlternativasPanel from './components/AlternativasPanel';
import CriteriosPanel from './components/criterios/CriteriosPanel';
import PesosPanel from './components/pesos/PesosPanel';
import EvaluacionPanel from './components/evaluacion/EvaluacionPanel';
import SimulacionesPanel from './components/simulaciones/SimulacionesPanel';
import AuditoriaEventosPanel from './components/trazabilidad/AuditoriaEventosPanel';
import SensitivityPanel from './components/sensibilidad/SensitivityPanel';
import { useProjectPermissions } from './hooks/useProjectPermissions';

const ROL_LABELS = {
  admin: 'Super Admin',
  jefe: 'Gerente',
  analista: 'Ingeniero',
  evaluador: 'Evaluador',
  ofertante: 'Proveedor',
  auditor: 'Auditor',
};

const ALL_SECTIONS = ['info', 'alternativas', 'criterios', 'trazabilidad', 'pesos', 'evaluacion', 'simulaciones', 'sensibilidad'];

function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { permissions, loading: permLoading, error: permError, canWrite, canAccessSection } =
    useProjectPermissions(id);
  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('info');

  const visibleSections = useMemo(
    () => ALL_SECTIONS.filter((section) => canAccessSection(section)),
    [canAccessSection],
  );

  useEffect(() => {
    if (visibleSections.length && !visibleSections.includes(activeSection)) {
      setActiveSection(visibleSections[0]);
    }
  }, [visibleSections, activeSection]);

  const loadProyecto = useCallback(async () => {
    try {
      setLoading(true);
      const response = await proyectos.getById(id);
      setProyecto(response.data);
      setError(null);
    } catch (err) {
      setError('Error cargando proyecto');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadProyecto();
  }, [loadProyecto]);

  const renderMainContent = () => {
    switch (activeSection) {
      case 'info':
        return <ProjectInfoPanel proyecto={proyecto} proyectoId={id} />;
      case 'alternativas':
        return (
          <AlternativasPanel proyectoId={id} />
        );
      case 'criterios':
        return <CriteriosPanel proyectoId={id} />;
      case 'trazabilidad':
        return <AuditoriaEventosPanel proyectoId={id} canWrite={canWrite} />;
      case 'pesos':
        return <PesosPanel proyectoId={id} />;
      case 'evaluacion':
        return <EvaluacionPanel proyectoId={id} canWrite={canWrite} />;
      case 'simulaciones':
        return <SimulacionesPanel proyectoId={id} canWrite={canWrite} />;
      case 'sensibilidad':
        return <SensitivityPanel proyectoId={id} />;
      default:
        return null;
    }
  };

  if (loading || permLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-navy-50 dark:bg-navy-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-navy-600" />
      </div>
    );
  }

  if (permError || error || !proyecto) {
    return (
      <div className="min-h-screen bg-navy-50 dark:bg-navy-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Link
            to="/"
            className="text-navy-800 hover:text-navy-600 dark:hover:text-navy-400 mb-4 inline-block"
          >
            ← Volver a Proyectos
          </Link>
          <p className="text-red-500 dark:text-red-400">
            {permError || error || 'Proyecto no encontrado'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        proyectoNombre={proyecto.nombre}
        visibleSections={visibleSections}
      />

      <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          proyectoNombre={proyecto.nombre}
          proyectoDescripcion={proyecto.descripcion}
          onEditProject={() => navigate(`/proyecto/${id}/editar`)}
          rolLabel={ROL_LABELS[permissions.rol] || permissions.rol}
          canEditProject={canWrite}
        />

        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="px-4 sm:px-6 lg:px-8 py-3 lg:py-4 flex-1 flex flex-col min-h-0 w-full mx-auto">
            {renderMainContent()}
          </div>
        </main>

      </div>
    </div>
  );
}

export default ProjectDetailPage;
