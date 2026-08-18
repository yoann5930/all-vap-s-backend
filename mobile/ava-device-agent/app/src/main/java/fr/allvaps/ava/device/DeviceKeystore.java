package fr.allvaps.ava.device;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.Mac;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Secret HMAC appareil : généré localement, enveloppé par Android Keystore (AES-GCM).
 * Jamais en clair dans le code.
 */
public final class DeviceKeystore {
  private static final String PREFS = "ava_device_agent";
  private static final String WRAP_ALIAS = "ava_device_wrap_aes";
  private static final String WRAPPED = "wrapped_hmac";
  private static final String IV = "wrapped_hmac_iv";
  private static final String ANDROID_KS = "AndroidKeyStore";

  private DeviceKeystore() {}

  public static synchronized String ensureHmacSecret(Context ctx) throws Exception {
    SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    SecretKey wrap = getOrCreateWrapKey();
    String existing = p.getString(WRAPPED, null);
    if (existing != null) {
      byte[] iv = Base64.decode(p.getString(IV, ""), Base64.NO_WRAP);
      byte[] wrapped = Base64.decode(existing, Base64.NO_WRAP);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.DECRYPT_MODE, wrap, new GCMParameterSpec(128, iv));
      return new String(c.doFinal(wrapped), StandardCharsets.UTF_8);
    }
    byte[] raw = new byte[32];
    new SecureRandom().nextBytes(raw);
    String secret = Base64.encodeToString(raw, Base64.NO_WRAP | Base64.NO_PADDING | Base64.URL_SAFE);
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(Cipher.ENCRYPT_MODE, wrap);
    byte[] iv = c.getIV();
    byte[] wrapped = c.doFinal(secret.getBytes(StandardCharsets.UTF_8));
    p.edit()
      .putString(WRAPPED, Base64.encodeToString(wrapped, Base64.NO_WRAP))
      .putString(IV, Base64.encodeToString(iv, Base64.NO_WRAP))
      .apply();
    return secret;
  }

  public static String sign(String secret, String canonical) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
    byte[] out = mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder(out.length * 2);
    for (byte b : out) sb.append(String.format("%02x", b));
    return sb.toString();
  }

  private static SecretKey getOrCreateWrapKey() throws Exception {
    KeyStore ks = KeyStore.getInstance(ANDROID_KS);
    ks.load(null);
    if (ks.containsAlias(WRAP_ALIAS)) {
      return ((KeyStore.SecretKeyEntry) ks.getEntry(WRAP_ALIAS, null)).getSecretKey();
    }
    KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KS);
    kg.init(new KeyGenParameterSpec.Builder(
      WRAP_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)
      .build());
    return kg.generateKey();
  }
}
