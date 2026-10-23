package mx.clavei.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

// Servicio en primer plano: mantiene viva la app con su aviso fijo en la
// barra de notificaciones (Android lo exige para usar la ubicación en
// segundo plano), lee el GPS una vez por minuto en horario de trabajo y
// manda los puntos directo a la base. No depende de la página web: Android
// la congela cuando la pantalla se apaga un rato, y así dejaban de llegar.
//
// La página solo le pasa (con configurar) la dirección de la base y la
// «llave de rastreo» del técnico (supabase/patch_rastreo_llave_telefono.sql).
// Cada 3 minutos pregunta a la base si es horario; sin señal, los puntos se
// guardan en el teléfono y se mandan después.
public class RastreoServicio extends Service {

    static final String EXTRA_CONFIGURAR = "configurar";
    static final String EXTRA_URL = "url";
    static final String EXTRA_APIKEY = "apikey";
    static final String EXTRA_USUARIO = "usuario";
    static final String EXTRA_LLAVE = "llave";

    private static final String TAG = "RastreoClave";
    private static final String PREFS = "rastreo";
    private static final String CANAL = "rastreo";
    private static final int ID_AVISO = 4107;
    private static final long CADA_MS = 60_000;
    // Un punto por minuto; desde los 55 s para no perder el minuto.
    private static final long SEPARACION_MINIMA_MS = 55_000;
    private static final long REVISAR_HORARIO_MIN = 3;
    // Un día de puntos de sobra; con más tiempo sin señal se tiran los viejos.
    private static final int MAXIMO_EN_COLA = 1500;
    private static final int POR_ENVIO = 300;

    private FusedLocationProviderClient ubicaciones;
    private SharedPreferences prefs;
    // Todo lo que toca la cola o la red corre en este único hilo, en orden.
    private ScheduledExecutorService trabajo;
    private boolean gpsPrendido = false;
    private long ultimoGuardadoMs = 0;
    private long ultimoEnvioMs = 0;

