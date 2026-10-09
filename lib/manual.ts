// Contenido del manual de uso (/ayuda). Texto plano por tema, separado por
// rol: se edita aquí sin tocar la pantalla. Cada tema es una lista de pasos
// cortos; `nota` es una aclaración que va al final.

export type TemaManual = { titulo: string; resumen: string; pasos: string[]; nota?: string };
export type SeccionManual = { titulo: string; temas: TemaManual[] };

export const MANUAL_TECNICO: SeccionManual[] = [
  {
    titulo: 'Tu día',
    temas: [
      {
        titulo: 'Ver tus servicios',
        resumen: 'Lo que tienes asignado hoy y los próximos días.',
        pasos: [
          'Entra a «Servicios». Arriba salen los pendientes y abajo los concluidos.',
          'Cuando te asignan uno nuevo, toca «Enterado» para que tu supervisor sepa que ya lo viste.',
          'Toca un servicio para ver la dirección, la descripción, el material y la lista de tareas.',
        ],
      },
      {
        titulo: 'Llegar, iniciar y concluir',
        resumen: 'Así queda registrado a qué hora llegaste y cuánto duró el trabajo.',
        pasos: [
          'En Servicios, la pestaña «Calendario» muestra tu mes: toca un día para ver lo que hiciste y lo que tienes programado.',
          'Al llegar al sitio toca «Marcar llegada».',
          'Cuando empieces a trabajar toca «Iniciar».',
          'Si tienes que detenerte (falta material, no hay acceso), usa «Pausar» y después «Reanudar».',
          'Marca las tareas conforme las termines; algunas piden foto.',
          'Para evidencias usa «Foto rápida» (abajo): abre la cámara y la foto se guarda sola. El comentario lo puedes agregar después en la lista, mientras no termines el servicio. Si no hay señal, la foto se queda guardada en el teléfono y se sube sola al volver la conexión: no cierres sesión hasta que suba.',
          'Si llegaste más de 15 minutos después de la hora acordada, la app te pregunta qué pasó (tráfico, el cliente no estaba, permisos…). Elige el motivo para continuar.',
          'Al terminar toca «Concluir» y responde cómo quedó el trabajo: terminado, pendiente o no se pudo realizar. Si no se terminó o cierras más de 15 minutos tarde, elige el motivo.',
          'Si llegaste y no hay forma de trabajar (el cliente no tiene el equipo, no hay acceso), toca «No se pudo trabajar»: elige el motivo, explica qué pasó y, si puedes, toma una foto y pide la firma de quien te atendió. El día se cierra y tu supervisor decide si queda sin reporte; mientras lo revisa no se te pide.',
          'Después haz tu reporte.',
        ],
        nota: 'Un servicio solo se puede iniciar el día que está programado. Si la fecha está mal, avísale a tu supervisor para que la cambie.',
      },
    ],
  },
  {
    titulo: 'Reportes',
    temas: [
      {
        titulo: 'Hacer un reporte',
        resumen: 'Son cuatro pasos: Datos, Trabajo, Evidencia y Firmas.',
        pasos: [
          'Toca «Nuevo reporte». Si el reporte es de un servicio asignado, elígelo arriba y se llenan solos el cliente y el personal.',
          'Datos: cliente, contacto, horas de llegada y salida, vehículo y quién fue.',
          'Trabajo: tipo de servicio, sistema, materiales usados y la descripción de lo que hiciste.',
          'Evidencia: toma o elige las fotos y marca si el servicio ya quedó concluido.',
          'Firmas: firma tú y pide la firma del cliente. Revisa la vista previa y toca «Guardar reporte».',
        ],
        nota: 'Lo que vas llenando se guarda solo en el teléfono: si se cierra la app o se recarga la página, al volver lo recuperas.',
      },
      {
        titulo: 'Si no hay señal',
        resumen: 'Puedes hacer el reporte sin internet.',
        pasos: [
          'Llena y guarda el reporte como siempre.',
          'Queda guardado en el teléfono y se sube solo cuando regresa la señal.',
          'Mientras tanto verás un aviso de «pendiente por sincronizar». No borres los datos del navegador hasta que desaparezca.',
        ],
      },
      {
        titulo: 'Si el cliente no está para firmar',
        resumen: 'El reporte se puede guardar y la firma se pide después.',
        pasos: [
          'En Firmas elige «El cliente no está» y anota el motivo.',
          'Guarda el reporte. Queda como pendiente de firma.',
          'Desde el reporte puedes mandar por WhatsApp un enlace para que el cliente firme desde su teléfono.',
        ],
      },
      {
        titulo: 'Corregir un reporte',
        resumen: 'Cuando tu supervisor te pide un cambio.',
        pasos: [
          'En «Reportes» el reporte aparece marcado para corrección, con la nota de qué hay que cambiar.',
          'Ábrelo, corrige y guarda. Conserva el mismo folio y vuelve a revisión.',
        ],
        nota: 'Por tu cuenta solo puedes editar un reporte durante los primeros 30 minutos después de guardarlo.',
      },
      {
        titulo: 'Días sin reporte',
        resumen: 'Cada día hábil debe tener un reporte o una justificación.',
        pasos: [
          'Si te falta el de algún día, verás un aviso arriba en «Reportes».',
          'Toca «Hacer reporte» o «Justificar» y elige el motivo (no saliste a servicio, vacaciones, etc.).',
        ],
      },
    ],
  },
  {
    titulo: 'Material, bitácora y solicitudes',
    temas: [
      {
        titulo: 'Pedir material al almacén',
        resumen: 'En «Insumos» pides lo que necesitas para un servicio.',
        pasos: [
          'Toca «Pedir al almacén», elige los artículos y la cantidad.',
          'Si se te vence el plazo para devolver, abre el vale y toca «Renovar plazo: pedir más días»: eliges cuántos y para qué. Mientras el almacén no responde, el vale dice «Ya pediste N día(s) más» y puedes tocar «Recordar al almacén».',
          'Cuando el almacén lo surte, firmas de recibido.',
          'La herramienta prestada se devuelve desde ahí mismo al terminar.',
        ],
      },
      {
        titulo: 'Bitácora',
        resumen: 'Para registrar lo que haces fuera de un servicio (oficina, taller, traslados).',
        pasos: [
          'Toca el tipo de actividad (traslado, compra, oficina o taller, capacitación, apoyo a cliente u otro), ponle nombre y, si aplica, el cliente. Se registran la hora y tu ubicación.',
          'Dentro de la actividad usa «Foto rápida»: abre la cámara y la foto se guarda sola; el comentario lo agregas después. Con «Pausar» detienes el tiempo y con «Concluir» la cierras.',
          '«Mi día» junta tus servicios y tus actividades en una línea de tiempo, con lo que quedó sin registrar entre ellos.',
          'Un día con actividad en la bitácora ya no te pide reporte ni justificación.',
          'Si una actividad se queda abierta, se cierra sola al terminar el día y te pide confirmar a qué hora terminaste; mientras no la confirmes, su tiempo no cuenta.',
          'Si un apoyo terminó siendo un trabajo, en la actividad ya concluida usa «Hacer un reporte con esta actividad»: el reporte abre con el cliente, las notas y las fotos ya puestas.',
        ],
      },
      {
        titulo: 'Horas extra, vacaciones y permisos',
        resumen: 'Se piden y se autorizan desde «Solicitudes».',
        pasos: [
          'Elige el tipo de solicitud, llena las fechas u horas y firma.',
          'Le llega a quien autoriza. Te avisamos cuando la aprueben, la rechacen o pidan una corrección.',
        ],
      },
    ],
  },
  {
    titulo: 'Tu cuenta',
    temas: [
      {
        titulo: 'Asistente',
        resumen: 'Pregunta por tus servicios, reportes y material, escribiendo o hablando.',
        pasos: [
          'Toca el botón redondo de la esquina inferior derecha y escribe tu pregunta, por ejemplo «¿qué servicios tengo mañana?».',
          'También te ayuda a preparar un servicio: pregunta «¿qué herramienta y equipo llevo mañana?» y revisa la lista de carga del servicio y las plantillas de la empresa; si no hay, te da una recomendación general.',
          'Los nombres en color dentro de la respuesta son enlaces: tócalos para abrir ese reporte o servicio.',
          'Con el micrófono puedes preguntar hablando; al terminar de hablar la pregunta se envía sola.',
          'El botón de la bocina activa que las respuestas se lean en voz alta.',
          'Con el botón de la imagen adjuntas fotos (la placa de un equipo, una falla) para que lea marca, modelo o número de serie.',
          'Con el cuadro de texto vacío, el botón principal abre la conversación por voz: hablas, te contesta y vuelve a escuchar.',
          'El reloj del encabezado abre tu historial por día.',
          'Para pedir material dile, por ejemplo, «necesito 100 metros de UTP y una escalera para el servicio de mañana»: arma el vale, te lo lee y al confirmar avisa al almacén.',
          'Cuando te pregunta algo con pocas respuestas, aparecen botones para contestar de un toque.',
          'Los pulgares debajo de cada respuesta sirven para decir si te ayudó.',
        ],
        nota: 'Lo único que hace además de consultar es crear el vale de material que le pidas, y siempre te pide confirmar. Ve lo mismo que tú ves en la app y, además, la dirección y los contactos de los clientes. Disponible si el paquete de tu empresa lo incluye.',
      },
      {
        titulo: 'Tu perfil',
        resumen: 'Foto o avatar, puesto, especialidades y datos de emergencia.',
        pasos: ['Toca tu nombre o tus iniciales arriba para abrir «Mi perfil».', 'Cambia lo que necesites y toca «Guardar perfil».'],
      },
      {
        titulo: 'Notificaciones',
        resumen: 'Avisos en el teléfono aunque la app esté cerrada.',
        pasos: ['Toca «Activar» en el aviso de notificaciones y acepta el permiso del navegador.', 'En iPhone primero hay que agregar la app a la pantalla de inicio.'],
      },
      {
        titulo: 'Instalar la app en el teléfono',
        resumen: 'Para abrirla como cualquier otra app.',
        pasos: ['Android (Chrome): menú ⋮ → «Agregar a pantalla principal».', 'iPhone (Safari): botón Compartir → «Agregar a inicio».'],
      },
    ],
  },
];

