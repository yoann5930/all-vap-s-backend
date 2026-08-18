package fr.allvaps.ava.device;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.util.Base64;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import java.io.ByteArrayOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

public class AvaAccessibilityService extends AccessibilityService {
  private static AvaAccessibilityService instance;
  private String foregroundPkg = "";

  public static AvaAccessibilityService get() {
    return instance;
  }

  @Override
  protected void onServiceConnected() {
    instance = this;
  }

  @Override
  public void onAccessibilityEvent(AccessibilityEvent event) {
    if (event.getPackageName() != null) {
      foregroundPkg = String.valueOf(event.getPackageName());
    }
  }

  @Override
  public void onInterrupt() {}

  @Override
  public void onDestroy() {
    if (instance == this) instance = null;
    super.onDestroy();
  }

  public String foregroundPackage() {
    return foregroundPkg;
  }

  public boolean back() {
    return performGlobalAction(GLOBAL_ACTION_BACK);
  }

  public boolean home() {
    return performGlobalAction(GLOBAL_ACTION_HOME);
  }

  public boolean tap(float x, float y) {
    Path p = new Path();
    p.moveTo(x, y);
    GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(p, 0, 80);
    return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
  }

  public boolean swipe(float x1, float y1, float x2, float y2) {
    Path p = new Path();
    p.moveTo(x1, y1);
    p.lineTo(x2, y2);
    GestureDescription.StrokeDescription stroke = new GestureDescription.StrokeDescription(p, 0, 250);
    return dispatchGesture(new GestureDescription.Builder().addStroke(stroke).build(), null, null);
  }

  public boolean tapByText(String text) {
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null || text == null) return false;
    return tapNode(findByText(root, text));
  }

  public boolean tapByViewId(String viewId) {
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null || viewId == null) return false;
    java.util.List<AccessibilityNodeInfo> nodes = root.findAccessibilityNodeInfosByViewId(viewId);
    if (nodes == null || nodes.isEmpty()) return false;
    return tapNode(nodes.get(0));
  }

  public boolean typeText(String value) {
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null) return false;
    AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
    if (focused == null) return false;
    android.os.Bundle args = new android.os.Bundle();
    args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value);
    return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
  }

  public boolean uiLooksLikeAuth() {
    AccessibilityNodeInfo root = getRootInActiveWindow();
    if (root == null) return false;
    String blob = dumpText(root, new StringBuilder(), 0).toLowerCase();
    return blob.contains("mot de passe") || blob.contains("password") || blob.contains("code pin")
      || blob.contains("empreinte") || blob.contains("sms");
  }

  public String takeJpegBase64() {
    if (Build.VERSION.SDK_INT < 30) return null;
    CountDownLatch latch = new CountDownLatch(1);
    AtomicReference<String> ref = new AtomicReference<>();
    takeScreenshot(Display.DEFAULT_DISPLAY, getMainExecutor(), new TakeScreenshotCallback() {
      @Override
      public void onSuccess(ScreenshotResult screenshot) {
        HardwareBuffer hb = screenshot.getHardwareBuffer();
        try {
          Bitmap hw = Bitmap.wrapHardwareBuffer(hb, screenshot.getColorSpace());
          if (hw == null) return;
          Bitmap software = hw.copy(Bitmap.Config.ARGB_8888, false);
          if (software == null) return;
          int w = software.getWidth();
          int h = software.getHeight();
          if (w > 720) {
            h = Math.max(1, h * 720 / w);
            w = 720;
            Bitmap scaled = Bitmap.createScaledBitmap(software, w, h, true);
            if (scaled != software) software.recycle();
            software = scaled;
          }
          ByteArrayOutputStream bos = new ByteArrayOutputStream();
          software.compress(Bitmap.CompressFormat.JPEG, 45, bos);
          software.recycle();
          ref.set(Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
        } finally {
          hb.close();
          latch.countDown();
        }
      }

      @Override
      public void onFailure(int errorCode) {
        latch.countDown();
      }
    });
    try {
      latch.await(8, TimeUnit.SECONDS);
    } catch (InterruptedException ignored) {}
    return ref.get();
  }

  private boolean tapNode(AccessibilityNodeInfo n) {
    if (n == null) return false;
    return n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
  }

  private AccessibilityNodeInfo findByText(AccessibilityNodeInfo node, String text) {
    if (node == null) return null;
    CharSequence t = node.getText();
    CharSequence d = node.getContentDescription();
    if ((t != null && t.toString().equalsIgnoreCase(text)) || (d != null && d.toString().equalsIgnoreCase(text))) {
      return node;
    }
    for (int i = 0; i < node.getChildCount(); i++) {
      AccessibilityNodeInfo hit = findByText(node.getChild(i), text);
      if (hit != null) return hit;
    }
    return null;
  }

  private String dumpText(AccessibilityNodeInfo node, StringBuilder sb, int depth) {
    if (node == null || depth > 12) return sb.toString();
    if (node.getText() != null) sb.append(node.getText()).append(' ');
    for (int i = 0; i < node.getChildCount(); i++) dumpText(node.getChild(i), sb, depth + 1);
    return sb.toString();
  }
}
