# Zuno TV (LG webOS)

App de Zuno para televisores LG con webOS 3.5 o superior. La TV muestra y reproduce; **el Zuno
de la computadora (Windows o Mac) hace de servidor**: busca, arma el inicio, trae las letras y le
pasa el audio por la red de la casa. La computadora tiene que estar prendida con Zuno abierto.

## 1. Preparar la computadora
1. Instala Zuno 1.8.0 o superior.
2. Zuno → **Ajustes → Ventana → Zuno en la TV** → activa **«Permitir que la TV use esta computadora»**.
3. Anota la **dirección** (por ejemplo `192.168.0.197`) y el **código de 6 dígitos**.
4. Si Windows pregunta por el firewall, permite el acceso en **redes privadas**.

La TV y la computadora tienen que estar en la **misma red Wi-Fi/cable**.

## 2. Instalar la app en la TV (modo desarrollador de LG)
Las apps que no vienen de la LG Content Store se instalan con el modo desarrollador:

1. Crea una cuenta gratuita en <https://webostv.developer.lge.com> (botón *Sign in*).
2. En la TV, abre la **LG Content Store**, busca e instala **«Developer Mode»**.
3. Abre *Developer Mode*, inicia sesión con esa cuenta, activa **Dev Mode Status** y reinicia la TV cuando lo pida.
4. Vuelve a abrir *Developer Mode* y activa **Key Server**. Anota la **IP** de la TV y la **Passphrase** que muestra.
5. En la computadora, dentro de la carpeta del repo:
   ```bash
   npx ares-setup-device --add tv -i "{\"host\":\"IP_DE_LA_TV\",\"port\":\"9922\",\"username\":\"prisoner\"}"
   npx ares-novacom --device tv --getkey      # pide la Passphrase de la TV
   npx ares-install --device tv Zuno-TV-1.0.0-webos.ipk
   ```
6. Zuno aparece en el menú de apps de la TV.

> El modo desarrollador de LG **caduca a las 50 horas**. Para que no se borre la app, abre
> *Developer Mode* en la TV de vez en cuando y pulsa **Extend** (queda en 50 h otra vez).

## 3. Usarla
- La primera vez pide la **dirección** y el **código** de la computadora (teclado numérico en pantalla).
- **Flechas + OK** para navegar; **Atrás** vuelve.
- **Play/Pausa**, **⏩/⏪** (±15 s) en el control.
- **Botón rojo**: karaoke a pantalla completa. **Botón verde**: pantalla de reproducción con letra.
- Si la computadora tiene sesión iniciada en YouTube Music, aparece **Biblioteca** con tus playlists y «Me gusta».

## Desarrollo
```bash
npm run tv:dev       # vite en http://localhost:5181 (probar con teclado; Backspace = Atrás)
npm run tv:build     # build ES5 + es-check (el motor de la TV es Chromium 38)
npm run tv:package   # genera tv/release/com.zuno.tv_<versión>_all.ipk
```
Reglas para Chromium 38: nada de `fetch` (usar `api.ts`), nada de `var(--…)`, CSS grid ni `gap`
en flex; prefijos `-webkit-` en flex, transform y `background-clip:text`.
