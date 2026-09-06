# ¿Dónde aparqué? — PWA v1.2.2

## Corrección principal
En iOS, Safari y una PWA instalada pueden tener almacenamientos web separados. Por eso una
vinculación hecha tras escanear un QR en Safari no aparecía necesariamente dentro de la app
instalada.

## Nuevo flujo
- Al compartir un coche se genera:
  - QR
  - código de 12 caracteres, por ejemplo `7K4M-Q9ZT-2P8X`
- El código dura 15 minutos.
- Puede utilizarse varias veces durante ese periodo.
- El mismo coche puede vincularse:
  - en Safari
  - en la PWA instalada
  - en otros dispositivos
- En la PWA: `＋ Coche` → `Vincular coche con código`.

## Seguridad
- El código tiene mucha más entropía que 6 dígitos.
- Firebase no almacena la clave AES del coche en claro.
- La invitación (ID de coche + token + clave AES) se cifra usando una clave derivada del código.
- Firebase solo guarda el paquete de transferencia cifrado.
- El registro de transferencia deja de ser legible automáticamente al caducar.
- El nombre y la ubicación del coche siguen cifrados como en v1.2.0.

## Compatibilidad
- Los coches ya vinculados siguen funcionando.
- Los antiguos enlaces `#join=` siguen siendo reconocidos.
- No hace falta volver a vincular coches que ya aparecen dentro de la PWA.

## IMPORTANTE: Firebase
Esta versión añade `/transfers`, por lo que SÍ hay que actualizar las reglas de Realtime Database.
Copia exactamente el contenido de `firebase-rules-v1.2.2.json` en:
Realtime Database → Reglas → Publicar.

## GitHub
Sustituye:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- icons/ (incluye ya los iconos con pin rojo)

Las reglas Firebase NO se suben como parte funcional de GitHub; el JSON se incluye como referencia.

## Mejora visual incluida
Los textos/iconos de:
- Cómo llegar
- En coche
- Recogido
son un poco más grandes.
