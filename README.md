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

Para generar el instalador de escritorio:

```bash
npm run build:app
```

Los instaladores quedan en `dist/` (NSIS y portable).

## Añadir el tema shadcn desde TweakCN

Si quieres volver a aplicar el tema o añadir más componentes:

```bash
npx shadcn@latest add https://tweakcn.com/r/themes/cmlpktt8i000004jf4rwd89ah
```

El proyecto ya tiene el tema aplicado manualmente en `src/app/globals.css` y la fuente Outfit en `layout.tsx`.
