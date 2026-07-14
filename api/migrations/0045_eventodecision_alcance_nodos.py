from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0044_omoe_escenario_agregacion_modo_valor'),
    ]

    operations = [
        migrations.AddField(
            model_name='eventodecision',
            name='alcance_modo',
            field=models.CharField(
                choices=[
                    ('dimension_completa', 'Dimensión completa'),
                    ('nodos_seleccionados', 'Nodos seleccionados'),
                ],
                default='dimension_completa',
                max_length=24,
            ),
        ),
        migrations.CreateModel(
            name='EventoDecisionNodo',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('evento', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='nodos_auditoria', to='api.eventodecision')),
                ('nodo', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sesiones_auditoria', to='api.nodoarbol')),
            ],
            options={
                'verbose_name': 'Nodo en alcance de sesión',
                'verbose_name_plural': 'Nodos en alcance de sesión',
                'ordering': ['nodo__orden_visual', 'nodo__nombre', 'id'],
            },
        ),
        migrations.AddConstraint(
            model_name='eventodecisionnodo',
            constraint=models.UniqueConstraint(fields=('evento', 'nodo'), name='uniq_evento_nodo_auditoria'),
        ),
    ]
