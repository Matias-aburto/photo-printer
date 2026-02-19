# Photo Grid Printer

Sistema para simplificar la impresión de fotos: grids tipo presets, arrastrar fotos a cada recuadro y exportar a PDF a 300 DPI.

## Características

- **Presets de grid**: A4 1×1, 2×2, 2×3, 3×3, 4×4; hoja 10×15 cm 2×2.
- **Arrastrar y soltar**: Arrastra fotos desde el escritorio o entre celdas; las fotos encajan exactamente en cada recuadro (object-fit cover).
- **Exportar PDF**: Descarga un PDF listo para impresión a 300 DPI.

## Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS v4
- UI estilo shadcn (tema [TweakCN Theme Main](https://tweakcn.com/r/themes/cmlpktt8i000004jf4rwd89ah) — Outfit, oklch)
- jsPDF para la exportación

## Desarrollo

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

## Instalable (Windows)

### Desarrollo local

Para generar el instalador de escritorio localmente:

```bash
npm run build:app
```

Los instaladores quedan en `dist/` (NSIS y portable).

### Releases en GitHub

Para crear una release con el instalable disponible para descargar:

1. **Crear un tag de versión:**
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **GitHub Actions automáticamente:**
   - Construirá el instalable
   - Creará un release con el tag
   - Subirá el `.exe` como archivo descargable

3. **Descargar desde GitHub:**
   - Ve a [Releases](https://github.com/Matias-aburto/photo-printer/releases)
   - Descarga el `.exe` de la versión que necesites

**Nota:** El workflow también se puede ejecutar manualmente desde la pestaña "Actions" en GitHub.

## Añadir el tema shadcn desde TweakCN

Si quieres volver a aplicar el tema o añadir más componentes:

```bash
npx shadcn@latest add https://tweakcn.com/r/themes/cmlpktt8i000004jf4rwd89ah
```

El proyecto ya tiene el tema aplicado manualmente en `src/app/globals.css` y la fuente Outfit en `layout.tsx`.
