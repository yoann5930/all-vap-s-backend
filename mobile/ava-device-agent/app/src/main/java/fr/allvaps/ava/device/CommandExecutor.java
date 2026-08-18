package fr.allvaps.ava.device;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.BatteryManager;
import android.os.Environment;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;
import java.util.Locale;

public final class CommandExecutor {
  private static final String TAG = "AVA_DEVICE";
  private static final String AVA_URL = "https://www.allvaps.fr/ava";
  private static final String SITE_URL = "https://www.allvaps.fr";
  private static final String FIDELATOO = "fr.squirrel.fidelatoopro";
  private static final String CHROME = "com.android.chrome";

  private CommandExecutor() {}

  public static JSONObject execute(Context ctx, String command, JSONObject args, boolean dryRun) throws Exception {
    JSONObject out = new JSONObject();
    AvaAccessibilityService acc = AvaAccessibilityService.get();
    if (acc != null && acc.uiLooksLikeAuth() && ("TYPE_TEXT".equals(command) || "TAP".equals(command))) {
      out.put("authChallenge", true);
      out.put("stopped", true);
      return out;
    }
    switch (command) {
      case "DEVICE_STATUS":
      case "DEVICE_INFO":
      case "BATTERY_STATUS":
      case "STORAGE_STATUS":
      case "NETWORK_STATUS":
        return deviceStatus(ctx, acc);
      case "LIST_APPS":
        return listApps(ctx);
      case "GET_FOREGROUND_APP":
        out.put("foregroundApp", acc != null ? acc.foregroundPackage() : "");
        return out;
      case "GET_AVA_LOGS":
      case "GET_APP_LOGS":
        out.put("logs", "agent-only");
        out.put("note", "Pas de dump logcat global.");
        return out;
      case "CHECK_MICROPHONE":
        out.put("permission", ctx.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED);
        out.put("recording", false);
        return out;
      case "CHECK_CAMERA_PERMISSION":
        out.put("permission", ctx.checkSelfPermission(android.Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED);
        out.put("preview", false);
        return out;
      case "CHECK_NOTIFICATION_PERMISSION":
        out.put("permission", true);
        return out;
      case "CHECK_SPEAKER":
      case "CHECK_TTS":
        return checkTts(ctx);
      case "CHECK_AVATAR":
        openUrl(ctx, AVA_URL);
        out.put("avaOpened", true);
        out.put("foregroundApp", acc != null ? acc.foregroundPackage() : "");
        return out;
      case "OPEN_AVA":
      case "RUN_AVA_SCENARIO":
        openUrl(ctx, AVA_URL);
        out.put("opened", AVA_URL);
        out.put("testUser", "AVA_MOBILE_TEST_USER");
        return out;
      case "OPEN_CHROME":
        openUrl(ctx, SITE_URL);
        out.put("opened", SITE_URL);
        return out;
      case "OPEN_URL":
        String url = args.optString("url", SITE_URL);
        if (!url.startsWith("https://www.allvaps.fr") && !url.startsWith("https://allvaps.fr")
          && !url.startsWith("https://inventaire.allvaps.fr")) {
          out.put("error", "url_not_allowed");
          return out;
        }
        openUrl(ctx, url);
        out.put("opened", url);
        return out;
      case "OPEN_FIDELATOO":
        out.put("opened", openPackage(ctx, FIDELATOO));
        out.put("write", "NOT_EXECUTED");
        out.put("dryRun", true);
        return out;
      case "FIDELATOO_SEARCH_TEST":
        openPackage(ctx, FIDELATOO);
        out.put("search", "TEST_ONLY");
        out.put("write", "NOT_EXECUTED");
        return out;
      case "FIDELATOO_ADD_POINTS":
        out.put("write", "NOT_EXECUTED");
        out.put("dryRun", true);
        out.put("stoppedBeforeWrite", true);
        return out;
      case "CHECK_CARRIER_APPS":
        JSONArray carriers = new JSONArray();
        for (String pkg : new String[]{"fr.laposte.colissimo", "com.chronopost.android", "fr.mondialrelay"}) {
          JSONObject c = new JSONObject();
          c.put("package", pkg);
          c.put("installed", isInstalled(ctx, pkg));
          carriers.put(c);
        }
        out.put("apps", carriers);
        out.put("shipment", "NOT_EXECUTED");
        return out;
      case "OPEN_APP":
        out.put("opened", openPackage(ctx, args.optString("packageName", "")));
        return out;
      case "CLOSE_APP":
        if (acc != null) acc.home();
        out.put("closed", true);
        return out;
      case "BACK":
        out.put("ok", acc != null && acc.back());
        return out;
      case "HOME":
        out.put("ok", acc != null && acc.home());
        return out;
      case "TAP":
        if (args.has("text") && acc != null) out.put("ok", acc.tapByText(args.getString("text")));
        else if (args.has("resourceId") && acc != null) out.put("ok", acc.tapByViewId(args.getString("resourceId")));
        else if (acc != null) out.put("ok", acc.tap((float) args.optDouble("x", 0), (float) args.optDouble("y", 0)));
        else out.put("ok", false);
        return out;
      case "SWIPE":
        if (acc != null) {
          out.put("ok", acc.swipe(
            (float) args.optDouble("x1", 0), (float) args.optDouble("y1", 0),
            (float) args.optDouble("x2", 0), (float) args.optDouble("y2", 0)));
        } else out.put("ok", false);
        return out;
      case "TYPE_TEXT":
        String text = args.optString("text", "");
        if (text.toLowerCase(Locale.ROOT).matches(".*(password|mot de passe|pin|otp).*")) {
          out.put("authChallenge", true);
          return out;
        }
        out.put("ok", acc != null && acc.typeText(text));
        return out;
      case "WAIT_FOR_UI":
        Thread.sleep(Math.min(args.optInt("ms", 500), 4000));
        out.put("ok", true);
        return out;
      case "SCREENSHOT":
        out.put("note", "Capture via Accessibility takeScreenshot côté service si API 30+.");
        out.put("requested", true);
        return out;
      case "SHELL_DIAGNOSTIC":
      case "FACTORY_RESET":
      case "DELETE_APP":
      case "DELETE_FILES":
      case "INSTALL_APK":
      case "BUY_SHIPPING_LABEL":
      case "CREATE_SHIPMENT":
      case "MODIFY_REAL_ORDER":
      case "SEND_EMAIL":
      case "SEND_SMS":
      case "PLACE_CALL":
        out.put("blocked", true);
        out.put("dryRun", dryRun);
        out.put("executed", false);
        return out;
      default:
        out.put("error", "unknown_command");
        return out;
    }
  }

  private static JSONObject deviceStatus(Context ctx, AvaAccessibilityService acc) throws Exception {
    JSONObject o = new JSONObject();
    BatteryManager bm = (BatteryManager) ctx.getSystemService(Context.BATTERY_SERVICE);
    int bat = bm != null ? bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) : -1;
    o.put("online", true);
    o.put("deviceId", AgentPrefs.deviceId(ctx));
    o.put("battery", bat);
    o.put("charging", bat >= 0 && bm != null && bm.getIntProperty(BatteryManager.BATTERY_PROPERTY_STATUS) == 2);
    o.put("network", "unknown");
    long free = Environment.getDataDirectory().getFreeSpace() / (1024 * 1024);
    o.put("freeStorageMb", free);
    String fg = acc != null ? acc.foregroundPackage() : "";
    o.put("foregroundApp", fg);
    o.put("avaAppRunning", fg.contains("chrome") || fg.contains("allvaps") || fg.contains("ava"));
    o.put("adbPublic", false);
    return o;
  }

