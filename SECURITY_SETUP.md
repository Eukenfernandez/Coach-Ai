# 🔒 Guía de Seguridad - Coach AI

Esta guía explica cómo configurar la seguridad de la aplicación para que el código, las API Keys y los prompts sean invisibles al pulsar F12.

## Arquitectura de Seguridad

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│    FRONTEND     │────▶│  FIREBASE FUNCTIONS  │────▶│   GEMINI API    │
│   (Visible)     │     │     (Invisible)      │     │   (Google)      │
│                 │     │                      │     │                 │
│  - Código       │     │  ✅ API Key segura   │     │  - Análisis IA  │
│    minificado   │     │  ✅ Prompts secretos │     │                 │
│  - Sin console  │     │  ✅ Lógica oculta    │     │                 │
└─────────────────┘     └──────────────────────┘     └─────────────────┘
```

---

## Paso 1: Instalar dependencias de Cloud Functions

```bash
cd functions
npm install
```

---

## Paso 2: Configurar la API Key de Gemini (Secreto)

La API Key se guarda en Firebase Secrets, no en el código:

```bash
# Configurar el secreto (te pedirá el valor)
firebase functions:secrets:set GEMINI_API_KEY

# Verificar que existe
firebase functions:secrets:access GEMINI_API_KEY
```

---

## Paso 3: Desplegar las Cloud Functions

```bash
# Desplegar solo las funciones
firebase deploy --only functions

# O desplegar todo junto
firebase deploy
```

---

## Paso 4: Build de producción (Frontend minificado)

```bash
npm run build
```

El resultado en `dist/` tendrá:
- ✅ Archivos con nombres hasheados (`[hash].js`)
- ✅ Variables ofuscadas (`a`, `b`, `x` en lugar de `analizarVideo`)
- ✅ Sin sourcemaps (no se puede reconstruir el código original)
- ✅ Sin `console.log` ni comentarios

---

## Paso 5 (Opcional): Firebase App Check

Para asegurar que solo tu app real puede llamar a las funciones:

1. Ve a **Firebase Console** → **App Check**
2. Activa App Check para:
   - **Funciones**
   - **Firestore**
   - **Storage**
3. Usa **reCAPTCHA Enterprise** para web

---

## Paso 6 (Opcional): Restringir API Key en Google Cloud

1. Ve a **Google Cloud Console** → **APIs & Services** → **Credentials**
2. Edita tu API Key de Gemini
3. En **Application restrictions**, selecciona:
   - **HTTP referrers** → añade solo tu dominio
   - O **IP addresses** → añade solo las IPs de Cloud Functions

---

## ¿Qué ve alguien que pulse F12?

### Antes (INSEGURO):
```javascript
// Network Tab - Request:
{
  "apiKey": "AIzaSy...",  // ❌ VISIBLE
  "prompt": "Analiza la biomecánica..."  // ❌ VISIBLE
}
```

### Después (SEGURO):
```javascript
// Network Tab - Request:
{
  "data": {
    "base64Image": "...",  // Solo la imagen
    "language": "es"
  }
}
// No hay API Key, no hay prompts
```

### Sources Tab:
```javascript
// Código minificado (ilegible)
function a(b,c){return d.e(f,g)}
```

---

## Estructura de archivos

```
coach-ai/
├── functions/                  # Backend (invisible)
│   ├── src/
│   │   └── index.ts           # Cloud Functions con lógica secreta
│   ├── package.json
│   └── tsconfig.json
├── services/
│   └── geminiService.ts       # Frontend - solo llama a funciones
├── vite.config.ts             # Configuración de minificación
└── firebase.json              # Configuración de despliegue
```

---

## Comandos rápidos

```bash
# Desarrollo local
npm run dev

# Build producción (minificado)
npm run build

# Desplegar funciones
firebase deploy --only functions

# Desplegar todo
firebase deploy

# Ver logs de funciones
firebase functions:log
```

---

## Solución de problemas

### Error: "unauthenticated"
Las funciones requieren que el usuario esté logueado. Asegúrate de que el usuario haya iniciado sesión antes de usar el análisis IA.

### Error: "GEMINI_API_KEY is not defined"
Configura el secreto:
```bash
firebase functions:secrets:set GEMINI_API_KEY
```

### El código sigue siendo legible en F12
Asegúrate de estar viendo el build de producción (`npm run build`), no el servidor de desarrollo (`npm run dev`).
