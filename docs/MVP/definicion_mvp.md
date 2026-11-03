# Definición del proyecto — MVP de reservas y gestión para barbería

**Versión:** 0.1 (alcance para demo)  
**Fecha:** 2 de noviembre de 2026  
**Negocio piloto:** una barbería, un propietario que desempeña los roles de administrador y barbero.

## 1. Objetivo

Construir una **PWA mobile-first** que permita a los clientes consultar servicios y disponibilidad, solicitar una cita y declarar un pago por transferencia bancaria; y que permita al propietario gestionar agenda, pagos, clientes, atenciones y movimientos de dinero desde un dashboard.

El MVP se evaluará con **una sola barbería y un solo barbero**. La primera versión debe priorizar un flujo completo, comprensible y fiable, sin automatizar WhatsApp ni los movimientos bancarios.

## 2. Actores y accesos

| Actor             | Acceso                                  | Acciones                                                                                                                                                                                                |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Visitante/cliente | Sin cuenta, contraseña ni OTP           | Consultar servicios/horarios; solicitar una reserva; indicar nombre, celular y correo opcional; proporcionar preferencias; abrir WhatsApp para comunicar un pago; añadir un recordatorio de calendario. |
| Propietario       | Inicio de sesión seguro en el dashboard | Gestionar disponibilidad, servicios, reservas, clientes, comprobantes, atenciones e ingresos. Desempeña los roles de administrador y barbero.                                                           |

**Privacidad:** el cliente no puede consultar historiales generales ni administrar reservas ajenas. Las solicitudes posteriores de reprogramación, cancelación o consulta de estado se realizan **por WhatsApp y son atendidas manualmente**. No habrá portal de clientes en el MVP.

## 3. Servicios, precios y agenda

Servicios iniciales: **corte común, corte especial, barba, perfilado de cejas y tinte de cabello**. Cada servicio tiene nombre, precio, duración de agenda y estado activo/inactivo. Los servicios de duración predecible pueden combinarse y sus duraciones se suman. Como referencia, un corte común ocupa **30 minutos**; otros valores los definirá el propietario.

Si un servicio requiere evaluación de duración o precio (por ejemplo, un diseño especial), no debe permitir cobro automático por importe indeterminado. En el demo, el administrador acordará primero el precio/duración y creará o ajustará la cita manualmente; el catálogo indicará **«requiere consulta»**.

- **Agenda:** horario semanal recurrente del barbero, descansos/pausas recurrentes y excepciones por horas, días o períodos completos.
- **Inicios permitidos:** pasos de 30 minutos (por ejemplo, 9:00 y 9:30). Una cita puede consumir varios bloques.
- **Anticipación mínima:** 1 hora antes del inicio.
- **Horizonte máximo:** 6 semanas desde la fecha actual.
- **Cálculo de disponibilidad:** intervalos generados a partir de horarios, pausas, excepciones y citas que bloquean tiempo; no es necesario almacenar todos los slots posibles.
- **Sin solapamiento:** no se pueden superponer reservas o atenciones activas para el mismo barbero. La validación definitiva se repite en el servidor al crear el bloqueo.
- **Zona horaria:** utilizar la zona horaria configurada del negocio para interpretar las citas.

## 4. Experiencia del cliente (PWA)

1. **Explorar.** El visitante ve catálogo, precios, duración de cada servicio y calendario con horarios potenciales disponibles, sin registrarse.
2. **Configurar la cita.** Selecciona un inicio en la grilla y marca uno o varios servicios con casillas. La interfaz calcula precio, duración total y hora de finalización. El servidor vuelve a verificar disponibilidad para el intervalo completo.
3. **Preferencias.** Puede escribir instrucciones para el barbero y, opcionalmente, indicar una canción, una playlist o un enlace musical. No se suben imágenes en el MVP.
4. **Identificación mínima.** Antes de bloquear, proporciona **nombre, celular y correo opcional**. No crea contraseña ni cuenta.
5. **Bloquear horario y continuar.** El servidor crea una reserva provisional, con código único, y bloquea el intervalo por **15 minutos**, calculados desde la hora del servidor. Si el horario fue ocupado entretanto, solicita elegir otro.
6. **Pago.** Muestra nombre de la cuenta bancaria, instrucciones, importe exacto en bolivianos, imagen descargable del QR bancario estático (sin monto precargado) y cuenta regresiva. El cliente paga desde su aplicación bancaria.
7. **Declarar pago y contactar.** El botón **«Ya pagué: enviar comprobante por WhatsApp»** registra que el cliente _declara_ haber pagado, detiene su cuenta regresiva y abre WhatsApp con un texto prellenado dirigido al propietario. El texto contiene nombre, código de reserva, servicios, fecha, horario e importe, y pide **adjuntar manualmente el comprobante**.
8. **Pantalla final.** Al volver a la PWA, muestra **«Solicitud recibida. Pendiente de verificación del pago»** (no «reserva confirmada»), código y resumen de la cita; ofrece **«Añadir a Google Calendar»** mediante enlace a un evento identificado como _pendiente de confirmación_.