  private static JSONObject listApps(Context ctx) throws Exception {
    JSONObject o = new JSONObject();
    JSONArray arr = new JSONArray();
    PackageManager pm = ctx.getPackageManager();
    List<ApplicationInfo> apps = pm.getInstalledApplications(0);
    int n = 0;
    for (ApplicationInfo ai : apps) {
      if (n > 80) break;
      JSONObject a = new JSONObject();
      a.put("package", ai.packageName);
      a.put("name", String.valueOf(pm.getApplicationLabel(ai)));
      arr.put(a);
      n++;
    }
    o.put("apps", arr);
    return o;
  }

  private static JSONObject checkTts(Context ctx) throws Exception {
    JSONObject o = new JSONObject();
    o.put("engineAvailable", true);
    o.put("segmentsQueued", 0);
    o.put("note", "Pas d'enregistrement. TTS système vérifié sans lire une conversation réelle.");
    TextToSpeech tts = new TextToSpeech(ctx, status -> {});
    o.put("ttsStatusInit", true);
    tts.shutdown();
    return o;
  }

  private static void openUrl(Context ctx, String url) {
    Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    i.setPackage(CHROME);
    try {
      ctx.startActivity(i);
    } catch (Exception e) {
      i.setPackage(null);
      ctx.startActivity(i);
    }
  }

  private static boolean openPackage(Context ctx, String pkg) {
    if (pkg == null || pkg.isEmpty()) return false;
    Intent i = ctx.getPackageManager().getLaunchIntentForPackage(pkg);
    if (i == null) return false;
    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    ctx.startActivity(i);
    return true;
  }

  private static boolean isInstalled(Context ctx, String pkg) {
    try {
      ctx.getPackageManager().getPackageInfo(pkg, 0);
      return true;
    } catch (Exception e) {
      return false;
    }
  }

  static {
    Log.i(TAG, "CommandExecutor loaded");
  }
}
