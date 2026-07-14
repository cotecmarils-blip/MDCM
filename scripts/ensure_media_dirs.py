"""Crea subcarpetas de MEDIA_ROOT (p. ej. volumen Railway en /data/media)."""
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.conf import settings  # noqa: E402

SUBDIRS = (
    'proyectos',
    'alternativas/fotos',
    'alternativas/anexos',
    'usuarios/fotos',
    'documentos',
    'documentos_criterios',
)


def main():
    root = Path(settings.MEDIA_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    for sub in SUBDIRS:
        (root / sub).mkdir(parents=True, exist_ok=True)
    writable = os.access(root, os.W_OK)
    print(f'MEDIA_ROOT={root} writable={writable} subdirs={len(SUBDIRS)}')


if __name__ == '__main__':
    main()