**Límite del canal:** abrir WhatsApp no confirma que el cliente haya enviado el mensaje, adjuntado el comprobante ni pagado. El botón solo registra una **declaración de pago**, nunca una validación financiera. El administrador debe resolver estas solicitudes. No se integra API de WhatsApp ni de Google Calendar: solo enlaces.

## 5. Bloqueo temporal y estados

Estados sugeridos de `Booking`:

- `AWAITING_PAYMENT_NOTICE`: horario bloqueado hasta el vencimiento de 15 minutos; el cliente todavía no declaró el pago.
- `PENDING_VERIFICATION`: el cliente pulsó «Ya pagué»; la cuenta regresiva se detiene, pero **el horario continúa bloqueado** hasta decisión administrativa.
- `CONFIRMED`: el administrador verificó el pago o creó expresamente una reserva con pago en el local.
- `EXPIRED`: vencieron los 15 minutos sin declaración de pago; se libera el horario.
- `REJECTED`: el administrador rechazó la solicitud o comprobante; se libera el horario.
- `CANCELLED`: reserva cancelada bajo la política aplicable.
- `NO_SHOW`: cliente no asistió según criterio del negocio.
- `COMPLETED`: servicio o atención finalizados.

**Separación obligatoria:** `Booking.status` y `Payment.status` son independientes. Pulsar «Ya pagué» no marca `Payment` como verificado. La reserva `PENDING_VERIFICATION` no tiene caducidad automática en este demo; queda en una **cola visible para el administrador**, quien puede aprobar, rechazar o liberar manualmente una solicitud abandonada. Esto es una limitación deliberada del piloto y puede bloquear horarios si el administrador no la atiende.

La disponibilidad excluye cualquier intervalo ocupado por reservas provisionales no vencidas, pendientes de verificación, confirmadas o en atención. El servidor debe impedir dobles reservas incluso si dos usuarios actúan simultáneamente.

## 6. Operación del administrador

### 6.1 Panel de agenda y reservas

- Vista de agenda diaria/semanal del barbero; visualización de servicios, cliente, horarios, tipo de cita y estado.
- Lista destacada de **pagos declarados pendientes de verificación**.
- Crear una **reserva telefónica** con fecha, servicios y cliente, permitiendo pago en el local (solo administrador).
- Registrar un **walk-in** cuando alguien llega sin cita, con horario real, servicios realizados y pago; ese intervalo bloquea la agenda.
- Aprobar o rechazar comprobantes; confirmar o cancelar citas; reprogramar; registrar asistencia, finalización o `NO_SHOW`.
- Registrar motivo y autor de cambios relevantes en un historial por reserva.

La comunicación final de aprobación, rechazo, cancelación o reprogramación al cliente será **manual por WhatsApp**. Las acciones del dashboard no implican que el mensaje haya sido enviado.

### 6.2 Servicios realizados y ventas

Una `ServiceVisit` registra la **atención efectiva**. Puede vincularse a una `Booking` previa o existir sin reserva (`walk-in`). Registra los servicios efectivamente prestados, incluso servicios adicionales que no figuraban en la reserva, su precio final y los pagos complementarios.

El administrador también puede registrar una **venta simple de productos**, con descripción, cantidad, importe y medio de pago, **sin módulo de inventario**.

### 6.3 Clientes

Listado y ficha de clientes con nombre, celular, correo opcional, notas de preferencia, reservas y atenciones previas. Solo el administrador puede consultar esos datos. Evitar duplicados obvios de teléfono cuando sea posible, sin tratar el teléfono declarado como identidad verificada.

### 6.4 Ingresos

Registrar movimientos de entrada por **anticipos verificados, pagos en el local, cargos adicionales y ventas de productos**, y movimientos de salida por **devoluciones manuales**. Medios: transferencia/QR, efectivo y otros definidos por el administrador.

Los reportes básicos mostrarán **cobros y devoluciones por fecha** y, por separado, **servicios efectuados por fecha**, para no contar dos veces un anticipo y el servicio al que corresponde. El pago puede ocurrir antes del día de la atención.

## 7. Políticas del negocio (configuración inicial)

| Política                                   | Valor inicial                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Anticipación máxima                        | 6 semanas                                                                                                |
| Anticipación mínima                        | 1 hora                                                                                                   |
| Paso de inicio de reservas                 | 30 minutos                                                                                               |
| Plazo para declarar pago                   | 15 minutos                                                                                               |
| Anticipo para reservas creadas por cliente | 100 %                                                                                                    |
| Reprogramación gratuita                    | Con al menos 2 horas de antelación, sin límite de veces mientras respete la regla                        |
| Cancelación tardía o inasistencia          | Reagendar requiere un pago adicional equivalente al 70 % del precio del servicio acordado                |
| Tolerancia de llegada                      | 5 minutos; el administrador marca `NO_SHOW` si corresponde                                               |
| Cancelación por la barbería                | Reagendación sin costo, conservando el crédito completo                                                  |
| Reembolsos                                 | No automáticos; el administrador puede gestionarlos fuera del sistema bancario y registrar la devolución |

