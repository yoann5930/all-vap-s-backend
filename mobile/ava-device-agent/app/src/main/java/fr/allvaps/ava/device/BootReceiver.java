package fr.allvaps.ava.device;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive(Context context, Intent intent) {
    if (!AgentPrefs.remoteEnabled(context) || !AgentPrefs.enrolled(context)) return;
    context.startForegroundService(new Intent(context, DeviceAgentService.class));
  }
}
