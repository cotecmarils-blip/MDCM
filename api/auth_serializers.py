from django.contrib.auth import get_user_model
from django.db import transaction
from rest_framework import serializers

from .access import compute_fecha_acceso_hasta, membership_access_status, valid_membership_q
from .password_utils import assert_password_valid
from .models import (
    Alternativa,
    EvaluadorMision,
    Mision,
    OfertanteAlternativa,
    ProyectoMembership,
)

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    foto = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'email', 'foto']
        read_only_fields = fields

    def get_foto(self, obj):
        profile = getattr(obj, 'profile', None)
        if profile is None:
            profile = getattr(obj, '_cached_profile', None)
        if profile is None:
            from .models import UserProfile
            profile = UserProfile.objects.filter(user=obj).first()
        if profile and profile.foto:
            return profile.foto.url
        return None


class UserProfileUpdateSerializer(serializers.Serializer):
    username = serializers.CharField(required=False, max_length=150)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True, max_length=254)
    foto = serializers.ImageField(required=False, allow_null=True)
    quitar_foto = serializers.BooleanField(required=False, default=False)

    def validate_username(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('El nombre de usuario no puede estar vacío.')
        user = self.context['user']
        if User.objects.filter(username__iexact=value).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Ya existe un usuario con ese nombre.')
        return value

    def validate_email(self, value):
        email = (value or '').strip()
        user = self.context['user']
        if email and User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            raise serializers.ValidationError('Ya existe un usuario con ese correo.')
        return email

    def update(self, instance, validated_data):
        from .user_profile import get_or_create_user_profile

        user = instance
        profile = get_or_create_user_profile(user)

        quitar_foto = validated_data.pop('quitar_foto', False)
        foto = validated_data.pop('foto', serializers.empty)

        for field in ('username', 'first_name', 'last_name', 'email'):
            if field in validated_data:
                setattr(user, field, validated_data[field])
        user.save()

        if quitar_foto and profile.foto:
            profile.foto.delete(save=False)
            profile.foto = None
            profile.save(update_fields=['foto', 'fecha_actualizacion'])
        elif foto is not serializers.empty and foto is not None:
            if profile.foto:
                profile.foto.delete(save=False)
            profile.foto = foto
            profile.save(update_fields=['foto', 'fecha_actualizacion'])

        return user


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_new_password(self, value):
        assert_password_valid(value, self.context['request'].user)
        return value


class EvaluadorMisionSerializer(serializers.ModelSerializer):
    mision_nombre = serializers.CharField(source='mision.nombre_mision', read_only=True)

    class Meta:
        model = EvaluadorMision
        fields = ['id', 'mision', 'mision_nombre']


class OfertanteAlternativaSerializer(serializers.ModelSerializer):
    alternativa_nombre = serializers.CharField(source='alternativa.nombre', read_only=True)

    class Meta:
        model = OfertanteAlternativa
        fields = ['id', 'alternativa', 'alternativa_nombre']


class ProyectoMembershipSerializer(serializers.ModelSerializer):
    usuario = UserSerializer(read_only=True)
    usuario_id = serializers.IntegerField(write_only=True, required=False)
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)
    username = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    password = serializers.CharField(
        write_only=True,
        required=False,
        trim_whitespace=False,
        style={'input_type': 'password'},
    )
    first_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    last_name = serializers.CharField(write_only=True, required=False, allow_blank=True)
    misiones_asignadas = EvaluadorMisionSerializer(many=True, read_only=True)
    alternativas_asignadas = OfertanteAlternativaSerializer(many=True, read_only=True)
    mision_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list,
    )
    alternativa_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list,
    )
    dias_acceso = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        min_value=0,
        max_value=3650,
        help_text='Días de acceso desde ahora.',
    )
    horas_acceso = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        min_value=0,
        max_value=8760,
        help_text='Horas adicionales de acceso desde ahora.',
    )
    minutos_acceso = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
        min_value=0,
        max_value=59,
        help_text='Minutos adicionales de acceso desde ahora.',
    )
    limpiar_vencimiento = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
        help_text='Si es true, quita la fecha de vencimiento (acceso indefinido).',
    )
    estado_acceso = serializers.SerializerMethodField()
    acceso_vigente = serializers.SerializerMethodField()

    class Meta:
        model = ProyectoMembership
        fields = [
            'id',
            'proyecto',
            'proyecto_nombre',
            'usuario',
            'usuario_id',
            'username',
            'email',
            'password',
            'first_name',
            'last_name',
            'rol',
            'activo',
            'fecha_acceso_hasta',
            'estado_acceso',
            'acceso_vigente',
            'dias_acceso',
            'horas_acceso',
            'minutos_acceso',
            'limpiar_vencimiento',
            'misiones_asignadas',
            'alternativas_asignadas',
            'mision_ids',
            'alternativa_ids',
            'fecha_creacion',
            'fecha_actualizacion',
        ]
        read_only_fields = [
            'fecha_creacion',
            'fecha_actualizacion',
            'estado_acceso',
            'acceso_vigente',
        ]
        extra_kwargs = {
            'usuario': {'required': False},
        }

    def get_estado_acceso(self, obj):
        return membership_access_status(obj)

    def get_acceso_vigente(self, obj):
        return membership_access_status(obj) == 'vigente'

    def _apply_access_fields(self, attrs):
        dias_acceso = attrs.pop('dias_acceso', None)
        horas_acceso = attrs.pop('horas_acceso', None)
        minutos_acceso = attrs.pop('minutos_acceso', None)
        limpiar_vencimiento = attrs.pop('limpiar_vencimiento', False)
        activo = attrs.get('activo')
        if activo is None and self.instance:
            activo = self.instance.activo

        if limpiar_vencimiento:
            attrs['fecha_acceso_hasta'] = None
        elif any(v is not None for v in (dias_acceso, horas_acceso, minutos_acceso)):
            attrs['fecha_acceso_hasta'] = compute_fecha_acceso_hasta(
                dias=dias_acceso or 0,
                horas=horas_acceso or 0,
                minutos=minutos_acceso or 0,
            )
        elif activo is False:
            # Revocar acceso: conservar fecha para historial, el flag activo bloquea.
            pass
        return attrs

    def validate(self, attrs):
        rol = attrs.get('rol') or getattr(self.instance, 'rol', None)
        mision_ids = attrs.get('mision_ids', [])
        alternativa_ids = attrs.get('alternativa_ids', [])
        proyecto = attrs.get('proyecto') or getattr(self.instance, 'proyecto', None)
        username = attrs.pop('username', None)
        usuario_id = attrs.pop('usuario_id', None)
        email_raw = attrs.pop('email', None)
        password = attrs.pop('password', None)
        first_name_raw = attrs.pop('first_name', None)
        last_name_raw = attrs.pop('last_name', None)
        email = (email_raw or '').strip() if email_raw is not None else None
        first_name = (first_name_raw or '').strip() if first_name_raw is not None else None
        last_name = (last_name_raw or '').strip() if last_name_raw is not None else None
        self._pending_user = None
        self._pending_user_update = None

        if self.instance:
            user = self.instance.usuario
            update_fields = {}
            if username is not None:
                username = username.strip()
                if not username:
                    raise serializers.ValidationError(
                        {'username': 'El nombre de usuario no puede estar vacío.'}
                    )
                if username != user.username:
                    if User.objects.filter(username=username).exclude(pk=user.pk).exists():
                        raise serializers.ValidationError(
                            {'username': 'Ya existe un usuario con ese nombre de usuario.'}
                        )
                    update_fields['username'] = username
            if email is not None and email != (user.email or ''):
                if email and User.objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
                    raise serializers.ValidationError(
                        {'email': 'Ya existe un usuario con ese correo electrónico.'}
                    )
                update_fields['email'] = email
            if first_name is not None:
                update_fields['first_name'] = first_name
            if last_name is not None:
                update_fields['last_name'] = last_name
            if password:
                assert_password_valid(password, user)
                update_fields['password'] = password
            if update_fields:
                self._pending_user_update = update_fields
        elif usuario_id and not self.instance:
            try:
                attrs['usuario'] = User.objects.get(pk=int(usuario_id))
            except (User.DoesNotExist, TypeError, ValueError):
                raise serializers.ValidationError(
                    {'usuario_id': 'Usuario no encontrado.'}
                )
        elif username and not attrs.get('usuario') and not self.instance:
            username = username.strip()
            if not username:
                raise serializers.ValidationError(
                    {'username': 'El nombre de usuario no puede estar vacío.'}
                )
            existing = User.objects.filter(username__iexact=username).first()
            if existing:
                attrs['usuario'] = existing
            else:
                if not password:
                    raise serializers.ValidationError(
                        {
                            'password': (
                                'La contraseña es obligatoria para crear un usuario nuevo.'
                            ),
                        }
                    )
                if email and User.objects.filter(email__iexact=email).exists():
                    raise serializers.ValidationError(
                        {'email': 'Ya existe un usuario con ese correo electrónico.'}
                    )
                temp_user = User(
                    username=username,
                    email=email,
                    first_name=first_name,
                    last_name=last_name,
                )
                assert_password_valid(password, temp_user)
                self._pending_user = {
                    'username': username,
                    'email': email,
                    'password': password,
                    'first_name': first_name,
                    'last_name': last_name,
                }

        if not self.instance and attrs.get('usuario') and proyecto:
            dup = ProyectoMembership.objects.filter(
                usuario=attrs['usuario'],
                proyecto=proyecto,
            )
            if dup.exists():
                raise serializers.ValidationError(
                    {'usuario_id': 'Este usuario ya está asignado a este proyecto.'}
                )

        if not self.instance and not attrs.get('usuario') and not self._pending_user:
            raise serializers.ValidationError(
                {'username': 'Indique el nombre de usuario o seleccione un usuario existente.'}
            )

        if rol == ProyectoMembership.ROL_EVALUADOR and mision_ids and proyecto:
            valid = set(
                Mision.objects.filter(
                    omoe__proyecto_id=proyecto.id,
                    id__in=mision_ids,
                ).values_list('id', flat=True)
            )
            invalid = set(mision_ids) - valid
            if invalid:
                raise serializers.ValidationError(
                    {'mision_ids': f'Misiones inválidas para el proyecto: {sorted(invalid)}'}
                )

        if rol == ProyectoMembership.ROL_OFERTANTE and alternativa_ids and proyecto:
            valid = set(
                Alternativa.objects.filter(
                    proyecto_id=proyecto.id,
                    id__in=alternativa_ids,
                ).values_list('id', flat=True)
            )
            invalid = set(alternativa_ids) - valid
            if invalid:
                raise serializers.ValidationError(
                    {'alternativa_ids': f'Alternativas inválidas: {sorted(invalid)}'}
                )

        usuario = attrs.get('usuario') or getattr(self.instance, 'usuario', None)
        if rol == ProyectoMembership.ROL_ANALISTA and usuario:
            validar_unico_proyecto = True
            if self.instance and self.instance.rol == ProyectoMembership.ROL_ANALISTA:
                activo_nuevo = attrs.get('activo', self.instance.activo)
                reactivando = not self.instance.activo and activo_nuevo
                if not reactivando:
                    # Edición de acceso/rol sin reactivar: no bloquear guardado.
                    validar_unico_proyecto = False
            if validar_unico_proyecto:
                qs = ProyectoMembership.objects.filter(
                    usuario=usuario,
                    rol=ProyectoMembership.ROL_ANALISTA,
                ).filter(valid_membership_q())
                if self.instance:
                    qs = qs.exclude(pk=self.instance.pk)
                proyecto_obj = proyecto or getattr(self.instance, 'proyecto', None)
                if proyecto_obj:
                    qs = qs.exclude(proyecto_id=proyecto_obj.id)
                if qs.exists():
                    raise serializers.ValidationError(
                        {
                            'rol': (
                                'Un ingeniero solo puede estar asignado a un proyecto activo.'
                            ),
                        }
                    )
        attrs = self._apply_access_fields(attrs)
        if attrs.get('fecha_acceso_hasta') is None and any(
            self.initial_data.get(k) is not None
            for k in ('dias_acceso', 'horas_acceso', 'minutos_acceso')
        ) and not self.initial_data.get('limpiar_vencimiento'):
            raise serializers.ValidationError(
                {
                    'dias_acceso': (
                        'Indique al menos un día, hora o minuto de acceso mayor a cero.'
                    ),
                }
            )
        return attrs

    def _sync_assignments(self, membership, mision_ids, alternativa_ids):
        EvaluadorMision.objects.filter(membership=membership).delete()
        OfertanteAlternativa.objects.filter(membership=membership).delete()

        if membership.rol == ProyectoMembership.ROL_EVALUADOR:
            for mision_id in mision_ids:
                EvaluadorMision.objects.create(membership=membership, mision_id=mision_id)
        if membership.rol == ProyectoMembership.ROL_OFERTANTE:
            for alt_id in alternativa_ids:
                OfertanteAlternativa.objects.create(
                    membership=membership, alternativa_id=alt_id
                )

    @transaction.atomic
    def create(self, validated_data):
        mision_ids = validated_data.pop('mision_ids', [])
        alternativa_ids = validated_data.pop('alternativa_ids', [])
        pending = getattr(self, '_pending_user', None)
        if pending:
            validated_data['usuario'] = User.objects.create_user(
                username=pending['username'],
                email=pending['email'],
                password=pending['password'],
                first_name=pending['first_name'],
                last_name=pending['last_name'],
            )
        membership = super().create(validated_data)
        self._sync_assignments(membership, mision_ids, alternativa_ids)
        return membership

    def update(self, instance, validated_data):
        mision_ids = validated_data.pop('mision_ids', None)
        alternativa_ids = validated_data.pop('alternativa_ids', None)
        pending_update = getattr(self, '_pending_user_update', None)
        if pending_update:
            user = instance.usuario
            password = pending_update.pop('password', None)
            for field, value in pending_update.items():
                setattr(user, field, value)
            if password:
                user.set_password(password)
            user.save()
        membership = super().update(instance, validated_data)
        if mision_ids is not None or alternativa_ids is not None:
            self._sync_assignments(
                membership,
                mision_ids if mision_ids is not None else [],
                alternativa_ids if alternativa_ids is not None else [],
            )
        return membership
