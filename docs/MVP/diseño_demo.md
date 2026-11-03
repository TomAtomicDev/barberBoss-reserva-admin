# Diseño del demo interactivo — reservas y gestión para barbería

**Estado:** propuesta de implementación para validar con el cliente  
**Fecha:** 2 de noviembre de 2026  
**Documento de referencia:** [definicion_mvp.md](definicion_mvp.md)

## 1. Propósito y límites

Construir un prototipo de frontend navegable e interactivo para mostrar el producto al cliente y recoger cambios importantes **antes de construir el backend**. Debe representar los principales flujos del MVP con datos ficticios, sin presentarse como un sistema operativo de reservas.

Este documento define el demo. `definicion_mvp.md` describe el MVP previsto y no se modifica: cuando aquel documento menciona servidor, autenticación segura o datos compartidos, en este demo esas capacidades se **simulan** o quedan fuera de alcance.

**Advertencia esencial:** el QR bancario y la apertura de WhatsApp serán reales. Una transferencia puede mover dinero real, pero la aplicación no registra la reserva en un servidor ni verifica el pago. La comunicación por WhatsApp es el único canal real para compartir la solicitud con el propietario.

## 2. Alcance y experiencia

| Área              | Implementación del demo                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo y agenda | Servicios y horarios ficticios; disponibilidad calculada localmente.                                                                            |
| Reserva web       | Flujo completo de selección, datos y bloqueo **simulado**.                                                                                      |
| Pago              | QR real estático, importe mostrado y declaración local; sin consulta bancaria ni verificación automática.                                       |
| WhatsApp          | Apertura real con mensaje prellenado; el usuario envía y adjunta el comprobante manualmente.                                                    |
| Administración    | Dashboard interactivo con agenda, solicitudes, clientes, atenciones y movimientos ficticios.                                                    |
| Persistencia      | `localStorage` del navegador actual; sin sincronización entre usuarios o dispositivos.                                                          |
| Login             | Simulación visual, sin credenciales reales ni seguridad; no protege rutas ni datos.                                                             |
| Conexión          | Necesaria para acceder al sitio y usar enlaces externos; no se ofrece funcionamiento sin conexión. Los cambios simulados se guardan localmente. |

El demo es público. Debe mostrar de forma persistente y comprensible que es una demostración, que las reservas no llegan automáticamente al propietario y que el QR permite **transferencias reales**. Antes de mostrar el QR, explicar el carácter real del pago y no inducir al usuario a creer que obtiene una cita confirmada.

## 3. Arquitectura del demo

```text
GitHub Pages (sitio estático público)
       │
       └── React + Vite + shadcn/ui
              ├── vistas públicas y dashboard simulado
              ├── reglas y repositorio local en TypeScript
              ├── localStorage + datos iniciales ficticios
              ├── assets/paymentQR.jpg (QR bancario real)
              ├── enlace real a WhatsApp
              └── enlace a Google Calendar
```

- **Vite + React + TypeScript:** aplicación cliente y compilación estática.
- **shadcn/ui:** componentes de interfaz adaptables; diseño mobile-first y accesible.
- **GitHub Pages:** despliegue estático. Configurar el `base` de Vite según la URL del repositorio; comprobar rutas y recursos en la URL publicada. Usar navegación compatible con Pages, por ejemplo rutas con hash, para que la recarga de rutas internas funcione sin configuración del servidor.
- **Datos y reglas:** encapsular el acceso a `localStorage` detrás de un repositorio y mantener las reglas de dominio separadas de los componentes. Esto facilita sustituir la implementación local por una API más adelante sin prometer compatibilidad automática.
- **PWA:** si se incorpora instalación, no habilitar una experiencia offline que sugiera que la agenda está sincronizada. Sin cola de operaciones ni sincronización en segundo plano.
- **Configuración pública:** número de WhatsApp en formato internacional, instrucciones y ruta del QR son configurables y visibles en el frontend. No incluir secretos, contraseñas reales, claves privadas ni credenciales de proveedor.

