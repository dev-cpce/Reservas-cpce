# Prompt para Claude Code: Bandeja de mensajes WhatsApp + modo Humano/Asistente

## Contexto
Tengo un sistema de reservas de canchas de pádel en Next.js 15 (App Router, React 19, TypeScript, Tailwind 4) con Supabase (cloud) y auth/roles propios. Repo: https://github.com/dev-cpce/Reservas-cpce (rama Bandeja-entrada-wsp).
Un asistente en n8n (autoalojado) atiende a los clientes por WhatsApp Cloud API y crea reservas llamando a mi API `/api/external/*` (autenticada con header X-API-KEY).
Todo se despliega con **Coolify** en un VPS Hostinger KVM2: Next.js + n8n (con Postgres propio). **Redis es cloud (plan gratuito)** y Supabase también es cloud. Volumen estimado: unas 50 conversaciones por semana.

Como uso la API oficial de WhatsApp, no puedo usar la app Business en el celular. Necesito una **bandeja de mensajes dentro de mi sistema** para que los empleados lean y respondan a mano.

## Objetivo (versión básica)
1. Los empleados ven en tiempo real todos los mensajes: del cliente, del asistente y de otros empleados.
2. Los empleados pueden enviar mensajes de texto a un cliente desde el sistema.
3. Cada conversación tiene un modo: `bot` o `humano`.
   - Si el cliente pide hablar con una persona, el asistente pasa la conversación a `humano` y deja de responder.
   - Un empleado puede reactivar el asistente con un botón ("Reactivar asistente").
   - Si un empleado envía un mensaje manual, la conversación pasa sola a `humano`.
4. Fuera de alcance por ahora: imágenes, audios, plantillas, notas internas, asignación a empleados, notificaciones push.

## Reglas importantes
- Antes de escribir código, **explorá el repo**: estructura de `app/`, `lib/`, `types/`, cómo se hace auth, roles/permisos, cliente de Supabase y cómo están hechos los endpoints `/api/external`. **Seguí esas convenciones.**
- Trabajá **en una rama nueva** y en **fases**. Al final de cada fase, resumí qué hiciste y esperá mi confirmación.
- No toques lógica de reservas ni de pagos.
- Los secretos (token de WhatsApp, API keys) solo en variables de entorno del servidor. Nunca en el cliente ni en el repo.
- Idioma de la interfaz: español rioplatense.

## Ventana de 24 h de WhatsApp (decisión de alcance)
- El cliente siempre inicia la conversación, así que la ventana se abre sola. **No se implementan plantillas por ahora.**
- La bandeja solo valida la ventana: si pasaron más de 24 h desde el último mensaje del cliente (caso típico: domingo a lunes o feriados), bloquea el envío y muestra un aviso claro. Nunca debe fallar en silencio.
- El flujo `notificacion-cancelar` de n8n (aviso de reserva cancelada) se dispara con cualquier reserva que pase a `cancelada`, incluso las canceladas desde el panel días después. Si Meta rechaza ese envío por ventana vencida, el nodo debe tolerar el error (continuar sin cortar el flujo) y registrarlo.
- Todo error de envío de la Graph API (token, ventana, número inválido) se guarda en el mensaje con estado `fallido` y el motivo.

## Modelo de datos (propuesta; ajustala a mi esquema real)
- `conversaciones`: id, chat_id (wa_id, único), id_cliente (FK a clientes, nullable), modo (`bot`|`humano`, default `bot`), no_leidos (int), ultimo_mensaje_at, ultimo_mensaje_cliente_at (para la ventana de 24 h), updated_at.
- `mensajes`: id, id_conversacion (FK), wa_message_id (único, nullable para los que aún no se enviaron), direccion (`entrante`|`saliente`), origen (`cliente`|`bot`|`empleado`), texto, estado (`enviado`|`entregado`|`leido`|`fallido`), id_empleado (nullable), created_at.
- Índices por (id_conversacion, created_at).
- RLS: solo usuarios autenticados con permiso para ver mensajes pueden leer. Las escrituras las hacen los endpoints del servidor. Habilitar Supabase Realtime en ambas tablas.
- Entregame el SQL de migración para que lo ejecute yo en Supabase.

## Endpoints (mismo estilo y auth que mis `/api/external`, X-API-KEY, para n8n)
- `POST /api/external/mensajes/entrante`: body `{chat_id, wa_message_id, texto, timestamp}`.
  - Crea la conversación si no existe y asocia el cliente por chat_id.
  - Guarda el mensaje (ignora duplicados por wa_message_id).
  - Suma no_leidos y actualiza ultimo_mensaje_cliente_at.
  - Devuelve `{modo, duplicado}`.
- `POST /api/external/mensajes/saliente`: registra lo que envió el asistente `{chat_id, texto, wa_message_id?}` con origen `bot`.
- `POST /api/external/conversaciones/handoff`: body `{chat_id, motivo?}` → modo = `humano`.
- `GET /api/external/conversaciones/modo?chat_id=...` → `{modo}`.

