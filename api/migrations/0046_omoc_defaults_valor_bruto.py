# Generated manually — backfill OMOC dimensions to Felipe-friendly defaults.

from django.db import migrations


def forwards(apps, schema_editor):
    Omoe = apps.get_model('api', 'Omoe')
    Omoe.objects.filter(rama_evaluacion='omoc').update(
        modo_valor_terminal='valor_bruto',
        escenario_agregacion='minimo_mejor',
    )


def backwards(apps, schema_editor):
    # No-op: previous per-row values are unknown after bulk update.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0045_eventodecision_alcance_nodos'),
    ]

    operations = [
        migrations.RunPython(forwards, backwards),
    ]
