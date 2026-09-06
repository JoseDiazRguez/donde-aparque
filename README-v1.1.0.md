# ¿Dónde aparqué? — PWA v1.1.0

## Cambios principales

- Interfaz inferior más compacta.
- Eliminado el botón «Ver ambos».
- GPS y distancia al coche en una sola franja.
- Compartir coche mediante QR/enlace.
- Vinculación de varios dispositivos.
- Firebase Authentication anónima: sin login visible al usuario.
- Las coordenadas se cifran con AES-GCM antes de enviarse a Firebase.
- La clave de cifrado viaja en el enlace/QR y se guarda localmente en los dispositivos.
- Firebase almacena el payload cifrado, no latitud/longitud en claro.
- Copia local del último aparcamiento.
- Sincronización automática al abrir, recuperar Internet o mientras la app está abierta.
- «Coche recogido» se sincroniza entre dispositivos.
- Caché PWA incrementada a v1.1.0.

## Publicación en GitHub

Sustituye en la raíz del repositorio:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest

Conserva tu carpeta `icons` actual si ya contiene el icono nuevo.

## Firebase

El proyecto ya está configurado para:
- Project ID: aparcar-2100b
- Realtime Database: europe-west1
- Authentication: Anonymous

Comprueba que las reglas coincidan con `firebase-rules-v1.1.0.json`.

## Seguridad

El enlace/QR de invitación es una llave: contiene el ID del coche, el token de unión y la clave AES.
No lo publiques ni lo envíes a personas que no deban acceder al coche.

El `apiKey` de Firebase incluido en app.js es configuración pública de cliente web; no es la clave
de cifrado del coche.

## Prueba recomendada

1. Publica v1.1.0.
2. Abre la app en el primer iPhone.
3. Pulsa «Compartir» → «Crear coche compartido».
4. Escanea el QR con un segundo iPhone.
5. Pulsa «Vincular».
6. Marca una ubicación en un móvil y verifica que aparece en el otro.
7. Pulsa «Recogido» y verifica que desaparece en ambos.
