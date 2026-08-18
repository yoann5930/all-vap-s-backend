package fr.allvaps.ava.device;

import android.content.Context;
import android.content.SharedPreferences;

public final class AgentPrefs {
  private static final String P = "ava_device_agent";
  public static final String DEFAULT_ID = "AVA-SAMSUNG-01";
  public static final String DEFAULT_GATEWAY = "https://www.allvaps.fr";

  private AgentPrefs() {}

  public static SharedPreferences sp(Context c) {
    return c.getSharedPreferences(P, Context.MODE_PRIVATE);
  }

  public static boolean remoteEnabled(Context c) {
    return sp(c).getBoolean("remote_enabled", true);
  }

  public static void setRemoteEnabled(Context c, boolean on) {
    sp(c).edit().putBoolean("remote_enabled", on).apply();
  }

  public static String deviceId(Context c) {
    return sp(c).getString("device_id", DEFAULT_ID);
  }

  public static String gateway(Context c) {
    return sp(c).getString("gateway", DEFAULT_GATEWAY);
  }

  public static boolean enrolled(Context c) {
    return sp(c).getBoolean("enrolled", false);
  }

  public static void setEnrolled(Context c, boolean v) {
    sp(c).edit().putBoolean("enrolled", v).apply();
  }
}