    private final LocationCallback alLlegar = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult resultado) {
            Location ultima = resultado.getLastLocation();
            if (ultima != null) trabajo.execute(() -> guardarPunto(ultima));
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        ubicaciones = LocationServices.getFusedLocationProviderClient(this);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        crearCanal();
        trabajo = Executors.newSingleThreadScheduledExecutor();
        trabajo.scheduleWithFixedDelay(this::revisar, REVISAR_HORARIO_MIN, REVISAR_HORARIO_MIN, TimeUnit.MINUTES);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification aviso = crearAviso(gpsPrendido);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID_AVISO, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(ID_AVISO, aviso);
        }
        // Si Android reinicia el servicio solo, el intent llega vacío y se
        // sigue con lo que quedó guardado.
        if (intent != null && intent.getBooleanExtra(EXTRA_CONFIGURAR, false)) {
            String url = intent.getStringExtra(EXTRA_URL);
            String apikey = intent.getStringExtra(EXTRA_APIKEY);
            String usuario = intent.getStringExtra(EXTRA_USUARIO);
            String llave = intent.getStringExtra(EXTRA_LLAVE);
            trabajo.execute(() -> configurar(url, apikey, usuario, llave));
        } else {
            trabajo.execute(this::revisar);
        }
        return START_STICKY;
    }

    // Al cambiar de cuenta, lo pendiente de la anterior se manda con su
    // llave antes de cambiarla; lo que no se pueda mandar se descarta para
    // no guardarlo a nombre de otra persona.
    private void configurar(String url, String apikey, String usuario, String llave) {
        String usuarioAnterior = prefs.getString(EXTRA_USUARIO, null);
        boolean otraPersona = usuarioAnterior != null && !usuarioAnterior.equals(usuario);
        if (otraPersona) {
            enviar();
            prefs.edit().remove("cola").apply();
        }
        prefs.edit()
            .putString(EXTRA_URL, url)
            .putString(EXTRA_APIKEY, apikey)
            .putString(EXTRA_USUARIO, usuario)
            .putString(EXTRA_LLAVE, llave)
            .apply();
        ultimoGuardadoMs = 0;
        revisar();
    }

    // Manda lo pendiente (o solo pregunta, si no hay) y deja el GPS como
    // diga la base. Sin señal no cambia nada y se reintenta al rato.
    private void revisar() {
        try {
            if (prefs.getString(EXTRA_LLAVE, null) == null) {
                cambiarGps(false);
                return;
            }
            Boolean activo = enviar();
            if (activo != null) cambiarGps(activo);
        } catch (Exception e) {
            Log.e(TAG, "No se pudo revisar el horario", e);
        }
    }

    private void guardarPunto(Location u) {
        long momento = u.getTime() > 0 ? u.getTime() : System.currentTimeMillis();
        if (momento - ultimoGuardadoMs < SEPARACION_MINIMA_MS) return;
        ultimoGuardadoMs = momento;
        try {
            JSONObject punto = new JSONObject();
            punto.put("registrado_en", fechaIso(momento));
            punto.put("lat", u.getLatitude());
            punto.put("lng", u.getLongitude());
            if (u.hasAccuracy()) punto.put("precision_m", Math.round(u.getAccuracy()));
            if (u.hasSpeed()) punto.put("velocidad_ms", u.getSpeed());

            JSONArray cola = leerCola();
            cola.put(punto);
            while (cola.length() > MAXIMO_EN_COLA) cola.remove(0);
            prefs.edit().putString("cola", cola.toString()).apply();
        } catch (JSONException e) {
            Log.e(TAG, "No se pudo guardar el punto", e);
            return;
        }
        if (System.currentTimeMillis() - ultimoEnvioMs >= CADA_MS) revisar();
    }

    // Devuelve si toca tener el GPS prendido (false también si la llave ya no
    // sirve), o null si no hubo respuesta. Solo quita de la cola lo que la
    // base confirmó.
    @Nullable
    private Boolean enviar() {
        String url = prefs.getString(EXTRA_URL, null);
        String apikey = prefs.getString(EXTRA_APIKEY, null);
        String llave = prefs.getString(EXTRA_LLAVE, null);
        if (url == null || apikey == null || llave == null) return null;

        ultimoEnvioMs = System.currentTimeMillis();
        JSONArray cola = leerCola();
        JSONArray lote = new JSONArray();
        for (int i = 0; i < cola.length() && i < POR_ENVIO; i++) lote.put(cola.opt(i));

        HttpURLConnection conexion = null;
        try {
            JSONObject cuerpo = new JSONObject();
            cuerpo.put("p_llave", llave);
            cuerpo.put("p_puntos", lote);

            conexion = (HttpURLConnection) new URL(url + "/rest/v1/rpc/ubicaciones_por_llave").openConnection();
            conexion.setRequestMethod("POST");
            conexion.setConnectTimeout(15_000);
            conexion.setReadTimeout(20_000);
            conexion.setDoOutput(true);
            conexion.setRequestProperty("Content-Type", "application/json");
            conexion.setRequestProperty("apikey", apikey);
            conexion.setRequestProperty("Authorization", "Bearer " + apikey);
            try (OutputStream salida = conexion.getOutputStream()) {
                salida.write(cuerpo.toString().getBytes(StandardCharsets.UTF_8));
            }
            int codigo = conexion.getResponseCode();
            if (codigo < 200 || codigo >= 300) {
                Log.e(TAG, "La base respondió " + codigo);
                return null;
            }
            String respuesta = leerTodo(conexion.getInputStream()).trim();

            // Lo que llegó mientras se enviaba se queda (solo corre este hilo,
            // así que los primeros de la cola son los enviados).
            JSONArray resto = new JSONArray();
            for (int i = lote.length(); i < cola.length(); i++) resto.put(cola.opt(i));
            prefs.edit().putString("cola", resto.toString()).apply();

            return "true".equals(respuesta);
        } catch (Exception e) {
            Log.e(TAG, "No se pudieron mandar los puntos", e);
            return null;
        } finally {
            if (conexion != null) conexion.disconnect();
        }
    }

    @SuppressLint("MissingPermission") // El plugin revisa el permiso antes de arrancar el servicio.
    private synchronized void cambiarGps(boolean activo) {
        if (activo == gpsPrendido) return;
        if (activo) {
            LocationRequest pedido = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, CADA_MS)
                .setMinUpdateIntervalMillis(CADA_MS / 2)
                .build();
            try {
                ubicaciones.requestLocationUpdates(pedido, alLlegar, Looper.getMainLooper());
                gpsPrendido = true;
            } catch (SecurityException e) {
                Log.e(TAG, "Sin permiso de ubicación", e);
                return;
            }
        } else {
            ubicaciones.removeLocationUpdates(alLlegar);
            gpsPrendido = false;
        }
        NotificationManager gestor = getSystemService(NotificationManager.class);
        if (gestor != null) gestor.notify(ID_AVISO, crearAviso(gpsPrendido));
    }

    private JSONArray leerCola() {
        try {
            return new JSONArray(prefs.getString("cola", "[]"));
        } catch (JSONException e) {
            // Cola dañada: se empieza de nuevo en vez de fallar siempre.
            return new JSONArray();
        }
    }

    private static String fechaIso(long ms) {
        SimpleDateFormat formato = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formato.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formato.format(new Date(ms));
    }

    private static String leerTodo(InputStream entrada) throws java.io.IOException {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        byte[] bloque = new byte[1024];
        int leidos;
        while ((leidos = entrada.read(bloque)) != -1) bytes.write(bloque, 0, leidos);
        return bytes.toString("UTF-8");
    }

    @Override
    public void onDestroy() {
        cambiarGps(false);
        trabajo.shutdownNow();
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel canal = new NotificationChannel(CANAL, "Ubicación en horario de trabajo", NotificationManager.IMPORTANCE_LOW);
        canal.setDescription("Aviso fijo mientras Clave comparte la ubicación con supervisión.");
        NotificationManager gestor = getSystemService(NotificationManager.class);
        if (gestor != null) gestor.createNotificationChannel(canal);
    }

    private Notification crearAviso(boolean activo) {
        Intent abrir = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent alTocar = PendingIntent.getActivity(this, 0, abrir, PendingIntent.FLAG_IMMUTABLE);
        String texto = activo
            ? "Horario de trabajo: compartiendo la ubicación con supervisión."
            : "Fuera de horario: la ubicación no se comparte.";
        return new NotificationCompat.Builder(this, CANAL)
            .setContentTitle("Clave")
            .setContentText(texto)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(alTocar)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
