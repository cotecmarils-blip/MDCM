# Generated manually — TipoDimension catalog + widen rama codes.

from django.db import migrations, models


def seed_tipos(apps, schema_editor):
    TipoDimension = apps.get_model('api', 'TipoDimension')
    rows = [
        {
            'codigo': 'omoe',
            'nombre': 'OMOE — Efectividad / desempeño',
            'descripcion': 'Dimensión de efectividad operativa (beneficio: mayor es mejor).',
            'sentido_optimizacion': 'max',
            'escenario_agregacion_default': 'compensatorio',
            'modo_valor_terminal_default': 'utilidad',
            'orden': 1,
            'es_sistema': True,
            'activo': True,
        },
        {
            'codigo': 'omoc',
            'nombre': 'OMOC — Costo',
            'descripcion': 'Dimensión de costos (menor es mejor; valor bruto típico).',
            'sentido_optimizacion': 'min',
            'escenario_agregacion_default': 'minimo_mejor',
            'modo_valor_terminal_default': 'valor_bruto',
            'orden': 2,
            'es_sistema': True,
            'activo': True,
        },
        {
            'codigo': 'omor',
            'nombre': 'OMOR — Riesgo',
            'descripcion': 'Dimensión de riesgos (menor exposición es mejor).',
            'sentido_optimizacion': 'min',
            'escenario_agregacion_default': 'minimo_mejor',
            'modo_valor_terminal_default': 'utilidad',
            'orden': 3,
            'es_sistema': True,
            'activo': True,
        },
    ]
    for row in rows:
        TipoDimension.objects.update_or_create(codigo=row['codigo'], defaults=row)


def unseed_tipos(apps, schema_editor):
    TipoDimension = apps.get_model('api', 'TipoDimension')
    TipoDimension.objects.filter(codigo__in=['omoe', 'omoc', 'omor']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_omoe_escenario_agregacion_peor_caso'),
    ]

    operations = [
        migrations.CreateModel(
            name='TipoDimension',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('codigo', models.CharField(help_text='Código estable (p. ej. omoe, omoc, sostenibilidad).', max_length=32, unique=True)),
                ('nombre', models.CharField(max_length=128)),
                ('descripcion', models.TextField(blank=True)),
                ('sentido_optimizacion', models.CharField(choices=[('max', 'Maximizar (beneficio)'), ('min', 'Minimizar (costo / riesgo)')], default='max', help_text='Dirección MADM/Pareto: max o min.', max_length=8)),
                ('escenario_agregacion_default', models.CharField(default='compensatorio', max_length=24)),
                ('modo_valor_terminal_default', models.CharField(default='utilidad', max_length=16)),
                ('activo', models.BooleanField(default=True)),
                ('es_sistema', models.BooleanField(default=False, help_text='Tipos semilla (omoe/omoc/omor); no se elimina el código.')),
                ('orden', models.PositiveIntegerField(default=0)),
                ('fecha_creacion', models.DateTimeField(auto_now_add=True)),
                ('fecha_actualizacion', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Tipo de dimensión',
                'verbose_name_plural': 'Tipos de dimensión',
                'ordering': ['orden', 'codigo', 'id'],
            },
        ),
        migrations.AlterField(
            model_name='escenario',
            name='rama_evaluacion',
            field=models.CharField(default='omoe', help_text='Rama / tipo de dimensión (código del catálogo TipoDimension).', max_length=32),
        ),
        migrations.AlterField(
            model_name='grupoafinidad',
            name='rama_evaluacion',
            field=models.CharField(blank=True, default='auto', help_text='Código de tipo de dimensión o «auto».', max_length=32),
        ),
        migrations.AlterField(
            model_name='omoe',
            name='rama_evaluacion',
            field=models.CharField(default='omoe', help_text='Código del tipo de dimensión (catálogo global).', max_length=32),
        ),
        migrations.AlterField(
            model_name='proyectonivelarbol',
            name='rama_evaluacion',
            field=models.CharField(default='omoe', help_text='Código de tipo de dimensión a la que aplica este nivel (por proyecto).', max_length=32),
        ),
        migrations.RunPython(seed_tipos, unseed_tipos),
    ]
