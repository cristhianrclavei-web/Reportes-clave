package mx.clavei.app;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

// Servicio en primer plano: mantiene viva la app con su aviso fijo en la
// barra de notificaciones (Android lo exige para usar la ubicación en
// segundo plano) y, cuando se le pide, lee el GPS una vez por minuto.
// Fuera del horario de trabajo sigue vivo pero con el GPS apagado.
public class RastreoServicio extends Service {

    public interface Receptor {
        void alRecibir(Location ubicacion);
    }

    static final String ACCION_GPS = "mx.clavei.app.GPS";
    static final String EXTRA_ACTIVO = "activo";
    private static final String CANAL = "rastreo";
    private static final int ID_AVISO = 4107;
    private static final long CADA_MS = 60_000;

    // Mismo proceso que el plugin: basta una referencia estática.
    static Receptor receptor;
    static boolean corriendo = false;

    private FusedLocationProviderClient ubicaciones;
    private boolean gpsPrendido = false;

    private final LocationCallback alLlegar = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult resultado) {
            Location ultima = resultado.getLastLocation();
            if (ultima != null && receptor != null) receptor.alRecibir(ultima);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        ubicaciones = LocationServices.getFusedLocationProviderClient(this);
        crearCanal();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        boolean activo = intent != null && intent.getBooleanExtra(EXTRA_ACTIVO, false);
        Notification aviso = crearAviso(activo);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(ID_AVISO, aviso, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(ID_AVISO, aviso);
        }
        corriendo = true;
        if (activo) prenderGps();
        else apagarGps();
        return START_STICKY;
    }

    @SuppressLint("MissingPermission") // El plugin pide el permiso antes de iniciar el servicio.
    private void prenderGps() {
        if (gpsPrendido) return;
        LocationRequest pedido = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, CADA_MS)
            .setMinUpdateIntervalMillis(CADA_MS / 2)
            .build();
        try {
            ubicaciones.requestLocationUpdates(pedido, alLlegar, Looper.getMainLooper());
            gpsPrendido = true;
        } catch (SecurityException e) {
            gpsPrendido = false;
        }
    }

    private void apagarGps() {
        if (!gpsPrendido) return;
        ubicaciones.removeLocationUpdates(alLlegar);
        gpsPrendido = false;
    }

    @Override
    public void onDestroy() {
        apagarGps();
        corriendo = false;
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
