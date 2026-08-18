package fr.allvaps.ava.device;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Scanner;

public class DeviceAgentService extends Service {
  private static final String TAG = "AVA_DEVICE";
  private static final String CH = "ava_device_remote";
  private volatile boolean running;
  private int backoffMs = 2000;

  @Override
  public void onCreate() {
    super.onCreate();
    createChannel();
    startForeground(42, notification(getString(R.string.app_name)));
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    if (running) return START_STICKY;
    running = true;
    new Thread(this::loop, "ava-device-poll").start();
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public void onDestroy() {
    running = false;
    super.onDestroy();
  }

  private void loop() {
    while (running) {
      try {
        if (!AgentPrefs.remoteEnabled(this) || !AgentPrefs.enrolled(this)) {
          sleepQuiet(8000);
          continue;
        }
        JSONObject hb = CommandExecutor.execute(this, "DEVICE_STATUS", new JSONObject(), true);
        hb.put("remoteAccessEnabled", true);
        hb.put("agentVersion", "1.0.0");
        JSONObject hbRes = postSigned("/api/internal/ava-device/agent/heartbeat", hb.toString());
        if (hbRes == null) {
          backoff();
          continue;
        }
        if (!hbRes.optBoolean("gatewayEnabled", true) || hbRes.optBoolean("killSwitch", false)) {
          Log.i(TAG, "kill switch — pause");
          sleepQuiet(15000);
          continue;
        }
        boolean remote = hbRes.optBoolean("remoteSessionActive", false);
        updateIndicator(remote);
        JSONObject poll = postSigned("/api/internal/ava-device/agent/poll", "{}");
        backoffMs = 2000;
        if (poll != null && poll.has("job") && !poll.isNull("job")) {
          JSONObject job = poll.getJSONObject("job");
          updateIndicator(true);
          JSONObject args = job.optJSONObject("args");
          if (args == null) args = new JSONObject();
          JSONObject result = CommandExecutor.execute(
            this,
            job.getString("command"),
            args,
            job.optBoolean("dryRun", true)
          );
          JSONObject payload = new JSONObject();
          payload.put("jobId", job.getString("jobId"));
          boolean authStop = result.optBoolean("authChallenge", false);
          payload.put("ok", !authStop && !result.has("error"));
          if (result.has("screenshotJpegBase64")) {
            payload.put("screenshotJpegBase64", result.getString("screenshotJpegBase64"));
            result.remove("screenshotJpegBase64");
          }
          payload.put("authChallenge", authStop);
          payload.put("result", result);
          postSigned("/api/internal/ava-device/agent/result", payload.toString());
        }
        sleepQuiet(remote ? 2500 : 8000);
      } catch (Exception e) {
        Log.w(TAG, "poll error", e);
        backoff();
      }
    }
  }

  private void backoff() {
    sleepQuiet(backoffMs);
    backoffMs = Math.min(backoffMs * 2, 30_000);
  }

  private void sleepQuiet(int ms) {
    try { Thread.sleep(ms); } catch (InterruptedException ignored) {}
  }

  private JSONObject postSigned(String path, String body) {
    HttpURLConnection c = null;
    try {
      String secret = DeviceKeystore.ensureHmacSecret(this);
      String ts = String.valueOf(System.currentTimeMillis());
      String canon = ts + ".POST." + path + "." + sha256(body);
      String sig = DeviceKeystore.sign(secret, canon);
      URL url = new URL(AgentPrefs.gateway(this) + path);
      c = (HttpURLConnection) url.openConnection();
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setConnectTimeout(12_000);
      c.setReadTimeout(20_000);
      c.setRequestProperty("Content-Type", "application/json");
      c.setRequestProperty("X-Ava-Device-Id", AgentPrefs.deviceId(this));
      c.setRequestProperty("X-Ava-Device-Timestamp", ts);
      c.setRequestProperty("X-Ava-Device-Signature", sig);
      byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
      c.setFixedLengthStreamingMode(bytes.length);
      try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
      int code = c.getResponseCode();
      Scanner sc = new Scanner(code >= 400 ? c.getErrorStream() : c.getInputStream(), "UTF-8").useDelimiter("\\A");
      String raw = sc.hasNext() ? sc.next() : "{}";
      if (code >= 400) {
        Log.w(TAG, "http " + code);
        return null;
      }
      return new JSONObject(raw);
    } catch (Exception e) {
      Log.w(TAG, "postSigned", e);
      return null;
    } finally {
      if (c != null) c.disconnect();
    }
  }

  private static String sha256(String s) throws Exception {
    byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
    StringBuilder sb = new StringBuilder();
    for (byte b : d) sb.append(String.format("%02x", b));
    return sb.toString();
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel ch = new NotificationChannel(CH, "AVA Device", NotificationManager.IMPORTANCE_LOW);
      getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }
  }

  private Notification notification(String text) {
    Notification.Builder b = Build.VERSION.SDK_INT >= 26
      ? new Notification.Builder(this, CH)
      : new Notification.Builder(this);
    return b.setContentTitle("AVA")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_lock_idle_lock)
      .setOngoing(true)
      .build();
  }

  private void updateIndicator(boolean remote) {
    NotificationManager nm = getSystemService(NotificationManager.class);
    String text = remote ? getString(R.string.remote_indicator) : getString(R.string.app_name);
    nm.notify(42, notification(text));
  }
}
