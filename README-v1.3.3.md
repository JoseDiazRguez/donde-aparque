# ¿Dónde aparqué? — PWA v1.3.3

## Novedad: estadísticas privadas de uso
La aplicación registra en Firebase, por cada contexto autenticado de forma anónima:

- primera utilización (`firstSeen`)
- última utilización (`lastSeen`)
- versión de la app
- modo: `standalone` (PWA instalada) o `browser`
- país
- región administrativa
- municipio

NO se guardan latitud ni longitud en `/stats`.

Para España se muestran Provincia + Municipio.
Para Brasil se muestran Estado + Município.
En el panel se normaliza el segundo nivel como "Región".

## Resolución geográfica
Las coordenadas del GPS se comparan en el propio navegador con límites administrativos estáticos.
Los archivos GeoJSON se descargan desde geoBoundaries; la coordenada no se envía en esa consulta.

Fuentes de límites:
- España: geoBoundaries / IGN / INE.
- Brasil: geoBoundaries / IBGE / OCHA.

La app solo conserva en Firebase el último país/región/municipio de ese contexto.
No existe historial de desplazamientos.

## Panel de administración
URL:
`/donde-aparque/admin.html`

Muestra:
- instalaciones/contextos totales
- activos 24 h / 7 días / 30 días
- PWA instalada vs navegador
- versiones
- coches compartidos
- vinculaciones activas
- países
- regiones
- municipios

## Configuración OBLIGATORIA del administrador

### 1. Activar Email/Password
Firebase Console → Authentication → Método de acceso → Correo electrónico/contraseña → Activar.

### 2. Crear tu usuario administrador
Firebase Console → Authentication → Usuarios → Añadir usuario.
Crea tu correo y contraseña de administración.

Copia el UID de ese usuario.

### 3. Publicar las nuevas reglas
Realtime Database → Reglas.
Pega `firebase-rules-v1.3.3.json` y publica.

### 4. Autorizar tu UID
Realtime Database → Datos.
Crea:

admins
  TU_UID: true

Ejemplo:
admins
  AbCdEf123456789: true

No pongas el correo ni la contraseña en la base de datos.

## Importante sobre el recuento
"Instalaciones/contextos" no equivale exactamente a personas.
En iOS, Safari y la PWA instalada pueden tener identidades Firebase separadas y por tanto contar como dos contextos.

## Compatibilidad
- Mantiene todos los coches de v1.2.2.
- Mantiene QR + código de vinculación.
- Mantiene cifrado AES-GCM para nombre y ubicación del coche.
- No es necesario volver a vincular coches existentes.

## Archivos a subir a GitHub
Sustituye/sube:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- admin.html
- admin.css
- admin.js
- icons/

El archivo de reglas es de referencia: se publica manualmente en Firebase Realtime Database.

## Privacidad
La telemetría NO guarda:
- latitud/longitud
- dirección/calle
- código postal
- matrícula
- nombre
- correo del usuario normal
- Apple ID
- historial de ubicaciones

Nota: la aplicación ya utiliza teselas de OpenStreetMap para mostrar el mapa. Este cambio de estadísticas no añade envío de coordenadas a Firebase ni a geoBoundaries.

## Correcciones v1.3.3

- Corrige la geolocalización estadística: si el registro básico se enviaba antes de que llegara el GPS,
  ahora el país/región/municipio se completa después en cuanto el navegador obtiene una ubicación válida.
- Rellena las estadísticas de coches compartidos ya existentes al abrir la aplicación, sin necesidad de
  volver a compartir ni volver a vincular el coche.

## Correcciones v1.3.3

- La versión activa aparece siempre en pequeño en la esquina inferior derecha de la aplicación.
- Se fuerza una comprobación de actualización del Service Worker al abrir la app.
- Los archivos principales (HTML, JS y CSS) usan estrategia network-first para evitar que iOS/PWA se quede anclado en una versión antigua.
- No cambia la estructura de Firebase ni las reglas respecto a v1.3.1.
- No se pierden coches, claves, aparcamientos ni vinculaciones existentes.

## Corrección v1.3.3

- Cambia la descarga de límites administrativos desde raw.githubusercontent.com a jsDelivr.
- Añade diagnóstico geográfico visible en el panel:
  - ok
  - boundary_not_found
  - outside_supported_area
  - download_or_parse_error
- La versión visible sigue apareciendo abajo a la derecha.
- Requiere publicar las reglas `firebase-rules-v1.3.3.json` porque se añade el campo opcional `geoStatus`.
- No modifica ni borra coches, claves, aparcamientos ni vinculaciones.