export const MANUAL_SUPERVISOR: SeccionManual[] = [
  {
    titulo: 'El día a día',
    temas: [
      {
        titulo: 'Resumen',
        resumen: 'Lo primero que conviene ver al entrar.',
        pasos: [
          'Arriba: reportes de hoy y de la semana, lo que falta por facturar y los avisos que piden una decisión.',
          'Abajo: las gráficas de la semana y el desempeño operativo. El botón ⓘ de cada tarjeta explica cómo se calcula.',
          '«Eficiencia de servicios» lee cada día concluido de las últimas 8 semanas como a favor, en contra o desviado por causa externa, según lo que el técnico respondió al cerrar. Muestra los motivos más frecuentes y el detalle por técnico o por cliente.',
          '«Visitas en falso» cuenta los días en que el personal llegó y no se pudo trabajar, por cliente.',
          '«En qué se va el tiempo» reparte las horas del equipo de los últimos 7 días entre servicios y lo registrado en bitácora (traslados, compras, oficina, capacitación, apoyos). Abre una actividad de «Bitácora del personal» para programar un servicio a partir de ella.',
          'La pantalla se actualiza sola cuando llega un reporte.',
        ],
      },
      {
        titulo: 'Visita sin trabajo',
        resumen: 'Cuando el técnico llegó y no se pudo trabajar, tú decides si ese día queda sin reporte.',
        pasos: [
          'Te llega el aviso «Visita sin trabajo: revisar». Abre el servicio: verás el motivo, lo que explicó el técnico, la foto y quién lo atendió.',
          '«Liberar del reporte»: ese día deja de exigir reporte y se cortan los recordatorios. «Sí requiere reporte»: vuelve a exigirse y el técnico recibe tu explicación.',
          '«Reprogramar» crea un servicio nuevo con el mismo cliente, técnicos, horario y las tareas que quedaron sin hacer.',
          '«Hoja de visita» genera la constancia en PDF (llegada, motivo, foto y firma) para el cliente o para cobrar la visita.',
          'Si el técnico cerró el día de otra forma pero no se trabajó, en el servicio concluido aparece «No se trabajó: liberar este día del reporte».',
        ],
        nota: 'Solo los supervisores pueden liberar un día del reporte. Queda registrado en Eventos quién lo hizo.',
      },
      {
        titulo: 'Tablero del día',
        resumen: 'Servicios → Hoy: quién está en dónde, en vivo.',
        pasos: [
          'En computadora puedes verlo por servicio o por persona. En celular la gente va agrupada: requieren atención, en campo, por iniciar, concluyeron y disponibles.',
          'Toca a una persona o un servicio para ver el detalle y hacer un cambio en el día.',
          'Usa los botones de cuadrilla para ver solo a un grupo, o «Mis cuadrillas» si tienes alguna a tu cargo.',
          '«Asignar servicio» agenda uno rápido para hoy.',
        ],
      },
      {
        titulo: 'Agendar servicios',
        resumen: 'Desde Servicios → Agendados o desde la Agenda.',
        pasos: [
          'Toca «Agendar», elige el cliente, la fecha, la hora y a quién va (personas o una cuadrilla completa).',
          'Puedes cargar una rutina de tareas y una lista de herramienta y material.',
          'Los servicios de varios días se agendan como un solo proyecto.',
          'La Agenda abre en «Mes»: cada día muestra puntos de lo hecho, lo que viene y lo que quedó sin concluir. Toca un día para ver su detalle al lado y usa «Programar servicio este día» para agendar ahí.',
          'En «Semana» ves la semana de todo el equipo; con «+» asignas a una persona en un día.',
        ],
        nota: 'En Agenda → Recurrentes dejas programados los mantenimientos periódicos: la app te avisa 14 días antes para agendarlos.',
      },
      {
        titulo: 'Cambiar, cancelar o ampliar un servicio',
        resumen: 'Todo desde el detalle del servicio.',
        pasos: [
          '«Cambiar fecha» lo mueve de día; «Cancelar servicio» lo deja en el historial con el motivo.',
          '«Reasignar» cambia al personal y «Ampliar a más días» lo convierte en proyecto.',
          'Cada cambio queda registrado en Actividad.',
        ],
      },
    ],
  },
  {
    titulo: 'Reportes',
    temas: [
      {
        titulo: 'Revisar y aprobar',
        resumen: 'Un reporte está completo cuando lleva la firma de revisión.',
        pasos: [
          'En Reportes abre uno para ver datos, fotos y firmas, y descargar su PDF.',
          'En la pestaña «Revisión» lo apruebas con tu firma o pides una corrección con una nota para el técnico.',
          'Al concluir el servicio el reporte queda «pendiente de facturar». Se quita solo cuando el reporte entra en una factura; si no se va a cobrar, quien factura registra el motivo en «No se va a facturar».',
        ],
      },
      {
        titulo: 'Control y cobertura',
        resumen: 'Quién entregó su reporte y quién no.',
        pasos: [
          '«Control» muestra por persona los días pendientes y qué tan puntual entrega.',
          '«Cobertura» es el calendario: cada día hábil debe tener reporte o justificación.',
          'Puedes justificar un día por alguien y marcar días festivos.',
        ],
        nota: 'La app le recuerda al técnico a las 6 de la tarde y a las 9 de la mañana siguiente si le falta un reporte.',
      },
      {
        titulo: 'Firma del cliente a distancia',
        resumen: 'Cuando el cliente no estaba en el sitio.',
        pasos: ['Abre el reporte pendiente de firma y toca «Compartir».', 'Se manda un enlace por WhatsApp; el cliente firma desde su teléfono y el reporte se actualiza solo.'],
      },
    ],
  },
  {
    titulo: 'Clientes, cotizaciones y facturación',
    temas: [
      {
        titulo: 'Clientes y proyectos',
        resumen: 'El expediente de cada cliente.',
        pasos: [
          'En Clientes ves sus datos, contactos, proyectos por sistema y todos sus reportes.',
          'Si un técnico escribe un cliente nuevo queda «Por revisar»: confírmalo o únelo con uno existente desde «Duplicados».',
        ],
      },
      {
        titulo: 'Cotizaciones',
        resumen: 'Armarlas, compartirlas y darles seguimiento.',
        pasos: [
          'En «Nueva cotización» agrega las partidas por grupo; el total con IVA se calcula solo.',
          'Descarga el PDF o compártelo. Cambia el estado conforme avance: enviada, aprobada, rechazada.',
          'Puedes copiar una cotización existente para no empezar de cero.',
        ],
      },
      {
        titulo: 'Facturación',
        resumen: 'Disponible para quien tiene ese permiso.',
        pasos: [
          'En Cotizaciones, Facturas y los proyectos de un cliente, el interruptor «Lista / Tablero» cambia a columnas por estado. Arrastra una tarjeta a otra columna para cambiar su estado; en celular usa «Mover a…». Lo que pide un paso propio no se salta arrastrando: una cotización se aprueba con firma y una factura se timbra registrando su folio fiscal (el tablero te lleva ahí).',
          '«Por facturar» lista, por cliente, los reportes de servicios concluidos que no están en ninguna factura. «Armar factura» abre la prefactura con ese cliente y sus reportes ya elegidos; quita los que no correspondan.',
          'Arma la prefactura con los reportes y conceptos a facturar. Los reportes quedan ligados a la factura y dejan de aparecer como pendientes.',
          'Si un reporte no se va a facturar (garantía, cortesía, póliza), ábrelo y usa «No se va a facturar»: deja de aparecer como pendiente y ya no se ofrece al armar facturas. Se puede revertir.',
          'Cuando se timbre fuera de la app, registra aquí el folio fiscal y, después, el pago.',
        ],
        nota: 'La app no timbra por sí sola: lleva el control de lo facturado y lo pendiente.',
      },
    ],
  },
  {
    titulo: 'Almacén y personal',
    temas: [
      {
        titulo: 'Almacén',
        resumen: 'Existencias, vales y equipo instalado.',
        pasos: [
          '«Vales»: lo que pide el personal para sus servicios; se surte y se firma de recibido.',
          'Cuando alguien pide más días para devolver, el vale sale en «Piden más días»: ábrelo y aprueba o rechaza. Al aprobar, los días cuentan desde hoy si el plazo ya estaba vencido.',
          '«Existencias» y «Movimientos»: lo que hay y lo que entró o salió. «Entrada» da de alta material nuevo.',
          '«Ubicaciones» y «Conteo» sirven para ordenar el almacén y hacer inventario con etiquetas QR.',
          '«Instalados» guarda qué equipo quedó en cada cliente.',
        ],
      },
      {
        titulo: 'Personal y cuadrillas',
        resumen: 'El equipo, sus grupos y sus solicitudes.',
        pasos: [
          '«Equipo» muestra a cada persona con su puesto y especialidades.',
          '«Cuadrillas» agrupa al personal; cada una puede tener un líder y un supervisor a cargo.',
          '«Solicitudes» es donde autorizas horas extra, vacaciones y permisos.',
        ],
      },
      {
        titulo: 'Usuarios',
        resumen: 'Altas, roles, permisos y bajas (con permiso de administrar usuarios).',
        pasos: [
          '«Nuevo usuario» crea la cuenta con una contraseña temporal; la persona la cambia al entrar.',
          'Desde su ficha cambias el rol, los permisos o la das de baja.',
          'Una cuenta con historial no se elimina: se da de baja para conservar sus reportes.',
        ],
      },
    ],
  },
  {
    titulo: 'Tu cuenta',
    temas: [
      {
        titulo: 'Asistente',
        resumen: 'Consulta la operación con una pregunta, escribiendo o hablando.',
        pasos: [
          'Toca el botón redondo de la esquina inferior derecha y pregunta, por ejemplo «¿en qué servicio se instaló la cámara DS-2CD1043G2?» o «¿qué servicios de esta semana siguen sin reporte?».',
          'Responde sobre reportes, equipos instalados, servicios, almacén, vales, clientes, cotizaciones y mantenimientos recurrentes.',
          'Con el micrófono puedes preguntar hablando; el botón de la bocina hace que lea las respuestas en voz alta.',
          'Los folios y nombres en color son enlaces: tócalos para abrir ese reporte, servicio o cotización.',
          'Con el botón de la imagen adjuntas hasta 3 fotos (la placa de un equipo, una falla) para que lea marca, modelo o número de serie.',
          'Con el cuadro de texto vacío, el botón principal abre la conversación por voz: hablas, te contesta en voz alta y vuelve a escuchar. Toca el círculo para interrumpirlo; en el botón de ajustes eliges la voz.',
          'El reloj del encabezado abre el historial por día; el lápiz empieza una conversación nueva sin borrar lo anterior.',
          'Si lo abres dentro de una cotización, un servicio, un reporte o un cliente, sabe cuál estás viendo: puedes decir «súbele el margen a esta» o «¿qué más le hemos hecho a este cliente?».',
          'Cuando pregunta algo con pocas respuestas aparecen botones para contestar de un toque, y los pulgares debajo de cada respuesta sirven para decir si ayudó.',
          'También da apoyo técnico: cómo preparar un mantenimiento, qué llevar o cómo configurar un equipo. Primero usa las listas de carga y plantillas de la empresa y, si hace falta, busca en internet y dice de qué sitio lo tomó.',
        ],
        nota: 'Lo que puede hacer además de consultar: agendar, reprogramar o cancelar servicios y crear o modificar borradores de cotización; siempre te pide confirmar antes y no borra nada. Hay un tope de preguntas por persona al día. Incluido en el paquete Empresa.',
      },
      {
        titulo: 'Programar un servicio con el asistente',
        resumen: 'Dile qué, cuándo y con quién; él lo agenda.',
        pasos: [
          'Pídele, por ejemplo, «programa un preventivo de CCTV en Plaza Arboleda el viernes a las 9 con Jorge».',
          'Te pregunta lo que falte, revisa si los técnicos están libres ese día y te ofrece la lista de tareas de la plantilla.',
          'Te muestra el resumen; al confirmarlo agenda el servicio, avisa a los técnicos y te da el enlace para abrirlo.',
        ],
        nota: 'También puede reprogramar (fecha y horario), cambiar los técnicos asignados o cancelar un servicio que no ha empezado: te dice el cambio y te pide confirmar.',
      },
      {
        titulo: 'Cotizar con el asistente',
        resumen: 'Te hace las preguntas necesarias y deja la cotización como borrador.',
        pasos: [
          'Pídele, por ejemplo, «cotiza un sistema fotovoltaico de 16 paneles». Te pregunta el cliente y los datos técnicos que falten.',
          'Te pregunta si el margen de ganancia va igual para todos los conceptos o si lo marcas tú a mano.',
          'Toma precios de cotizaciones anteriores y del almacén (y de SYSCOM cuando esté conectado). Lo que no encuentra lo marca «por confirmar».',
          'Te muestra el resumen; al confirmarlo guarda el borrador y te da el enlace para abrirlo.',
          'Para corregir el borrador puedes pedírselo: «en la COT-0016 cambia el inversor por uno de 6 kW» o «súbele el margen a 20%».',
          'Abre el borrador, revisa partidas y precios, ajusta lo necesario y entonces apruébalo.',
        ],
        nota: 'El borrador muestra el aviso «Cotización generada por IA»: solo se ve en la app, no en el PDF del cliente.',
      },
      {
        titulo: 'Buscar rápido',
        resumen: 'Para saltar a una sección o a un cliente.',
        pasos: ['Usa el buscador de arriba (Ctrl + K en computadora) y escribe el nombre.'],
      },
      {
        titulo: 'Tema, vista y notificaciones',
        resumen: 'Ajustes personales.',
        pasos: [
          'El botón de sol o luna cambia entre tema claro y oscuro.',
          'En «Mi perfil → Color de la app» eliges el color de los botones y resaltados (original, verde o azul, morado, terracota). Se guarda en tu cuenta y te sigue en tus otros dispositivos; el logo y los documentos conservan el color de la marca.',
          'En computadora, el botón de al lado cambia las listas entre tarjetas y tabla. La misma opción está en el menú de tu cuenta («Ver listas como tabla»), también para el personal técnico.',
          'Activa las notificaciones para recibir avisos aunque la app esté cerrada.',
        ],
      },
      {
        titulo: 'Suscripción',
        resumen: 'Tu paquete y los días que quedan.',
        pasos: ['En Mi perfil → Suscripción ves el plan actual, los paquetes y los pagos registrados.'],
      },
    ],
  },
];
