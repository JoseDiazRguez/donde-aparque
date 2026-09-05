# ¿Dónde aparqué? — guía completa de publicación e instalación

Versión 1.0.0 · PWA estática · sin backend

## 1. Qué has recibido

Esta carpeta es la aplicación completa. No se compila y no necesita Xcode.

Archivos principales:
- `index.html`: interfaz.
- `styles.css`: diseño.
- `app.js`: GPS, mapa, marcado, distancia, almacenamiento y Google Maps.
- `sw.js`: permite que la interfaz pueda abrir aunque temporalmente no haya Internet.
- `manifest.webmanifest`: hace que Safari/otros navegadores la reconozcan como app web.
- `icons/`: iconos de instalación.
- `.nojekyll`: evita transformaciones innecesarias de GitHub Pages.
- `robots.txt`: pide a buscadores que no indexen la app.

No subas el ZIP como único archivo: debes descomprimirlo y subir el contenido de esta carpeta.

---

## 2. Lo que se guarda y dónde

La app guarda únicamente un aparcamiento actual:
- latitud;
- longitud;
- fecha/hora.

Se almacena en IndexedDB, dentro del almacenamiento local del sitio/app web en el dispositivo.
No existe una base de datos en GitHub ni un servidor que reciba esa información.

Cuando pulsas `Coche recogido`, la entrada se elimina.

Importante: una PWA no puede garantizar que iOS nunca elimine datos locales si el usuario borra datos de Safari, elimina la app web o el sistema gestiona almacenamiento. Por eso no debe usarse como archivo histórico.

---

## 3. Publicarla gratis con GitHub Pages

### A. Crear cuenta
1. Entra en `github.com`.
2. Crea una cuenta gratuita si no tienes una.
3. Activa 2FA en GitHub; es recomendable para proteger la cuenta que publica el código.

### B. Crear el repositorio
1. En GitHub pulsa `New repository`.
2. Nombre recomendado: `donde-aparque`.
3. Marca `Public` (GitHub Pages gratuito funciona con repositorios públicos).
4. No añadas README, `.gitignore` ni licencia desde el asistente si vas a subir directamente esta carpeta.
5. Pulsa `Create repository`.

### C. Subir la aplicación
1. Dentro del repositorio, elige `uploading an existing file` / `Add file` → `Upload files`.
2. Descomprime `DondeAparque-PWA-v1.0.0.zip` en tu ordenador.
3. Sube **el contenido** de la carpeta, de modo que `index.html` quede en la raíz del repositorio.
4. Comprueba que también estén `icons`, `app.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `.nojekyll` y `robots.txt`.
5. Escribe un mensaje como `Publicar v1.0.0` y confirma el commit.

### D. Activar GitHub Pages
1. Abre `Settings` del repositorio.
2. En la barra lateral entra en `Pages`.
3. En `Build and deployment`, selecciona `Deploy from a branch`.
4. Branch: `main`.
5. Folder: `/(root)`.
6. Guarda.
7. GitHub mostrará la dirección de la web cuando esté publicada. Normalmente será parecida a:
   `https://TU-USUARIO.github.io/donde-aparque/`
8. Si aparece la opción `Enforce HTTPS`, déjala activada.

No necesitas dominio propio.

---

## 4. Instalarla en un iPhone

Haz esto una sola vez en cada iPhone:
1. Abre la URL de GitHub Pages en **Safari**.
2. Pulsa el botón `Compartir` de Safari.
3. Selecciona `Añadir a pantalla de inicio`.
4. Activa `Abrir como app web`.
5. Pulsa `Añadir`.
6. Aparecerá el icono `Dónde aparqué` en la pantalla de inicio.
7. Ábrelo.
8. iPhone pedirá permiso para usar la ubicación. Concédelo mientras se usa la app.

A partir de ese momento se abre desde el icono, sin entrar manualmente en Safari.

---

## 5. Cómo se usa

### Cuando aparcas
1. Abre `¿Dónde aparqué?`.
2. Espera a que indique `Ubicación localizada`.
3. Verás tu punto azul y un círculo azul de 10 m.
4. Toca el mapa exactamente donde has dejado el coche.
5. Aparecerá un pin.
6. Pulsa `Guardar aquí`.

### Cuando vuelves a buscarlo
1. Abre la app.
2. Verás tu posición y el coche guardado.
3. La app muestra la distancia en línea recta.
4. Pulsa `Ver ambos` si quieres encuadrar los dos puntos.
5. Pulsa `Cómo llegar` para abrir Google Maps andando al destino exacto.
6. También existe `Ir en coche`.

### Cuando lo recoges
1. Pulsa `Coche recogido`.
2. Confirma.
3. La ubicación local se borra.

---

## 6. Seguridad: qué hace esta versión

- Sin login.
- Sin contraseñas.
- Sin cookies de la aplicación.
- Sin analytics.
- Sin Firebase.
- Sin WordPress.
- Sin API propia.
- Sin SQL.
- Sin historial de aparcamientos.
- JavaScript de la app servido desde el mismo GitHub Pages.
- Content Security Policy restrictiva.
- HTTPS.
- `noindex` y `robots.txt` para pedir a buscadores que no indexen el sitio.
- Los datos del coche no forman parte del repositorio y nunca se escriben en GitHub.

No existe el riesgo cero. Las principales exposiciones que permanecen son:
1. OpenStreetMap recibe solicitudes de las teselas de la zona que estás visualizando y tu IP/red, como ocurre con cualquier mapa online.
2. Cuando pulsas un botón de ruta, Google Maps recibe la coordenada de destino para poder calcularla.
3. Quien tenga acceso al iPhone desbloqueado y pueda abrir la app podría ver el punto guardado.
4. GitHub Pages es una URL pública. Eso no expone tus aparcamientos porque están en cada dispositivo, pero sí permite que otra persona vea el código/interfaz si conoce la URL.

Si más adelante quieres una capa adicional, se puede añadir bloqueo local por PIN/Face ID solo hasta el límite que permiten las PWA, pero para un único punto de aparcamiento temporal aumenta bastante la complejidad.

---

## 7. Actualizar la app en el futuro

Cuando te entregue una v1.0.1, v1.1, etc.:
1. Sustituye en GitHub los archivos que hayan cambiado.
2. Haz commit.
3. GitHub Pages publica la nueva versión.
4. La app instalada irá recogiendo los nuevos archivos mediante el Service Worker.

Los aparcamientos guardados no están dentro de esos archivos y no deberían borrarse por una actualización normal.

---

## 8. Si cambia la URL

Los datos locales pertenecen al origen web (dominio + ruta/origen según el navegador). Evita cambiar de dominio o publicar la app con otra URL si quieres conservar el aparcamiento actual de los dispositivos ya instalados.

---

## 9. Comprobación rápida después de publicar

Prueba en tu iPhone:
- [ ] La URL abre por HTTPS.
- [ ] Safari solicita ubicación.
- [ ] Aparece tu posición.
- [ ] El círculo de 10 m aparece alrededor de tu posición.
- [ ] Puedes arrastrar el mapa.
- [ ] Puedes hacer zoom con +/− y gesto de pinza.
- [ ] Un toque crea un pin.
- [ ] `Guardar aquí` mantiene el coche tras cerrar y volver a abrir.
- [ ] La distancia cambia al moverte.
- [ ] `Cómo llegar` abre Google Maps con el destino correcto.
- [ ] `Coche recogido` borra el punto.
- [ ] Se instala con `Añadir a pantalla de inicio` → `Abrir como app web`.
