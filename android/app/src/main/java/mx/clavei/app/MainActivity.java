package mx.clavei.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin propio del rastreo (no viene de npm): se registra a mano.
        registerPlugin(RastreoUbicacionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
