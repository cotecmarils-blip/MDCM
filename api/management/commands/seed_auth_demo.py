"""
Crea usuarios de demostración con roles en el proyecto demo.

Uso:
  python manage.py seed_auth_demo
  python manage.py seed_auth_demo --proyecto-id 3
"""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from api.models import (
    Alternativa,
    EvaluadorMision,
    Mision,
    OfertanteAlternativa,
    Proyecto,
    ProyectoMembership,
)

User = get_user_model()

DEMO_USERS = [
    {
        'username': 'jefe.demo',
        'password': 'DemoJefe2026!',
        'first_name': 'Carlos',
        'last_name': 'Corresponsable',
        'email': 'jefe.demo@cotecmar.local',
        'rol': ProyectoMembership.ROL_JEFE,
    },
    {
        'username': 'analista.demo',
        'password': 'DemoAnalista2026!',
        'first_name': 'Ana',
        'last_name': 'Analista',
        'email': 'analista.demo@cotecmar.local',
        'rol': ProyectoMembership.ROL_ANALISTA,
    },
    {
        'username': 'evaluador.demo',
        'password': 'DemoEval2026!',
        'first_name': 'Eduardo',
        'last_name': 'Evaluador',
        'email': 'evaluador.demo@cotecmar.local',
        'rol': ProyectoMembership.ROL_EVALUADOR,
    },
    {
        'username': 'ofertante.demo',
        'password': 'DemoOferta2026!',
        'first_name': 'Olga',
        'last_name': 'Ofertante',
        'email': 'ofertante.demo@cotecmar.local',
        'rol': ProyectoMembership.ROL_OFERTANTE,
    },
    {
        'username': 'auditor.demo',
        'password': 'DemoAudit2026!',
        'first_name': 'Alberto',
        'last_name': 'Auditor',
        'email': 'auditor.demo@cotecmar.local',
        'rol': ProyectoMembership.ROL_AUDITOR,
    },
]


class Command(BaseCommand):
    help = 'Crea usuarios demo con membresías y asignaciones por rol.'

    def add_arguments(self, parser):
        parser.add_argument('--proyecto-id', type=int, help='ID del proyecto demo')
        parser.add_argument(
            '--create-admin',
            action='store_true',
            help='Crea también superusuario admin / Admin2026!',
        )

    def handle(self, *args, **options):
        proyecto = self._resolve_proyecto(options)
        if options['create_admin']:
            admin, created = User.objects.get_or_create(
                username='admin',
                defaults={
                    'email': 'admin@MCDM.local',
                    'is_staff': True,
                    'is_superuser': True,
                },
            )
            admin.set_password('Admin2026!')
            admin.is_staff = True
            admin.is_superuser = True
            admin.save()
            self.stdout.write(self.style.SUCCESS(
                f'Superusuario admin ({"creado" if created else "actualizado"})'
            ))

        primera_mision = Mision.objects.filter(omoe__proyecto=proyecto).first()
        primera_alternativa = Alternativa.objects.filter(proyecto=proyecto).first()

        for spec in DEMO_USERS:
            user, created = User.objects.get_or_create(
                username=spec['username'],
                defaults={
                    'first_name': spec['first_name'],
                    'last_name': spec['last_name'],
                    'email': spec['email'],
                },
            )
            user.set_password(spec['password'])
            user.save()

            membership, _ = ProyectoMembership.objects.update_or_create(
                proyecto=proyecto,
                usuario=user,
                defaults={'rol': spec['rol'], 'activo': True},
            )

            EvaluadorMision.objects.filter(membership=membership).delete()
            OfertanteAlternativa.objects.filter(membership=membership).delete()

            if spec['rol'] == ProyectoMembership.ROL_EVALUADOR and primera_mision:
                EvaluadorMision.objects.get_or_create(
                    membership=membership,
                    mision=primera_mision,
                )
            if spec['rol'] == ProyectoMembership.ROL_OFERTANTE and primera_alternativa:
                OfertanteAlternativa.objects.get_or_create(
                    membership=membership,
                    alternativa=primera_alternativa,
                )

            self.stdout.write(
                f'  {spec["username"]} / {spec["password"]} -> {spec["rol"]}'
            )

        self.stdout.write(self.style.SUCCESS(
            f'Usuarios demo listos para proyecto id={proyecto.id} «{proyecto.nombre}»'
        ))

    def _resolve_proyecto(self, options):
        if options.get('proyecto_id'):
            return Proyecto.objects.get(pk=options['proyecto_id'])
        proyecto = Proyecto.objects.filter(nombre__icontains='demo').first()
        if proyecto:
            return proyecto
        return Proyecto.objects.order_by('-id').first()