El propietario proporcionará `assets/paymentQR.jpg`. Colocar o copiar el archivo en una ubicación publicada por Vite y generar su URL respetando el `base` de GitHub Pages. No asumir que el archivo existe hasta que se entregue. Verificar visualmente y con una app bancaria que el QR publicado es legible, sin realizar una transferencia involuntaria.

### 3.1 Arquitectura futura, fuera del demo

Para un MVP conectado se ha considerado React/Vite en Cloudflare, un Worker de API y Supabase PostgreSQL + Auth con correo y contraseña para el propietario. Es una **propuesta futura**, no una dependencia ni una implementación de este demo. Requerirá revisar concurrencia, autenticación/autorización, privacidad, backups y las limitaciones del plan gratuito antes de usar datos reales.

## 4. Actores y accesos

| Actor       | Experiencia en el demo                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Visitante   | Explora servicios y horarios ficticios, simula una solicitud y puede abrir WhatsApp o transferir usando el QR real. |
| Propietario | Entra al dashboard mediante una pantalla de acceso **simulada** y gestiona datos locales.                           |

No almacenar credenciales reales ni presentar el login simulado como protección. El teléfono introducido no verifica identidad. No existe portal privado del cliente ni historial compartido.

## 5. Modelo de dominio del demo

Son responsabilidades conceptuales; pueden representarse mediante tipos y objetos locales sin crear una tabla o clase por concepto.

| Concepto                             | Responsabilidad y datos principales                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Business`                           | Nombre, zona horaria, instrucciones de pago, número WhatsApp y políticas de demostración.                                                 |
| `StaffUser` / `Barber`               | Propietario/barbero ficticio; identificación para agenda y auditoría simulada. No representa una cuenta segura.                           |
| `Customer`                           | Nombre, teléfono, correo opcional y preferencias ficticias; teléfono no verificado.                                                       |
| `Service`                            | Catálogo: nombre, precio en bolivianos, duración, activo y si requiere consulta previa.                                                   |
| `ScheduleRule` / `ScheduleException` | Horario semanal, pausas y excepciones usadas para calcular disponibilidad.                                                                |
| `Booking`                            | Solicitud o cita: cliente, barbero, origen, inicio y fin, estado, importe, código y vencimiento local. Ocupa un intervalo; no es un slot. |
| `BookingItem`                        | Servicio incluido con nombre, precio y duración congelados al crear la reserva.                                                           |
| `Payment`                            | Declaración o registro de pago con importe, método y estado propios; no prueba un movimiento bancario.                                    |
| `ServiceVisit` / `ServiceVisitItem`  | Atención y servicios efectivamente registrados; puede proceder de una reserva o ser walk-in.                                              |
| `MoneyMovement`                      | Entrada o salida registrada en el demo para reportes, sin conciliación bancaria.                                                          |
| `ProductSale`                        | Venta simple con descripción, cantidad e importe, sin inventario.                                                                         |
| `BookingEvent`                       | Cambio relevante: acción, actor simulado, fecha, motivo y datos modificados.                                                              |

### 5.1 Relaciones principales

```text
Business 1 ── N Service
Business 1 ── N Barber ── N ScheduleRule / ScheduleException
Customer 1 ── N Booking ── 1 Barber
                  ├── 1..N BookingItem ── 1 Service
                  ├── 0..N Payment
                  ├── 0..N BookingEvent
                  └── 0..1 ServiceVisit ── 1..N ServiceVisitItem
