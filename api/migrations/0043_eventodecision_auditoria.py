from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0042_configarbolhistorial'),
    ]

    operations = [
        migrations.CreateModel(
            name='EventoDecision',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=255)),
                ('descripcion', models.TextField(blank=True)),
                ('estado', models.CharField(choices=[('borrador', 'Borrador'), ('activo', 'Activo'), ('cerrado', 'Cerrado')], default='borrador', max_length=16)),
                ('tipo_proceso', models.CharField(choices=[('consenso', 'Consenso directo'), ('agregacion', 'Agregación individual (futuro)')], default='consenso', max_length=16)),
                ('mediador_nombre', models.CharField(blank=True, max_length=255)),
                ('mediador_cargo', models.CharField(blank=True, max_length=255)),
                ('mediador_dependencia', models.CharField(blank=True, max_length=255)),
                ('fecha_inicio', models.DateTimeField(blank=True, null=True)),
                ('fecha_cierre', models.DateTimeField(blank=True, null=True)),
                ('justificacion_cierre', models.TextField(blank=True)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
                ('creado_por', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='eventos_decision_creados', to=settings.AUTH_USER_MODEL)),
                ('mediador_usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='eventos_decision_mediados', to=settings.AUTH_USER_MODEL)),
                ('omoe', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='eventos_decision', to='api.omoe')),
                ('proyecto', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='eventos_decision', to='api.proyecto')),
            ],
            options={
                'verbose_name': 'Evento de decisión',
                'verbose_name_plural': 'Eventos de decisión',
                'ordering': ['-fecha_creacion', '-id'],
            },
        ),
        migrations.CreateModel(
            name='EventoDecisionParticipante',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('nombre', models.CharField(max_length=255)),
                ('cargo', models.CharField(blank=True, max_length=255)),
                ('rol', models.CharField(blank=True, max_length=128)),
                ('dependencia', models.CharField(blank=True, max_length=255)),
                ('evento', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='participantes', to='api.eventodecision')),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='participaciones_evento_decision', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Participante de evento',
                'verbose_name_plural': 'Participantes de evento',
                'ordering': ['nombre', 'id'],
            },
        ),
        migrations.CreateModel(
            name='EventoDecisionRegistro',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('escenario_id', models.IntegerField(blank=True, null=True)),
                ('tipo_cambio', models.CharField(choices=[('peso', 'Peso'), ('utilidad', 'Función de utilidad'), ('estructura', 'Estructura del árbol'), ('matriz', 'Matriz de comparación'), ('config_escenario', 'Configuración por escenario'), ('otro', 'Otro')], max_length=24)),
                ('entidad_tipo', models.CharField(max_length=64)),
                ('entidad_id', models.IntegerField(blank=True, null=True)),
                ('entidad_nombre', models.CharField(blank=True, max_length=255)),
                ('campo', models.CharField(blank=True, max_length=64)),
                ('valor_anterior', models.JSONField(blank=True, null=True)),
                ('valor_nuevo', models.JSONField(blank=True, null=True)),
                ('notas', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('evento', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='registros', to='api.eventodecision')),
                ('omoe', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='registros_auditoria', to='api.omoe')),
                ('proyecto', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='registros_auditoria', to='api.proyecto')),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='registros_auditoria', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Registro de auditoría',
                'verbose_name_plural': 'Registros de auditoría',
                'ordering': ['-fecha_creacion', '-id'],
            },
        ),
    ]