## Endpoints internos (sesión de usuario, para la UI)
- `POST /api/mensajes/enviar`: `{id_conversacion, texto}`.
  - Verifica permiso del empleado.
  - Verifica la ventana de 24 h (si pasaron más de 24 h desde el último mensaje del cliente, rechazar con error claro).
  - Envía por la Graph API de WhatsApp Cloud (`POST /{PHONE_NUMBER_ID}/messages`) con el token de entorno.
  - Guarda el mensaje con origen `empleado` y pone la conversación en `humano`.
- `POST /api/conversaciones/[id]/modo`: `{modo}` para reactivar o pasar a humano.
- `POST /api/conversaciones/[id]/leer`: pone no_leidos en 0.

Variables de entorno nuevas: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`.

## Interfaz: sección "Mensajes" en el menú
- Izquierda: lista de conversaciones (nombre del cliente o número, último mensaje, hora, contador de no leídos, etiqueta Bot/Humano). Ordenadas por último mensaje. Filtro Todas / Humano / No leídas y buscador.
- Derecha: chat con burbujas diferenciadas (cliente, asistente, empleado), hora, estado del envío y scroll al último mensaje.
- Cabecera del chat: nombre del cliente, número, interruptor del asistente (Activo / Pausado).
- Caja de texto con envío (Enter). Si la ventana de 24 h venció, deshabilitarla y mostrar el aviso.
- Actualización en tiempo real con Supabase Realtime (mensajes nuevos y cambios de modo).
- Diseño coherente con el resto del sistema y usable desde el celular.
- Respetar el sistema de roles/permisos existente (agregar un permiso "mensajes" y asignarlo a administrador y empleado).

## Cambios en n8n (entregame los cambios del JSON o las instrucciones nodo por nodo; no modifiques mi n8n de producción)
Flujo deseado:
WhatsApp Trigger → Filter (solo mensajes, ignora estados) → ¿texto? → GET CLIENTE (alta si no existe)
→ **NUEVO:** HTTP POST `/mensajes/entrante` (devuelve modo)
→ **NUEVO:** IF modo = humano → fin (no pasa por el LLM)
→ si modo = bot: buffer Redis (reactivar el nodo Wait) → intérprete → Switch → ...
- Agregar al intérprete una acción `hablar_humano` (cuando el cliente pide una persona, un empleado, un humano, etc.) y una salida nueva en el Switch que llame a `/conversaciones/handoff` y le responda al cliente: "Te derivo con un empleado, te respondemos a la brevedad."
- Después de los nodos "Send message" del asistente, agregar un HTTP POST a `/mensajes/saliente` para registrar lo que dijo el bot.
- Corregir `recipientPhoneNumber`: hoy está fijo en un número de prueba. Debe ser el `from` del mensaje entrante (o el chat_id que devuelve la API en los flujos de pago y cancelación). Verificar con un número argentino real el formato (`549...` vs `54...`).
- Reemplazar `http://localhost:3000` en todos los nodos HTTP: en Coolify n8n y Next.js están en contenedores distintos. Usar una variable de n8n con la URL base de la API (URL pública HTTPS o nombre interno del servicio).
- El nodo que envía el aviso de cancelación (`notificacion-cancelar`) debe continuar ante error (`continueOnFail`).
- La credencial de Redis cloud en n8n: usar SSL/TLS si el proveedor lo requiere, y elegir una región cercana al VPS. Agregar manejo de error al buffer para que, si Redis no responde, el flujo no se rompa en silencio.
- Agregar un flujo con Error Trigger que avise por mail o WhatsApp interno cuando falle algo.

## Seguridad y calidad
- Validar la firma `X-Hub-Signature-256` si se agrega un webhook propio. Validar `x-signature` en el webhook de Mercado Pago.
- Validar todas las entradas (zod o equivalente según el repo).
- Manejo de errores claro cuando falla la Graph API.
- Pruebas manuales documentadas con el número de prueba de Meta antes de usar el número real.

## Fases
1. Exploración del repo y plan detallado (sin código).
2. SQL de migración + RLS + Realtime.
3. Endpoints externos e internos.
4. Pantalla "Mensajes" con tiempo real.
5. Cambios del flujo n8n.
6. Checklist de pruebas (con el número de prueba de Meta).
7. Despliegue en Coolify (ver abajo).
8. Opcional: retorno automático al asistente tras N horas de inactividad, y mensaje automático fuera de horario comercial cuando el cliente pide un humano.

## Fase 7: despliegue en Coolify (entregame la lista de pasos y variables)
- Next.js desde GitHub (rama a definir). Las variables `NEXT_PUBLIC_*` deben ir como **variables de build**.
- Variables del servidor: `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, X-API-KEY de la API externa.
- n8n con Postgres propio y volumen persistente. Definir `WEBHOOK_URL` con el dominio público HTTPS y guardar aparte `N8N_ENCRYPTION_KEY`.
- Dominios y subdominios con HTTPS para: sistema, n8n y webhook de WhatsApp.
- Backups programados de Postgres de n8n y de volúmenes.
- Verificar que el repo no contenga secretos (el repo es público): revisar `.env` y el historial de commits.
- Pasar la `notification_url` de Mercado Pago del dominio de ngrok al definitivo, y validar la firma `x-signature`.

Empezá por la fase 1.