Las reglas se almacenarán como **configuración del negocio**, aunque no es necesario desarrollar un panel completo de parámetros para la demo. Las decisiones excepcionales del administrador deben registrarse.

## 8. Modelo conceptual mínimo

| Concepto                             | Responsabilidad principal                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `Business`                           | Datos de la barbería, cuenta/QR de cobro, zona horaria y parámetros del negocio.                                        |
| `StaffUser` / `Barber`               | Inicio de sesión y rol del propietario; capacidad para prestar servicios y atender citas.                               |
| `Customer`                           | Nombre, celular, correo opcional, preferencias e historial interno.                                                     |
| `Service`                            | Catálogo de prestaciones, precio, duración, disponibilidad y necesidad de evaluación previa.                            |
| `ScheduleRule` / `ScheduleException` | Horarios recurrentes, pausas y excepciones.                                                                             |
| `Booking`                            | Solicitud o cita con cliente, barbero, inicio-fin, estado, origen (web/teléfono), importe acordado y plazo del bloqueo. |
| `BookingItem`                        | Servicios incluidos en la reserva y sus precios/duraciones **congelados al reservar**.                                  |
| `Payment`                            | Intento o registro de pago, tipo, importe, método, fecha, estado y referencia al comprobante externo.                   |
| `ServiceVisit` / `ServiceVisitItem`  | Atención realmente efectuada y servicios realizados, vinculados opcionalmente a una reserva.                            |
| `MoneyMovement`                      | Entradas/salidas de caja: cobros, ventas, adicionales y devoluciones, sin duplicar anticipos.                           |
| `ProductSale`                        | Venta simple de un producto, sin inventario.                                                                            |
| `BookingEvent`                       | Auditoría: acción, actor, momento, motivo y cambios relevantes.                                                         |

No es necesario crear una tabla distinta para todos estos conceptos si eso complica el demo: son **responsabilidades conceptuales** que deben conservarse en el diseño. Los detalles del esquema físico se decidirán más adelante.

## 9. Pantallas mínimas

**Cliente:** catálogo + calendario; selección de servicios e intervalo; preferencias y contacto; instrucciones de pago/temporizador; pantalla de solicitud pendiente.

**Propietario:** login; dashboard con agenda y solicitudes pendientes; formulario para crear/editar reservas y registrar walk-ins; fichas de clientes; registro de atenciones, ventas, pagos y devoluciones; resumen simple de cobros.

La administración del catálogo, horario y excepciones puede integrarse en una misma sección de configuración, sin exigir pantallas complejas.

## 10. Fuera del alcance de este MVP

Autenticación o historial privado para clientes; envío automático de WhatsApp; comprobación bancaria automática; reembolsos automáticos; pasarela de pagos; integración OAuth con Google Calendar; carga de imágenes; reservas de varios barberos; paneles VIP, promociones, fidelización, analítica avanzada; inventario; facturación tributaria; suscripciones y gestión SaaS.

## 11. Criterios de aceptación del demo

1. Un visitante puede consultar disponibilidad sin iniciar sesión y completar una solicitud para servicios con duración/precio definidos.
2. Dos solicitudes concurrentes no pueden reservar el mismo intervalo del barbero.
3. Una solicitud provisional sin declaración de pago vence y libera el horario al cumplirse 15 minutos, controlados por el servidor.
4. Pulsar «Ya pagué» abre WhatsApp con el mensaje y deja la solicitud en `PENDING_VERIFICATION`, **no en `CONFIRMED`**.
5. El administrador puede aprobar o rechazar solicitudes y visualizar qué horarios siguen bloqueados.
6. Solo el administrador puede registrar reservas sin anticipo y walk-ins.
7. El administrador puede registrar servicios extra, pagos adicionales, venta de productos y una devolución manual, sin duplicar cobros en los reportes.
8. Puede bloquear pausas y días no laborables; el calendario evita ofrecer esos intervalos.
9. Puede marcar citas completadas y `NO_SHOW`, además de registrar cancelaciones y reprogramaciones con su historial.
10. El cliente puede abrir un enlace de calendario claramente identificado como cita pendiente de confirmación.

## 12. Supuestos operativos a validar en la demo

- **WhatsApp:** el sistema no puede saber si el cliente envió el mensaje ni adjuntó un comprobante. El administrador debe verificarlo con la conversación bancaria/WhatsApp y decidir manualmente.
- **Retención prolongada:** si alguien pulsa «Ya pagué» sin pagar, el horario permanecerá bloqueado hasta que el propietario resuelva el caso. Debe estar visible y poder liberarse en un clic.
- **Confirmación al cliente:** el sistema no enviará notificaciones automáticas; el propietario confirmará o rechazará por WhatsApp. El evento de Google Calendar es provisional y no se sincroniza si la cita cambia.
- **Servicios variables:** los cortes especiales que requieran cotización previa no pasan por el pago directo de la PWA hasta que el administrador haya fijado duración y precio.
- **Registro financiero:** los movimientos reflejan lo que el administrador cargó/verificó; no se pretende conciliación bancaria ni contabilidad formal.
