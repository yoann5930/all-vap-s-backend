package fr.allvaps.ava.device;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.widget.Button;
import android.widget.EditText;
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
    EditText tokenField = findViewById(R.id.enrollToken);
    id.setText("DEVICE ID : " + AgentPrefs.deviceId(this));
    status.setText(AgentPrefs.enrolled(this) ? "Enrôlé" : "Non enrôlé");
    remote.setChecked(!AgentPrefs.remoteEnabled(this));
    remote.setOnCheckedChangeListener((v, checked) -> {
      AgentPrefs.setRemoteEnabled(this, !checked);
      Toast.makeText(this, checked ? "Accès distant coupé" : "Accès distant autorisé", Toast.LENGTH_SHORT).show();
    });
    String extraToken = getIntent() != null ? getIntent().getStringExtra("enroll_token") : null;
    if (extraToken != null && !extraToken.isEmpty()) {
      tokenField.setText(extraToken);
      AgentPrefs.setEnrollToken(this, extraToken);
    } else {
      String saved = AgentPrefs.enrollToken(this);
      if (!saved.isEmpty()) tokenField.setText(saved);
    }
    findViewById(R.id.startBtn).setOnClickListener(v ->
      startForegroundService(new Intent(this, DeviceAgentService.class)));
    findViewById(R.id.accessBtn).setOnClickListener(v ->
      startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));
    Button enroll = findViewById(R.id.enrollBtn);
    enroll.setOnClickListener(v -> {
      AgentPrefs.setEnrollToken(this, tokenField.getText().toString().trim());
      new Thread(this::enroll).start();
    });
    if (getIntent() != null && getIntent().getBooleanExtra("auto_enroll", false)) {
      new Thread(this::enroll).start();
    }
  }

  private void enroll() {
    try {
      String secret = DeviceKeystore.ensureHmacSecret(this);
      JSONObject body = new JSONObject();
      body.put("deviceId", AgentPrefs.deviceId(this));
      body.put("deviceSecret", secret);
      String enrollToken = AgentPrefs.enrollToken(this);
      URL url = new URL(AgentPrefs.gateway(this) + "/api/internal/ava-device/agent/enroll");
      HttpURLConnection c = (HttpURLConnection) url.openConnection();
      c.setRequestMethod("POST");
      c.setDoOutput(true);
      c.setConnectTimeout(12_000);
      c.setReadTimeout(20_000);
      c.setRequestProperty("Content-Type", "application/json");
      c.setRequestProperty("Authorization", "Bearer " + enrollToken);
      byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
      try (OutputStream os = c.getOutputStream()) { os.write(bytes); }
      int code = c.getResponseCode();
      Scanner sc = new Scanner(code >= 400 ? c.getErrorStream() : c.getInputStream()).useDelimiter("\\A");
      String raw = sc.hasNext() ? sc.next() : "";
      boolean ok = code == 200;
      AgentPrefs.setEnrolled(this, ok);
      if (ok) AgentPrefs.clearEnrollToken(this);
      runOnUiThread(() -> {
        ((TextView) findViewById(R.id.status)).setText(ok ? "Enrôlé" : "Échec enrôlement " + code);
        if (ok) {
          ((EditText) findViewById(R.id.enrollToken)).setText("");
          startForegroundService(new Intent(this, DeviceAgentService.class));
        } else {
          Toast.makeText(this, "Échec enrôlement", Toast.LENGTH_LONG).show();
        }
      });
      c.disconnect();
    } catch (Exception e) {
      runOnUiThread(() -> Toast.makeText(this, e.getMessage(), Toast.LENGTH_LONG).show());
    }
  }
}
