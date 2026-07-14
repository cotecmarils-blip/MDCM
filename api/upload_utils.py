import os
import uuid

from django.utils.text import get_valid_filename

# Django FileField/ImageField default max_length=100; rutas largas fallan al guardar.
FILE_FIELD_MAX_LENGTH = 500


def _safe_ext(filename, default='.bin'):
    ext = os.path.splitext(get_valid_filename(filename))[1].lower()
    if ext and len(ext) <= 10:
        return ext
    return default


def unique_upload_path(folder, filename, default_ext='.bin'):
    """Ruta corta y única; evita SuspiciousFileOperation por nombres muy largos."""
    ext = _safe_ext(filename, default_ext)
    return f'{folder}/{uuid.uuid4().hex}{ext}'


def proyecto_foto_upload(instance, filename):
    return unique_upload_path('proyectos', filename, '.jpg')


def alternativa_foto_upload(instance, filename):
    return unique_upload_path('alternativas/fotos', filename, '.jpg')


def alternativa_anexo_upload(instance, filename):
    return unique_upload_path('alternativas/anexos', filename, '.pdf')


def documento_upload(instance, filename):
    return unique_upload_path('documentos', filename)


def documento_criterio_upload(instance, filename):
    return unique_upload_path('documentos_criterios', filename)


def usuario_foto_upload(instance, filename):
    return unique_upload_path('usuarios/fotos', filename, '.jpg')
