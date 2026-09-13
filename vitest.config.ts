import { defineConfig } from 'vitest/config';
import path from 'path';

// Configuracion de pruebas.
//
// Solo se incluye lib/: es donde vive la logica que se puede probar sin
// levantar un navegador ni una base de datos. Los archivos que hablan con
// Supabase quedan fuera a proposito — probarlos exigiria simular el cliente,
// y una prueba que verifica que el simulacro funciona no verifica nada.
//
// La zona horaria se fija porque varias funciones arman fechas locales a
// mano para evitar que 'YYYY-MM-DD' se interprete como UTC y se corra un dia.
// Sin fijarla, las pruebas pasarian aqui y fallarian en otra maquina.

process.env.TZ = 'America/Mexico_City';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
