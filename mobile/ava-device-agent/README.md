# AVA Device Agent (Samsung)

Agent Android **sortant** (HTTPS). Aucun ADB public, aucun port 5555.

## Identité

- `AVA_DEVICE_ID` par défaut : `AVA-SAMSUNG-01` (applicatif, pas d’IMEI)
- Secret HMAC généré sur l’appareil, enveloppé par **Android Keystore**
- Enrôlement : `POST /api/internal/ava-device/agent/enroll` avec `AVA_DEVICE_ENROLL_TOKEN`

## Kill switch local

Dans l’app : **Désactiver accès distant AVA**

Côté serveur : `AVA_DEVICE_GATEWAY_ENABLED=false`

## Indicateur

Notification « Contrôle technique AVA actif » pendant une session distante.

## Build

Copier `gradle/wrapper/gradle-wrapper.jar` depuis `mobile/inventaire-webview` si besoin, puis :

```bash
cd mobile/ava-device-agent
./gradlew :app:assembleDebug
```

Ne pas désinstaller l’APK AVA actuel sans rollback.

Le token d’enrôlement se place dans les prefs `enroll_token` (jamais dans Git).
