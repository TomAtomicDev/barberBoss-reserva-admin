# BarberBoss — demo de reservas y gestión

Prototipo interactivo para presentar a una barbería cómo podría funcionar su sistema de reservas y administración. El objetivo es validar los flujos y recoger comentarios del cliente **antes de desarrollar el MVP conectado**.

## Estado del proyecto

El proyecto se encuentra en **fase de diseño**. Por ahora contiene documentación y una imagen de QR; la aplicación frontend y su despliegue todavía no están implementados. Por tanto, aún no hay instrucciones de instalación o ejecución disponibles.

## Qué se busca demostrar

- Consulta de servicios y disponibilidad simulada.
- Solicitud de reserva, selección de servicios y declaración de pago.
- Apertura de WhatsApp con un mensaje prellenado para que el usuario lo envíe y adjunte su comprobante manualmente.
- Dashboard simulado para gestionar agenda, solicitudes, clientes, atenciones y movimientos.
- Persistencia local de los datos del demo mediante `localStorage`, con opción de restaurar los datos iniciales.

La información guardada en `localStorage` pertenecerá únicamente al navegador utilizado: **no se compartirá entre dispositivos ni se enviará automáticamente al propietario**. El acceso al dashboard será una simulación, no un mecanismo de seguridad.

> **Pagos reales:** el QR previsto corresponde a una cuenta bancaria real y una transferencia puede mover dinero real. El demo no verificará pagos ni registrará reservas en un servidor. La interfaz deberá advertirlo claramente antes de mostrar el QR y de iniciar el flujo de pago.

## Arquitectura prevista para el demo

| Componente | Tecnología o enfoque previsto |
|---|---|
| Interfaz | React, TypeScript, Vite y shadcn/ui |
| Publicación | GitHub Pages |
| Datos y reglas | Datos ficticios y lógica simulada en el navegador |
| Persistencia | `localStorage` |
| Integraciones | Enlace real a WhatsApp y enlace opcional a Google Calendar |
| Backend | Ninguno en esta etapa |

El sitio será público y requerirá conexión para acceder y utilizar los enlaces externos. No se promete funcionamiento sin conexión, autenticación real, disponibilidad compartida ni protección frente a reservas simultáneas.

Para una futura implementación conectada se ha considerado Cloudflare Workers con Supabase PostgreSQL y Auth; esta arquitectura no forma parte del demo actual.

## Documentación y archivos

- [Diseño del demo](MVP/dise%C3%B1o_demo.md): alcance, arquitectura, modelo de dominio, flujos y criterios de aceptación del prototipo.
- [Definición del MVP](MVP/definicion_mvp.md): requisitos del producto conectado previsto, independiente del alcance simulado del demo.
- [`paymentQR.jpg`](paymentQR.jpg): imagen del QR de pago presente en la raíz. El diseño propone publicarla como recurso del frontend; su ubicación definitiva se definirá al implementar la aplicación.

## Próximos pasos

1. Inicializar la aplicación con Vite, React y TypeScript e incorporar shadcn/ui.
2. Implementar los flujos y datos simulados descritos en el diseño del demo.
3. Configurar el número de WhatsApp, las advertencias de pago y la publicación del QR.
4. Configurar GitHub Pages y comprobar las rutas y los recursos en la URL publicada.
5. Presentar el demo al cliente y recopilar los cambios antes de construir el backend.
