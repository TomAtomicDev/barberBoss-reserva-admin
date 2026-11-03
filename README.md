# Boss Barber Shop by RF — demo de reservas y gestión

Prototipo estático para validar la experiencia de reservas y administración de una barbería antes de construir un producto conectado. La agenda, las operaciones y el acceso administrativo son **simulaciones**, no un sistema de reservas real.

El negocio es **Boss Barber Shop by RF** y el barbero de la demo es **Roly**.

## Seguridad y límites

- Los datos se guardan únicamente en `localStorage` del navegador actual. No hay servidor, sincronización entre dispositivos, bloqueo concurrente ni garantía de disponibilidad.
- Usa nombres, teléfonos y demás datos **ficticios o de prueba**. El acceso administrativo no protege rutas ni datos y no debe usarse con credenciales reales.
- **El QR bancario es real: una transferencia puede mover dinero.** El demo no verifica pagos ni confirma citas. No realices transferencias durante las pruebas.
- WhatsApp abre un enlace real. El mensaje y el comprobante solo se envían si el usuario lo hace manualmente; abrir el enlace no demuestra su envío. El propietario no recibe automáticamente las solicitudes locales.
- Se necesita conexión para acceder al sitio y usar los enlaces externos. No se ofrece funcionamiento offline, colas ni sincronización en segundo plano.

## Desarrollo

El proyecto utiliza [Vite+](https://viteplus.dev/) y su CLI `vp`.

```sh
vp install
vp dev
vp check
vp test
vp run build
```

El sitio utiliza rutas con hash para que puedan recargarse en GitHub Pages. La configuración de despliegue debe usar el `base` correspondiente al nombre del repositorio. El QR está en [`src/assets/paymentQR.jpg`](src/assets/paymentQR.jpg) y debe comprobarse visualmente y con una aplicación bancaria sin efectuar una transferencia. La imagen proporcionada indica vigencia hasta el **30 de noviembre de 2026**; debe renovarse cuando corresponda.

El número público de WhatsApp previsto es `59171214364` y se configura en [`src/config.ts`](src/config.ts). No incluir secretos, credenciales, comprobantes ni datos sensibles en el código o el almacenamiento local.

## Documentación

- [Diseño del demo](docs/MVP/dise%C3%B1o_demo.md): alcance, flujos y criterios de aceptación de este prototipo.
- [Definición del MVP](docs/MVP/definicion_mvp.md): contexto y políticas del futuro producto conectado, fuera del alcance de esta demo.
