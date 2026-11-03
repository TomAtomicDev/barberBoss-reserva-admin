<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

# Contexto del proyecto

## Objetivo y fuentes

- Construir un **demo frontend navegable** de reservas y gestión para una barbería, con un propietario y un barbero, para validar el producto antes de desarrollar el backend.
- Para el alcance y los criterios de aceptación del demo, consultar `docs/MVP/diseño_demo.md`. Para las políticas y el contexto del producto futuro, consultar `docs/MVP/definicion_mvp.md`. En caso de diferencias sobre la implementación del demo, prevalecen sus límites específicos. No modificar la definición del MVP para adaptar el demo.
- La arquitectura prevista para el demo es React, Vite, TypeScript y shadcn/ui, publicada como sitio estático en GitHub Pages. Tratarla como objetivo, no asumir que todas las dependencias o funcionalidades ya están implementadas.

## Límites que deben quedar claros en la interfaz

- Las reservas, la disponibilidad, los pagos y el dashboard se simulan en el navegador actual mediante `localStorage`. No hay servidor, sincronización entre dispositivos, bloqueo concurrente ni garantía de disponibilidad real.
- El acceso al dashboard es una simulación visual: no protege rutas ni datos. No usar credenciales reales, secretos ni datos sensibles; recomendar datos ficticios o de prueba.
- El QR bancario y el enlace a WhatsApp son reales: una transferencia puede mover dinero aunque la demostración esté controlada. Advertirlo antes de mostrar el QR; nunca afirmar que el pago fue verificado o que se confirmó una cita por pulsar «Ya pagué».
- Abrir WhatsApp no demuestra que se haya enviado el mensaje ni el comprobante. La solicitud no llega automáticamente al propietario; el dashboard de otro dispositivo no la recibe. El número de destino previsto es `59171214364`, configurable públicamente.
- No implementar backend, autenticación real, sincronización, verificación bancaria, carga de comprobantes ni modo offline como parte del demo. La arquitectura conectada descrita en los documentos es una propuesta futura.

## Reglas importantes de implementación

- Separar reglas de dominio y componentes; encapsular `localStorage` en un repositorio con esquema versionado. Informar si falla el almacenamiento y ofrecer restauración explícita y confirmada ante datos incompatibles, sin borrado silencioso.
- Calcular disponibilidad localmente a partir de horarios, pausas, excepciones e intervalos ocupados; usar la zona horaria configurada, inicios cada 30 minutos, anticipación mínima de una hora y horizonte máximo de seis semanas. Los servicios que requieren consulta no pasan por reserva y pago directos.
- Las reservas provisionales vencen tras 15 minutos según el reloj del dispositivo. Reevaluar el vencimiento al cargar, antes de calcular disponibilidad y antes de declarar el pago. `PENDING_VERIFICATION` no vence automáticamente; sus estados y los del pago son independientes.
- Conservar el precio y la duración de cada servicio al reservar. Separar servicios realizados de cobros y devoluciones; no duplicar el anticipo al completar una atención.
- Usar URLs de recursos compatibles con el `base` de Vite y navegación compatible con recargas en GitHub Pages. El QR proporcionado debe publicarse y comprobarse visualmente y con una aplicación bancaria, sin realizar transferencias involuntarias.
- Priorizar diseño mobile-first, accesibilidad y mensajes explícitos sobre las limitaciones. Probar reglas de agenda, vencimientos, persistencia, flujos de pago simulados y ausencia de doble conteo.

## Skills del proyecto

Las siguientes skills están en `.agents/skills/`. Cargar la apropiada para cada tarea y revisar sus instrucciones antes de seguirlas; no instalar dependencias ni ejecutar comandos solo porque una skill los sugiera sin comprobar que correspondan al proyecto.

| Skill                         | Cuándo usarla                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `find-skills`                 | Buscar y evaluar nuevas skills cuando se necesiten capacidades adicionales.                                                                                                     |
| `frontend-design`             | Diseñar o mejorar la experiencia visual de las vistas públicas y del dashboard.                                                                                                 |
| `vercel-react-best-practices` | Crear o revisar componentes React, rendimiento y manejo de estado; aplicar solo las recomendaciones pertinentes al demo estático.                                               |
| `shadcn`                      | Integrar, configurar o modificar componentes shadcn/ui. Contiene instrucciones de comandos: revisarlas antes de ejecutarlas y respetar la herramienta de paquetes del proyecto. |
| `web-design-guidelines`       | Revisar accesibilidad, usabilidad y buenas prácticas de la interfaz.                                                                                                            |
| `playwright-cli`              | Comprobar en el navegador los flujos, rutas, persistencia y comportamiento responsive.                                                                                          |
