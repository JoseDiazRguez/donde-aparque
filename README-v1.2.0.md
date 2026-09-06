# ¿Dónde aparqué? — PWA v1.2.0

## Novedades

- Mapa más alto, aprovechando el espacio inferior liberado.
- Soporte para varios coches en un único dispositivo.
- Selector de coche siempre visible.
- Añadir, renombrar y eliminar coches del dispositivo.
- Cada coche mantiene su propia ubicación, estado de compartición y QR.
- El coche ya existente en v1.1.0 se migra automáticamente a «Mi coche».
- Los QR de v1.1.0 continúan siendo compatibles.
- El nombre del coche se cifra junto con la ubicación mediante AES-GCM.
- Firebase no recibe el nombre ni las coordenadas en texto legible.
- Al vincular un QR se añade un coche nuevo; no sustituye a los coches existentes.
- Caché PWA actualizada a v1.2.0.

## Importante

No es necesario cambiar las reglas de Firebase usadas por v1.1.0. El nombre viaja dentro
del mismo `payload` cifrado, por lo que las reglas existentes siguen siendo válidas.

## Actualización en GitHub

Sustituye:
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest

La carpeta icons no necesita cambios.

## Prueba recomendada

1. Abre la app tras actualizar.
2. Comprueba que tu coche anterior sigue presente.
3. Pulsa «＋ Coche» y añade un segundo coche.
4. Cambia entre ambos usando el selector.
5. Comparte uno de ellos y vincúlalo en otro iPhone.
6. Comprueba que el nombre aparece en ambos.
7. Renombra el coche compartido y comprueba que el nuevo nombre se sincroniza.
8. Confirma que el otro coche sigue independiente.
