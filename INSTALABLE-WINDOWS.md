# App instalable para Windows (sin internet)

La app se puede empaquetar como ejecutable de Windows para usar **sin conexión** en cualquier PC.

## Requisitos (solo en el PC donde generas el instalador)

- Node.js 18+
- Una sola vez: conexión a internet para instalar dependencias y descargar Electron

## Pasos para generar el instalador / ejecutable

1. **Instalar dependencias** (solo la primera vez, requiere internet):
   ```bash
   npm install
   ```

2. **Generar la app para escritorio**:
   ```bash
   npm run build:app
   ```
   Esto hace:
   - `next build` → genera la carpeta `out` con la web estática
   - `electron-builder` → empaqueta todo en un instalador y/o ejecutable portable

3. **Resultado** (en la carpeta `dist/`):
   - **Instalador**: `dist/Photo Printer X.X.X Setup.exe` (instala la app en el PC)
   - **Portable**: `dist/photo-printer X.X.X.exe` (ejecutable que no requiere instalación)

## Llevar la app a otro PC (sin internet)

- Copia **`Photo Printer X.X.X Setup.exe`** (o el .exe portable) a un pendrive o red.
- En el otro PC: ejecuta el .exe. No hace falta Node ni internet.
- La app abre una ventana con la misma interfaz que en el navegador.

## Probar en modo escritorio (sin empaquetar)

Con la carpeta `out` ya generada (`npm run build`):

```bash
npm run electron
```

Se abre la ventana de Electron cargando la app desde `out/`. Útil para probar antes de hacer el instalador.

## Notas

- La primera vez que ejecutes `npm run build:app`, electron-builder descargará los binarios de Electron (puede tardar un poco).
- El .exe resultante **no necesita internet** para funcionar; todo va incluido.
- El instalador/portable se genera **sin firma de código** para evitar errores de permisos en Windows (enlaces simbólicos). Windows puede mostrar una advertencia al ejecutar; es normal para apps no firmadas.
- Si solo quieres la web estática (sin Electron), la carpeta `out/` se puede servir con cualquier servidor HTTP o abrir en local con `npx serve out`.
