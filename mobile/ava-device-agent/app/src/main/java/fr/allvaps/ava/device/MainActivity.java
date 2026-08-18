package fr.allvaps.ava.device;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.Switch;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Scanner;

public class MainActivity extends Activity {
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_main);
    TextView id = findViewById(R.id.deviceId);
    TextView status = findViewById(R.id.status);
    Switch remote = findViewById(R.id.remoteToggle);
    id.setText("DEVICE ID : " + AgentPrefs.deviceId(this));
    status.setText(AgentPrefs.enrolled(this) ? "Enrôlé" : "Non enrôlé");
    remote.setChecked(!AgentPrefs.remoteEnabled(this));
    remote.setOnCheckedChangeListener((v, checked) -> {
      AgentPrefs.setRemoteEnabled(this, !checked);
      Toast.makeText(this, checked ? "Accès distant coupé" : "Accès distant autorisé", Toast.LENGTH_SHORT).show();
    });
    findViewById(R.id.startBtn).setOnClickListener(v ->
      startForegroundService(new Intent(this, DeviceAgentService.class)));
    Button enroll = findViewById(R.id.enrollBtn);
    enroll.setOnClickListener(v -> new Thread(this::enroll).start());
  }

  private void enroll() {
    try {
      String secret = DeviceKeystore.ensureHmacSecret(this);
      JSONObject body = new JSONObject();
      body.put("deviceId", AgentPrefs.deviceId(this));
      body.put("deviceSecret", secret);
      String enrollToken = AgentPrefs.sp(this).getString("enroll_token", "");
      URL url = new URL(AgentPrefs.gateway(this) + "/api/internal/ava-device/agent/enroll");
      HttpURLConnection c = (HttpURLConnection) url.openConnection();
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "application/json");
      c.setRequestProperty("Authorization", "Bearer " + enrollToken);
      byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
      try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
      int code = c.getResponseCode();
      Scanner sc = new Scanner(code >= 400 ? c.getErrorStream() : c.getInputStream()).useDelimiter("\\A");
      String raw = sc.hasNext() ? sc.next() : "";
      boolean ok = code == 200;
      AgentPrefs.setEnrolled(this, ok);
      runOnUiThread(() -> {
        ((TextView) findViewById(R.id.status)).setText(ok ? "Enrôlé" : "Échec enrôlement " + code);
        if (!ok) Toast.makeText(this, raw, Toast.LENGTH_LONG).show();
      });
      c.disconnect();
    } catch (Exception e) {
      runOnUiThread(() -> Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show());
    }
  }
}
