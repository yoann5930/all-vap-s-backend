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

Le wrapper Gradle est généré depuis la distribution officielle `gradle-8.7` (services.gradle.org).

```bash
cd mobile/ava-device-agent
gradlew.bat :app:assembleDebug
```

Ne pas désinstaller l’APK AVA actuel. Désinstaller uniquement `fr.allvaps.ava.device` pour rollback.

Le jeton d’enrôlement se saisit dans l’écran agent (jamais dans Git). Après succès il est effacé des prefs.
