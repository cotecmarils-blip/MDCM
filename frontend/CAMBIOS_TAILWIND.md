# Reemplazo de Material-UI con Tailwind CSS - Instrucciones

## Cambios realizados

✅ **Archivos actualizados:**

1. **tailwind.config.js** - Creado con configuración de Tailwind
2. **postcss.config.js** - Creado con configuración de PostCSS
3. **src/index.css** - Actualizado con directivas de Tailwind
4. **src/App.js** - Removidas importaciones de Material-UI y ThemeProvider
5. **src/ProjectsPage.js** - Reescrito completamente con Tailwind CSS
6. **src/components/ProjectFormModal.js** - Reescrito con Tailwind CSS
7. **package.json** - Actualizado: Material-UI removido, Tailwind CSS agregado

## Próximos pasos

### Paso 1: Instalar dependencias
Ejecuta en la terminal de Windows:

```cmd
cd "c:\Users\btovar\OneDrive - Cotecmar\Escritorio\CODIGOS\MCDM\frontend"
npm install
```

O haz doble click en: `install-dependencies.bat`

### Paso 2: Iniciar el servidor de desarrollo

```cmd
npm start
```

El navegador debería abrir automáticamente en http://localhost:3000

## Características del nuevo diseño Tailwind

✨ **Tema oscuro moderno** - Gradiente de slate (gris oscuro)
✨ **Interfaz limpia** - Modal con overlay oscuro
✨ **Animaciones** - Spinner de carga y hover effects
✨ **Responsive** - Grid responsivo (1 columna en móvil, 3 en desktop)
✨ **Mejor UX** - Campos de formulario con focus ring

## Qué cambió

### Antes (Material-UI)
- Componentes MUI (Button, Card, Dialog, TextField, etc.)
- ThemeProvider con configuración de tema
- CssBaseline para reset de estilos
- Estilos con prop `sx` de MUI

### Después (Tailwind CSS)
- HTML/CSS nativo con clases Tailwind
- Sin dependencias de Material-UI
- Sin ThemeProvider necesario
- Estilos directamente en className

## Verificación

Cuando ejecutes `npm start`, verifica:

✓ No hay errores de compilación
✓ La página carga correctamente
✓ Los estilos se ven oscuros y modernos
✓ El botón "Nuevo Proyecto" abre un modal
✓ Puedes escribir en los campos del formulario
✓ Responsive design funciona (abre DevTools: F12)
