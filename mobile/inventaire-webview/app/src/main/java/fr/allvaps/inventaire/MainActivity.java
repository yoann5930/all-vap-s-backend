package fr.allvaps.inventaire;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.view.WindowManager;

public class MainActivity extends Activity {
  private WebView webView;
  private static final String START_URL = "https://heather-auctions-they-leu.trycloudflare.com/inventaire";

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().setFlags(
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED
    );
    setContentView(R.layout.activity_main);
    webView = findViewById(R.id.webview);
    WebSettings s = webView.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setMediaPlaybackRequiresUserGesture(false);
    s.setAllowFileAccess(false);
    s.setLoadWithOverviewMode(true);
    s.setUseWideViewPort(true);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
    webView.setWebViewClient(new WebViewClient());
    webView.setWebChromeClient(new WebChromeClient() {
      @Override
      public void onPermissionRequest(final PermissionRequest request) {
        runOnUiThread(() -> request.grant(request.getResources()));
      }
    });
    webView.loadUrl(START_URL);
  }

  @Override
  public void onBackPressed() {
    if (webView != null && webView.canGoBack()) webView.goBack();
    else super.onBackPressed();
  }
}
