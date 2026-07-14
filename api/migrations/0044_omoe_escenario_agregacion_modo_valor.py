from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0043_eventodecision_auditoria'),
    ]

    operations = [
        migrations.AddField(
            model_name='omoe',
            name='escenario_agregacion',
            field=models.CharField(
                choices=[
                    ('compensatorio', 'Compensatorio (suma ponderada)'),
                    ('minimo_mejor', 'Mínimo-mejor (escenario más favorable)'),
                    ('maximo_mejor', 'Máximo-mejor (escenario más favorable)'),
                    ('independiente', 'Independiente (sin agregación global)'),
                ],
                default='compensatorio',
                help_text='Cómo se combinan los escenarios al calcular la dimensión.',
                max_length=24,
            ),
        ),
        migrations.AddField(
            model_name='omoe',
            name='modo_valor_terminal',
            field=models.CharField(
                choices=[
                    ('utilidad', 'Función de utilidad (0–1)'),
                    ('valor_bruto', 'Valor bruto (sin transformación)'),
                ],
                default='utilidad',
                help_text='Utilidad normalizada o valor x tal cual (típico en costos).',
                max_length=16,
            ),
        ),
    ]
