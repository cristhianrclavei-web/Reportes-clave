package mx.clavei.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

// Puente entre la app web (lib/rastreoUbicacion.ts) y RastreoServicio.
//   · preparar: pide los permisos y avisa si falta el de ubicación. Se llama
//     al abrir la app, que es cuando Android deja pedirlos.
//   · configurar({ url, apikey, usuario, llave }): arranca el servicio con la
//     llave de rastreo de quien tiene la sesión (llave null = nadie: GPS
//     apagado). Desde ahí el servicio trabaja solo, sin la página.
//   · abrirAjustes: abre los ajustes de la app para dar el permiso.
//   · info: versión del APK y del teléfono.
@CapacitorPlugin(
    name = "RastreoUbicacion",
    permissions = {
        @Permission(alias = "ubicacion", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "avisos", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class RastreoUbicacionPlugin extends Plugin {

    @PluginMethod
    public void preparar(PluginCall call) {
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "ubicacion", "avisos" }, call, "alResponderPermisos");
            return;
        }
        alResponderPermisos(call);
    }

    @PermissionCallback
    private void alResponderPermisos(PluginCall call) {
        boolean permiso = getPermissionState("ubicacion") == PermissionState.GRANTED;
        if (permiso) pedirSinAhorroDeBateria();
        JSObject respuesta = new JSObject();
        respuesta.put("permiso", permiso);
        call.resolve(respuesta);
    }

    @PluginMethod
    public void configurar(PluginCall call) {
        // Sin el permiso, Android cierra la app al arrancar el servicio.
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            call.reject("Falta el permiso de ubicación", "NOT_AUTHORIZED");
            return;
        }
        Intent intento = new Intent(getContext(), RastreoServicio.class);
        intento.putExtra(RastreoServicio.EXTRA_CONFIGURAR, true);
        intento.putExtra(RastreoServicio.EXTRA_URL, call.getString("url"));
        intento.putExtra(RastreoServicio.EXTRA_APIKEY, call.getString("apikey"));
        intento.putExtra(RastreoServicio.EXTRA_USUARIO, call.getString("usuario"));
        intento.putExtra(RastreoServicio.EXTRA_LLAVE, call.getString("llave"));
        try {
            ContextCompat.startForegroundService(getContext(), intento);
            call.resolve();
        } catch (Exception e) {
            // Android no deja arrancar el servicio con la app en segundo plano:
            // se reintenta la próxima vez que se abra.
            call.reject("No se pudo arrancar el rastreo: " + e.getMessage(), "SERVICIO");
        }
    }

    // Versión instalada del APK, para «Acerca de esta app» en Mi perfil.
    @PluginMethod
    public void info(PluginCall call) {
        try {
            PackageInfo paquete = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject datos = new JSObject();
            datos.put("version", paquete.versionName);
            datos.put("compilacion", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? paquete.getLongVersionCode() : paquete.versionCode);
            datos.put("android", Build.VERSION.RELEASE);
            datos.put("modelo", Build.MANUFACTURER + " " + Build.MODEL);
            call.resolve(datos);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("No se pudo leer la versión", e);
        }
    }

    @PluginMethod
    public void abrirAjustes(PluginCall call) {
        Intent intento = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intento.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        intento.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intento);
        call.resolve();
    }

    // Sin esto, el ahorro de batería de Android duerme la app y deja de
    // mandar ubicaciones. Se pide una sola vez; el técnico solo acepta.
    private void pedirSinAhorroDeBateria() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        PowerManager energia = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        String paquete = getContext().getPackageName();
        if (energia == null || energia.isIgnoringBatteryOptimizations(paquete)) return;
        Intent intento = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intento.setData(Uri.parse("package:" + paquete));
        intento.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intento);
        } catch (Exception ignorada) {
            // Algunos teléfonos no tienen esta pantalla: se ajusta a mano.
        }
    }
}
