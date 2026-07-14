# Generated manually — add peor_caso aggregation choice (Eq. 23).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_omoc_defaults_valor_bruto'),
    ]

    operations = [
        migrations.AlterField(
            model_name='omoe',
            name='escenario_agregacion',
            field=models.CharField(
                choices=[
                    ('compensatorio', 'Compensatorio (suma ponderada)'),
                    ('minimo_mejor', 'Mínimo-mejor (escenario más favorable)'),
                    ('maximo_mejor', 'Máximo-mejor (escenario más favorable)'),
                    ('peor_caso', 'Peor caso (resolución robusta)'),
                    ('independiente', 'Independiente (sin agregación global)'),
                ],
                default='compensatorio',
                help_text='Cómo se combinan los escenarios al calcular la dimensión.',
                max_length=24,
            ),
        ),
    ]
