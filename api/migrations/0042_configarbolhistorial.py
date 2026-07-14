from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('api', '0041_userprofile'),
    ]

    operations = [
        migrations.CreateModel(
            name='ConfigArbolHistorial',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('momento', models.CharField(choices=[('estructura', 'Estructura del árbol'), ('utilidad', 'Funciones de utilidad'), ('pesos', 'Pesos y escenarios'), ('evaluacion', 'Matriz de evaluación')], max_length=16)),
                ('notas', models.TextField(blank=True)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('omoe', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='config_historial', to='api.omoe')),
                ('proyecto', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='config_historial', to='api.proyecto')),
                ('usuario', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='config_historial_registros', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Historial de configuración del árbol',
                'verbose_name_plural': 'Historial de configuración del árbol',
                'ordering': ['-fecha_creacion', '-id'],
            },
        ),
    ]
