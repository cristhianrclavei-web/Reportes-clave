package mx.clavei.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
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
//   · preparar: pide los permisos, arranca el servicio (con el GPS apagado)
//     y deja abierta la vía por la que llegan las ubicaciones. Se llama al
//     abrir la app, que es cuando Android deja arrancar el servicio.
//   · gps({ activo }): prende o apaga el GPS según el horario de trabajo.
//   · abrirAjustes: abre los ajustes de la app para dar el permiso.
@CapacitorPlugin(
    name = "RastreoUbicacion",
    permissions = {
        @Permission(alias = "ubicacion", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "avisos", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class RastreoUbicacionPlugin extends Plugin {

    private PluginCall llamadaAbierta;

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    public void preparar(PluginCall call) {
        call.setKeepAlive(true);
        if (llamadaAbierta != null) llamadaAbierta.release(getBridge());
        llamadaAbierta = call;
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            requestPermissionForAliases(new String[] { "ubicacion", "avisos" }, call, "alResponderPermisos");
            return;
        }
        arrancar(call);
    }

    @PermissionCallback
    private void alResponderPermisos(PluginCall call) {
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            JSObject error = new JSObject();
            error.put("error", "NOT_AUTHORIZED");
            call.resolve(error);
            return;
        }
        arrancar(call);
    }

    private void arrancar(PluginCall call) {
        RastreoServicio.receptor = (Location u) -> {
            JSObject datos = new JSObject();
            datos.put("latitude", u.getLatitude());
            datos.put("longitude", u.getLongitude());
            datos.put("accuracy", u.hasAccuracy() ? u.getAccuracy() : null);
            datos.put("speed", u.hasSpeed() ? u.getSpeed() : null);
            datos.put("time", u.getTime());
            if (llamadaAbierta != null) llamadaAbierta.resolve(datos);
        };
        enviarAlServicio(false);
        pedirSinAhorroDeBateria();
        JSObject listo = new JSObject();
        listo.put("listo", true);
        call.resolve(listo);
    }

    @PluginMethod
    public void gps(PluginCall call) {
        boolean activo = Boolean.TRUE.equals(call.getBoolean("activo", false));
        if (getPermissionState("ubicacion") != PermissionState.GRANTED) {
            call.reject("Falta el permiso de ubicación", "NOT_AUTHORIZED");
            return;
        }
        try {
            enviarAlServicio(activo);
            call.resolve();
        } catch (Exception e) {
            // Android no deja arrancar el servicio con la app en segundo plano:
            // se reintenta la próxima vez que se abra.
            call.reject("No se pudo cambiar el GPS: " + e.getMessage(), "SERVICIO");
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

    private void enviarAlServicio(boolean activo) {
        Intent intento = new Intent(getContext(), RastreoServicio.class);
        intento.putExtra(RastreoServicio.EXTRA_ACTIVO, activo);
        ContextCompat.startForegroundService(getContext(), intento);
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
