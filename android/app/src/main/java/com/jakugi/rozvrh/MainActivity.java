package com.jakugi.rozvrh;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * The web app in a WebView of its own: no browser UI, no zoom, the system bars in the app's
 * colours. The page stays the same site (sign-in, data and updates come from the web).
 */
public class MainActivity extends Activity {
    static final int REQUEST_NOTIFICATIONS = 1;

    private FrameLayout root;
    private View navScrim;
    private WebView web;
    private View offline;
    private String host;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        host = Uri.parse(BuildConfig.APP_URL).getHost();

        root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.paper));
        web = new WebView(this);
        web.setBackgroundColor(getColor(R.color.paper));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        navScrim = new View(this);
        root.addView(navScrim, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, Gravity.BOTTOM));
        setContentView(root);
        edgeToEdge();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        // an app, not a page: no pinch or double-tap zoom, and the system font size doesn't break the layout
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(false);
        s.setUserAgentString(s.getUserAgentString() + " RozvrhAndroid/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new AppBridge(this), "RozvrhAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (host.equals(uri.getHost())) return false;
                openExternal(uri.toString());
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showOffline(true);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                CookieManager.getInstance().flush();
            }
        });
        web.setDownloadListener((url, userAgent, disposition, mime, length) -> openExternal(url));

        if (state != null) web.restoreState(state);
        else web.loadUrl(BuildConfig.APP_URL);
    }

    /** Draw behind the status and navigation bars and pad the page by their size (and the keyboard's). */
    private void edgeToEdge() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            getWindow().setDecorFitsSystemWindows(false);
        } else {
            root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int left, top, right, bottom, bars;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets sys = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                left = sys.left;
                top = sys.top;
                right = sys.right;
                bars = sys.bottom;
                bottom = Math.max(sys.bottom, ime.bottom);
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
                bars = bottom;
            }
            FrameLayout.LayoutParams page = (FrameLayout.LayoutParams) web.getLayoutParams();
            page.setMargins(left, top, right, bottom);
            web.setLayoutParams(page);
            ViewGroup.LayoutParams scrim = navScrim.getLayoutParams();
            scrim.height = bottom == bars ? bars : 0;
            navScrim.setLayoutParams(scrim);
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
    }

    /** Colours behind the status bar (top) and the navigation bar (bottom), from the page's theme. */
    void setBars(int top, int bottom, boolean dark) {
        root.setBackgroundColor(top);
        navScrim.setBackgroundColor(bottom);
        web.setBackgroundColor(top);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(dark ? 0 : light, light);
            }
        } else {
            int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            if (!dark) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            root.setSystemUiVisibility(flags);
        }
    }

    void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (ActivityNotFoundException ignored) {
            // nothing can open it
        }
    }

    void requestNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] {android.Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
        } else {
            notifyPage();
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQUEST_NOTIFICATIONS) notifyPage();
    }

    /** tells the page the notification permission may have changed */
    private void notifyPage() {
        web.evaluateJavascript("window.dispatchEvent(new Event('rozvrh-notifications'))", null);
    }

    private void showOffline(boolean show) {
        if (show && offline == null) {
            LinearLayout box = new LinearLayout(this);
            box.setOrientation(LinearLayout.VERTICAL);
            box.setGravity(Gravity.CENTER);
            box.setPadding(64, 64, 64, 64);
            box.setBackgroundColor(getColor(R.color.paper));
            TextView title = new TextView(this);
            title.setText(R.string.offline_title);
            title.setTextSize(22);
            title.setTextColor(getColor(R.color.ink));
            title.setGravity(Gravity.CENTER);
            TextView text = new TextView(this);
            text.setText(R.string.offline_text);
            text.setTextSize(16);
            text.setTextColor(Color.parseColor("#6B7590"));
            text.setGravity(Gravity.CENTER);
            text.setPadding(0, 24, 0, 48);
            Button retry = new Button(this);
            retry.setText(R.string.offline_retry);
            retry.setOnClickListener(v -> {
                showOffline(false);
                web.loadUrl(BuildConfig.APP_URL);
            });
            box.addView(title);
            box.addView(text);
            box.addView(retry);
            offline = box;
            root.addView(box, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        } else if (!show && offline != null) {
            root.removeView(offline);
            offline = null;
        }
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // the page closes its open dialog first; then back goes through the page's history
        web.evaluateJavascript("window.__rozvrhBack ? window.__rozvrhBack() : false", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onPause() {
        web.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
