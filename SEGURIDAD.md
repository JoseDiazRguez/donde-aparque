# Seguridad técnica — v1.0.0

## Arquitectura

Cliente estático (GitHub Pages) → navegador/PWA → IndexedDB local.
No existe backend de aplicación.

## Dependencias remotas en ejecución

- `tile.openstreetmap.org`: únicamente imágenes de teselas del mapa que el usuario visualiza.
- `google.com/maps`: solo cuando el usuario pulsa un botón de navegación.

No se carga JavaScript remoto.

## Política CSP incluida

La cabecera equivalente se incluye mediante meta `Content-Security-Policy` porque GitHub Pages no permite configurar libremente cabeceras HTTP del sitio.

Permite:
- scripts solo del propio origen;
- estilos solo del propio origen;
- imágenes del propio origen, `data:` y `tile.openstreetmap.org`;
- workers solo del propio origen;
- conexiones programáticas solo al propio origen;
- sin formularios ni objetos embebidos.

## Limitaciones honestas

Una CSP en meta no equivale en todos los detalles a una cabecera HTTP administrada por un servidor propio. Para esta PWA estática reduce superficie de ataque, pero no debe describirse como seguridad absoluta.

GitHub Pages es público. Nunca incluyas secretos, contraseñas, tokens o datos privados dentro de los archivos del repositorio.
