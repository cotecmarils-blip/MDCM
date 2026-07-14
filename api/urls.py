from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .auth_views import (
    ProyectoMembershipViewSet,
    SecureTokenRefreshView,
    change_password_view,
    login_view,
    logout_view,
    me_view,
    profile_view,
    proyecto_membership_view,
    search_users_view,
)
from .views import EscenarioViewSet

router = DefaultRouter()
router.register(r'auth/memberships', ProyectoMembershipViewSet, basename='membership')
router.register(r'proyectos', views.ProyectoViewSet)
router.register(r'requisitos', views.RequisitoViewSet)
router.register(r'alternativas', views.AlternativaViewSet)
router.register(r'capacidades', views.CapacidadViewSet)
router.register(r'caracteristicas-plantilla', views.CaracteristicaPlantillaViewSet)
router.register(r'caracteristicas', views.CaracteristicaViewSet)
router.register(r'documentos', views.DocumentoViewSet)
router.register(r'dimensiones', views.DimensionViewSet)
router.register(r'atributos', views.AtributoViewSet)
router.register(r'subatributos', views.SubatributoViewSet)
router.register(r'documentos-criterio', views.DocumentoCriterioViewSet)
router.register(r'escenarios', EscenarioViewSet, basename='escenario')
router.register(r'tipos-dimension', views.TipoDimensionViewSet, basename='tipos-dimension')
router.register(r'omoe', views.OmoeViewSet)
router.register(r'misiones', views.MisionViewSet)
router.register(r'grupos-afinidad', views.GrupoAfinidadViewSet)
router.register(r'mops-criterio', views.MopCriterioViewSet)
router.register(r'dps-criterio', views.DpCriterioViewSet)
router.register(r'nodos-arbol', views.NodoArbolViewSet, basename='nodos-arbol')
router.register(r'vop-resultados', views.VopResultadoViewSet)

urlpatterns = [
    path('saludo/', views.saludo, name='saludo'),
    path('auth/login/', login_view, name='auth-login'),
    path('auth/logout/', logout_view, name='auth-logout'),
    path('auth/refresh/', SecureTokenRefreshView.as_view(), name='auth-refresh'),
    path('auth/me/', me_view, name='auth-me'),
    path('auth/profile/', profile_view, name='auth-profile'),
    path('auth/change-password/', change_password_view, name='auth-change-password'),
    path(
        'auth/proyectos/<int:proyecto_id>/membership/',
        proyecto_membership_view,
        name='auth-proyecto-membership',
    ),
    path('auth/users/', search_users_view, name='auth-users-search'),
    path('diagram-draft/<str:token>/', views.fetch_drawio_draft, name='diagram-draft'),
    path('', include(router.urls)),
]