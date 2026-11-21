package __PACKAGE__;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothSocket;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Android-Teil von Zetteldruck:
 *  - listPrinters / printRaw: Thermodruck über Bluetooth seriell (SPP), z. B. Phomemo M832
 *  - printPdf: Android-Druckdialog (WLAN-Drucker)
 *  - sharePdf: Teilen-Menü (Inform, E-Mail ...)
 *  - savePdf: "Speichern unter" mit festem Dateinamen
 *  - openUrl: Link im Browser öffnen (APK-Update)
 */
@CapacitorPlugin(
    name = "Zettel",
    permissions = { @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT }) }
)
public class ZettelPlugin extends Plugin {

    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    // ------------------------------------------------------------------ Bluetooth
    private boolean needsBluetoothPermission() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED;
    }

    private BluetoothAdapter adapter() {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        return manager == null ? null : manager.getAdapter();
    }

    @PluginMethod
    public void listPrinters(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothPermission");
            return;
        }
        doListPrinters(call);
    }

    @PluginMethod
    public void printRaw(PluginCall call) {
        if (needsBluetoothPermission()) {
            requestPermissionForAlias("bluetooth", call, "bluetoothPermission");
            return;
        }
        doPrintRaw(call);
    }

    @PermissionCallback
    private void bluetoothPermission(PluginCall call) {
        if (needsBluetoothPermission()) {
            call.reject("Ohne die Berechtigung „Geräte in der Nähe“ kann die App den Drucker nicht ansprechen. Bitte in den App-Einstellungen erlauben.");
            return;
        }
        if ("printRaw".equals(call.getMethodName())) doPrintRaw(call);
        else doListPrinters(call);
    }

    @SuppressLint("MissingPermission")
    private void doListPrinters(PluginCall call) {
        BluetoothAdapter adapter = adapter();
        if (adapter == null) {
            call.reject("Dieses Gerät hat kein Bluetooth.");
            return;
        }
        if (!adapter.isEnabled()) {
            call.reject("Bluetooth ist ausgeschaltet. Bitte einschalten und erneut versuchen.");
            return;
        }
        JSArray devices = new JSArray();
        try {
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            if (bonded != null) {
                for (BluetoothDevice device : bonded) {
                    JSObject o = new JSObject();
                    o.put("name", device.getName() == null ? "" : device.getName());
                    o.put("address", device.getAddress());
                    devices.put(o);
                }
            }
        } catch (SecurityException e) {
            call.reject("Bluetooth-Berechtigung fehlt.");
            return;
        }
        JSObject result = new JSObject();
        result.put("devices", devices);
        call.resolve(result);
    }

    @SuppressLint("MissingPermission")
    private void doPrintRaw(PluginCall call) {
        final String address = call.getString("address", "");
        final String data = call.getString("data", "");
        if (address == null || address.isEmpty() || data == null || data.isEmpty()) {
            call.reject("Kein Drucker gewählt oder keine Druckdaten.");
            return;
        }
        final BluetoothAdapter adapter = adapter();
        if (adapter == null || !adapter.isEnabled()) {
            call.reject("Bluetooth ist ausgeschaltet. Bitte einschalten und erneut versuchen.");
            return;
        }
        worker.execute(() -> {
            BluetoothSocket socket = null;
            try {
                byte[] bytes = Base64.decode(data, Base64.DEFAULT);
                BluetoothDevice device = adapter.getRemoteDevice(address);
                try { adapter.cancelDiscovery(); } catch (Exception ignored) { }
                socket = device.createRfcommSocketToServiceRecord(SPP);
                try {
                    socket.connect();
                } catch (IOException first) {
                    try { socket.close(); } catch (IOException ignored) { }
                    socket = device.createInsecureRfcommSocketToServiceRecord(SPP);
                    socket.connect();
                }
                OutputStream out = socket.getOutputStream();
                InputStream in = socket.getInputStream();

                String problem = queryStatus(in, out);
                if (problem != null) {
                    call.reject(problem);
                    return;
                }

                final int chunk = 4096;
                for (int off = 0; off < bytes.length; off += chunk) {
                    out.write(bytes, off, Math.min(chunk, bytes.length - off));
                }
                out.flush();
                // Dem Drucker Zeit lassen, die letzten Zeilen auszugeben, bevor die Verbindung schließt.
                Thread.sleep(3000);
                JSObject result = new JSObject();
                result.put("bytes", bytes.length);
                call.resolve(result);
            } catch (IllegalArgumentException e) {
                call.reject("Ungültige Druckeradresse oder Druckdaten.");
            } catch (SecurityException e) {
                call.reject("Bluetooth-Berechtigung fehlt.");
            } catch (IOException e) {
                call.reject("Keine Verbindung zum Drucker (" + (e.getMessage() == null ? "unbekannter Fehler" : e.getMessage()) + ").");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                call.reject("Druck abgebrochen.");
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (IOException ignored) { }
                }
            }
        });
    }

    /**
     * Fragt Deckel und Papier ab (Antworten des M832: 1A 05 98/99 = Deckel zu/offen, 1A 06 89/88 = Papier da/fehlt).
     * Liefert eine Fehlermeldung oder null (bereit bzw. keine Antwort - dann wird trotzdem gedruckt).
     */
    private String queryStatus(InputStream in, OutputStream out) throws IOException, InterruptedException {
        out.write(new byte[] { 0x1F, 0x11, 0x12, 0x1F, 0x11, 0x11 });
        out.flush();
        long deadline = SystemClock.elapsedRealtime() + 1500;
        int p2 = -1;
        int p1 = -1;
        boolean coverOpen = false;
        boolean noPaper = false;
        boolean gotCover = false;
        boolean gotPaper = false;
        while (SystemClock.elapsedRealtime() < deadline && !(gotCover && gotPaper)) {
            int available = in.available();
            if (available <= 0) {
                Thread.sleep(30);
                continue;
            }
            for (int i = 0; i < available; i++) {
                int v = in.read();
                if (v < 0) break;
                if (p2 == 0x1A && p1 == 0x05) {
                    if (v == 0x99) { coverOpen = true; gotCover = true; }
                    if (v == 0x98) { gotCover = true; }
                }
                if (p2 == 0x1A && p1 == 0x06) {
                    if (v == 0x88) { noPaper = true; gotPaper = true; }
                    if (v == 0x89) { gotPaper = true; }
                }
                p2 = p1;
                p1 = v;
            }
        }
        if (coverOpen) return "Der Deckel des Druckers ist offen.";
        if (noPaper) return "Im Drucker ist kein Papier eingelegt.";
        return null;
    }

    // ------------------------------------------------------------------ Dateien
    private static String safeName(String name, String fallback) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (n.isEmpty()) n = fallback;
        return n;
    }

    private File writeCache(String name, byte[] bytes) throws IOException {
        File dir = new File(getContext().getCacheDir(), "zettel");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Zwischenspeicher nicht verfügbar");
        File[] old = dir.listFiles();
        if (old != null) {
            long limit = System.currentTimeMillis() - 24L * 3600 * 1000;
            for (File f : old) if (f.lastModified() < limit) f.delete();
        }
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        return file;
    }

    private byte[] pdfBytes(PluginCall call) {
        String data = call.getString("data", "");
        if (data == null || data.isEmpty()) return null;
        try {
            return Base64.decode(data, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    // ------------------------------------------------------------------ Drucken (Android-Druckdialog)
    @PluginMethod
    public void printPdf(PluginCall call) {
        final byte[] bytes = pdfBytes(call);
        if (bytes == null) {
            call.reject("Keine PDF-Daten.");
            return;
        }
        final String jobName = safeName(call.getString("name", "Dokument"), "Dokument");
        final File file;
        try {
            file = writeCache(jobName + ".pdf", bytes);
        } catch (IOException e) {
            call.reject("PDF konnte nicht zwischengespeichert werden.");
            return;
        }
        final Activity activity = getActivity();
        activity.runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                if (manager == null) {
                    call.reject("Auf diesem Gerät ist kein Druckdienst vorhanden.");
                    return;
                }
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                    .build();
                manager.print(jobName, new PdfAdapter(file, jobName), attributes);
                call.resolve();
            } catch (Exception e) {
                call.reject("Der Druckdialog konnte nicht geöffnet werden.");
            }
        });
    }

    private static final class PdfAdapter extends PrintDocumentAdapter {
        private final File file;
        private final String name;

        PdfAdapter(File file, String name) {
            this.file = file;
            this.name = name;
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes, CancellationSignal signal,
                             LayoutResultCallback callback, Bundle extras) {
            if (signal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }
            PrintDocumentInfo info = new PrintDocumentInfo.Builder(name + ".pdf")
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(1)
                .build();
            callback.onLayoutFinished(info, !newAttributes.equals(oldAttributes));
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination, CancellationSignal signal,
                            WriteResultCallback callback) {
            try (InputStream in = new FileInputStream(file);
                 OutputStream out = new FileOutputStream(destination.getFileDescriptor())) {
                byte[] buffer = new byte[16 * 1024];
                int n;
                while ((n = in.read(buffer)) > 0) {
                    if (signal.isCanceled()) {
                        callback.onWriteCancelled();
                        return;
                    }
                    out.write(buffer, 0, n);
                }
                callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
            } catch (IOException e) {
                callback.onWriteFailed(e.getMessage());
            }
        }
    }

    // ------------------------------------------------------------------ Teilen
    @PluginMethod
    public void sharePdf(PluginCall call) {
        byte[] bytes = pdfBytes(call);
        if (bytes == null) {
            call.reject("Keine PDF-Daten.");
            return;
        }
        String name = safeName(call.getString("name", "Dokument.pdf"), "Dokument.pdf");
        String title = call.getString("title", "PDF");
        try {
            File file = writeCache(name, bytes);
            Context context = getContext();
            Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("application/pdf");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.putExtra(Intent.EXTRA_SUBJECT, name.replaceAll("\\.pdf$", ""));
            send.putExtra(Intent.EXTRA_TITLE, name);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Teilen ist fehlgeschlagen (" + e.getMessage() + ").");
        }
    }

    // ------------------------------------------------------------------ Speichern unter
    @PluginMethod
    public void savePdf(PluginCall call) {
        if (pdfBytes(call) == null) {
            call.reject("Keine PDF-Daten.");
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/pdf");
        intent.putExtra(Intent.EXTRA_TITLE, safeName(call.getString("name", "Dokument.pdf"), "Dokument.pdf"));
        try {
            startActivityForResult(call, intent, "saveResult");
        } catch (Exception e) {
            call.reject("Der Speichern-Dialog konnte nicht geöffnet werden.");
        }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject out = new JSObject();
        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null || data.getData() == null) {
            out.put("saved", false);
            call.resolve(out);
            return;
        }
        byte[] bytes = pdfBytes(call);
        if (bytes == null) {
            call.reject("Keine PDF-Daten.");
            return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(data.getData())) {
            if (stream == null) throw new IOException("Ziel nicht beschreibbar");
            stream.write(bytes);
            out.put("saved", true);
            call.resolve(out);
        } catch (IOException e) {
            call.reject("Speichern ist fehlgeschlagen (" + e.getMessage() + ").");
        }
    }

    // ------------------------------------------------------------------ Link öffnen
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) {
            call.reject("Ungültige Adresse.");
            return;
        }
        try {
            Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            view.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(view);
            call.resolve();
        } catch (Exception e) {
            call.reject("Kein Browser gefunden.");
        }
    }
}