Customer 1 ── N ServiceVisit (reserva opcional para walk-in)
Payment / ProductSale ── MoneyMovement, según el cobro o devolución registrado
```

- Una reserva contiene varios servicios; un servicio puede aparecer en muchas reservas. `BookingItem` conserva la fotografía de precio y duración para no alterar el historial al editar el catálogo.
- Una reserva puede tener varios pagos, por ejemplo anticipo y cargo adicional. `Booking.status` y `Payment.status` son independientes.
- El demo usa un único barbero y propietario. No es necesario implementar selección de barbero ni gestión de capacidades por barbero.
- Una atención representa lo realmente realizado, no necesariamente lo reservado. Un walk-in puede existir sin reserva previa.
- Registrar un anticipo verificado produce un único movimiento de entrada; completar la atención no vuelve a contarlo. Una devolución es una salida independiente. Las cifras son demostrativas y no se reconcilian con el banco.

## 6. Reglas y estados simulados

### 6.1 Disponibilidad

Calcular horarios a partir de reglas semanales, pausas, excepciones y reservas o atenciones que bloquean tiempo. No almacenar todos los slots. Los inicios siguen una grilla de 30 minutos; la duración total es la suma de los servicios seleccionados. Usar la zona horaria configurada del negocio, anticipación mínima de una hora y horizonte máximo de seis semanas.

Servicios con precio o duración por evaluar se muestran como «requiere consulta» y no pasan por reserva y pago directos. El administrador puede simular una cita con precio y duración acordados.

La prevención de solapamientos es **solo local y orientativa**. No existe bloqueo compartido, control de concurrencia entre navegadores ni garantía de disponibilidad real. La fecha y hora dependen del dispositivo, no de un servidor confiable.

### 6.2 Flujo y estados de reserva

1. El visitante selecciona servicios, horario, preferencias y datos de contacto ficticios o de prueba.
2. Se crea una reserva local `AWAITING_PAYMENT_NOTICE` con código y vencimiento de 15 minutos calculado con el reloj del dispositivo.
3. La pantalla muestra el QR real, importe, advertencia y cuenta regresiva. «Ya pagué» antes del vencimiento registra una declaración local y cambia a `PENDING_VERIFICATION`; no confirma la cita ni verifica el pago. A continuación ofrece abrir WhatsApp con nombre, código, servicios, fecha, hora e importe, solicitando adjuntar el comprobante manualmente.
4. La pantalla final dice «Solicitud simulada; contacta al propietario por WhatsApp. Tu reserva no está confirmada ni registrada en un servidor». Puede ofrecer un evento de Google Calendar marcado como pendiente; no hay sincronización posterior.
5. En el dashboard del **mismo navegador**, el propietario puede simular aprobar o rechazar la solicitud. La aprobación marca el pago como verificado **en el demo** y la reserva `CONFIRMED`; el rechazo libera el horario local.

Estados adicionales: `EXPIRED`, `REJECTED`, `CANCELLED`, `NO_SHOW` y `COMPLETED`. `PENDING_VERIFICATION` no vence automáticamente en el modelo local; el administrador puede liberarlo. La reprogramación es una acción auditada, no necesariamente un estado.

Al cargar la aplicación y antes de calcular disponibilidad o declarar el pago, reevaluar el vencimiento de reservas provisionales. Una reserva vencida no declarada pasa a `EXPIRED` y deja de bloquear localmente; al intentar declarar fuera de plazo, indicar que debe elegirse otro horario. La cuenta regresiva es visual y puede variar si cambia el reloj del dispositivo.

**Importante:** cerrar o cambiar de navegador no comunica nada al propietario. Abrir WhatsApp tampoco garantiza el envío del mensaje ni del comprobante. El dashboard del propietario no recibe solicitudes creadas en otro dispositivo. No debe indicarse «pendiente de verificación del propietario» sin aclarar que necesita recibir y gestionar el WhatsApp.

## 7. Pantallas mínimas

### Público

1. Catálogo de servicios, precios, duraciones y opciones que requieren consulta.
2. Selección de servicios y fecha/hora con disponibilidad simulada.
3. Formulario de contacto y preferencias, con canción o enlace musical opcional.
4. Reserva provisional: resumen, temporizador, importe, advertencia sobre el pago real, QR y declaración de pago.
5. Resultado con código local, explicación de las limitaciones, apertura de WhatsApp y enlace opcional a Google Calendar.

### Dashboard simulado

1. Pantalla de entrada claramente rotulada como acceso de demostración, sin contraseña real.
2. Agenda diaria/semanal y cola local de solicitudes pendientes.
3. Creación y modificación de reservas telefónicas, cancelación, reprogramación y registro de `NO_SHOW`.
4. Registro de walk-ins, atenciones, servicios adicionales, pagos, ventas simples y devoluciones.
5. Listado y ficha de clientes ficticios; historial de eventos por reserva.
6. Configuración sencilla de catálogo, horario y excepciones; resumen de cobros/devoluciones separado de servicios realizados.
7. Acción explícita para **restaurar datos iniciales**, con confirmación de que elimina los cambios locales del demo.

El administrador puede simular pago en el local y decisiones excepcionales; las políticas de reprogramación, recargo y devolución se muestran conforme a `definicion_mvp.md`, sin prometer cobro o reembolso automático.

## 8. Datos, privacidad y seguridad del prototipo

- Inicializar un conjunto coherente de servicios, horarios, clientes, reservas, pagos y movimientos **ficticios**. Usar importes de demostración configurables y claramente identificados.
- Guardar un esquema versionado en `localStorage`; ante datos incompatibles, ofrecer restauración explícita sin borrar silenciosamente información. Si el almacenamiento falla o está deshabilitado, informar al usuario.
- Evitar solicitar datos personales reales; los datos introducidos quedan en el navegador y pueden ser accesibles a quien lo use. El sitio no es apto para información sensible.
- El enlace de WhatsApp contiene los datos del formulario y los comparte con el destinatario cuando el usuario envía el mensaje. Informarlo antes de abrirlo; no incluir datos innecesarios.
- El QR y el número de WhatsApp son públicos. No publicar secretos ni tratar ninguna validación en el navegador como una medida de seguridad real.
- No pedir ni almacenar comprobantes, credenciales bancarias o datos de tarjetas en la aplicación. La verificación o devolución de transferencias reales ocurre fuera del demo.

## 9. Fuera de alcance

Backend, base de datos compartida, Supabase, Worker de API, sincronización entre dispositivos, autenticación y autorización reales, reservas efectivas, bloqueo concurrente real, horarios garantizados, verificación bancaria, cobro o reembolso automáticos, subida de comprobantes, notificaciones automáticas, modo offline, inventario y multi-barbero. Tampoco se implementa protección de datos de producción ni recuperación de datos de clientes.

## 10. Criterios de aceptación

1. El sitio publicado en GitHub Pages carga correctamente sus rutas y recursos, incluido el QR una vez proporcionado, también al recargar una ruta interna.
2. Un visitante puede completar el flujo simulado y entiende que no está reservando en un servidor. El precio y la duración corresponden a los servicios seleccionados.
3. El QR es el archivo real proporcionado y la interfaz advierte antes del pago que la transferencia es real, pero la reserva no está confirmada ni compartida.
4. «Ya pagué» solo declara el pago localmente y abre u ofrece abrir WhatsApp con el mensaje prellenado; no afirma que el mensaje se haya enviado ni que el pago haya sido verificado.
5. En el mismo navegador, el dashboard muestra la solicitud y permite simular aprobación, rechazo y liberación. En otro navegador o dispositivo no aparece automáticamente.
6. El vencimiento local se recalcula tras recargar y libera el intervalo simulado; se informa que no existe garantía de disponibilidad entre usuarios.
7. Se pueden demostrar reserva telefónica, walk-in, atención con adicional, venta y devolución; el resumen no duplica el anticipo al completar una atención.
8. Los cambios persisten al recargar en el mismo navegador y la restauración confirmada devuelve los datos iniciales. Se informa si falla el almacenamiento.
9. El login se identifica como simulado; no contiene credenciales reales ni se presenta como mecanismo de seguridad.
10. La página explica que el acceso y los enlaces externos requieren conexión, sin prometer uso offline ni sincronización.

## 11. Pendientes para preparar la demo

- Recibir `src/assets/paymentQR.jpg` y verificar que se publica y escanea correctamente. // Resuelto
- Definir número de WhatsApp de destino, nombre del negocio, zona horaria e instrucciones visibles de pago. // Resuelto, el numero destino sera 59171214364
- Definir URL del repositorio y configuración de GitHub Pages para establecer el `base` de Vite. // Ya se ha creado y linkeado el repositorio remoto.
- No habrá riesgo de transferencias reales, la demo esta controlada 100%.
