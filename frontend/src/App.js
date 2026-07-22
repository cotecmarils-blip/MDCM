import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ProjectsPage from './ProjectsPage';
import ProjectDetailPage from './ProjectDetailPage';
import DrawioViewerPage from './pages/DrawioViewerPage';
import ProjectFormPage from './pages/ProjectFormPage';
import LoginPage from './pages/LoginPage';
import UsuariosGlobalPage from './pages/UsuariosGlobalPage';
import ProfilePage from './pages/ProfilePage';
import TiposDimensionPage from './pages/TiposDimensionPage';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/"
              element={(
                <ProtectedRoute>
                  <ProjectsPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/perfil"
              element={(
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/tipos-dimension"
              element={(
                <ProtectedRoute>
                  <TiposDimensionPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/usuarios"
              element={(
                <ProtectedRoute>
                  <UsuariosGlobalPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/proyecto/nuevo"
              element={(
                <ProtectedRoute>
                  <ProjectFormPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/proyecto/:id/editar"
              element={(
                <ProtectedRoute>
                  <ProjectFormPage />
                </ProtectedRoute>
              )}
            />
            <Route
              path="/proyecto/:id/diagrama-drawio"
              element={<DrawioViewerPage />}
            />
            <Route
              path="/proyecto/:id"
              element={(
                <ProtectedRoute>
                  <ProjectDetailPage />
                </ProtectedRoute>
              )}
            />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;